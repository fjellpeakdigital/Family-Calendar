/* ============================================================
   auth.js — Google Identity Services Token Client
   ============================================================
   Multi-account support. Dashboard shows when ANY account is
   connected — Kayla does not need to be signed in for Chris's
   calendar to appear.

   Uses GIS initTokenClient (implicit-style, no client_secret
   needed). Tokens are stored as fd_tok_{accountKey}.
   ============================================================ */

window.Auth = (() => {

  // ── Key helpers ───────────────────────────────────────────
  function accountKey(email) {
    return email.replace(/[^a-zA-Z0-9]/g, '_');
  }

  function storageKey(email) {
    return `fd_tok_${accountKey(email)}`;
  }

  // ── Token Storage ─────────────────────────────────────────
  function saveToken(tok) {
    localStorage.setItem(storageKey(tok.email), JSON.stringify(tok));
  }

  function getToken(email) {
    try { return JSON.parse(localStorage.getItem(storageKey(email))); }
    catch { return null; }
  }

  function getAllTokens() {
    const tokens = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('fd_tok_')) continue;
      try {
        const t = JSON.parse(localStorage.getItem(key));
        if (t && t.email) tokens.push(t);
      } catch {}
    }
    return tokens;
  }

  function clearToken(email) {
    localStorage.removeItem(storageKey(email));
    renderAuthPills();
    checkReauthNeeded();
  }

  // ── Token Validation ──────────────────────────────────────
  function isValid(tok) {
    return !!(tok && tok.access_token && tok.expires_at > Date.now() + 60_000);
  }

  function getValidTokens() {
    return getAllTokens().filter(isValid);
  }

  // Dashboard shows if ANY account is connected
  function anyConnected() {
    return getValidTokens().length > 0;
  }

  // ── Authenticated Fetch ───────────────────────────────────
  async function apiFetch(tok, url) {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${tok.access_token}` }
    });
    if (resp.status === 401) throw new Error('TOKEN_EXPIRED');
    return resp;
  }

  // ── Wait for GIS library ──────────────────────────────────
  function waitForGIS() {
    return new Promise(resolve => {
      if (window.google?.accounts?.oauth2) { resolve(); return; }
      const iv = setInterval(() => {
        if (window.google?.accounts?.oauth2) { clearInterval(iv); resolve(); }
      }, 100);
    });
  }

  // ── Sign In (connect a new account or reconnect existing) ─
  // hintEmail: pre-selects a specific account; null = user picks
  async function signIn(hintEmail = null) {
    await waitForGIS();

    return new Promise((resolve) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        // Include email/profile so we can identify the account via userinfo
        scope:     'https://www.googleapis.com/auth/calendar.readonly openid email profile',
        hint:      hintEmail || undefined,
        callback:  async (tokenResponse) => {
          if (tokenResponse.error) {
            console.error('GIS token error:', tokenResponse);
            resolve(false);
            return;
          }

          // Fetch userinfo to learn the email / display name
          try {
            const infoResp = await fetch(
              'https://www.googleapis.com/oauth2/v3/userinfo',
              { headers: { Authorization: `Bearer ${tokenResponse.access_token}` } }
            );
            if (!infoResp.ok) {
              console.error('userinfo returned', infoResp.status);
              resolve(false);
              return;
            }
            const info = await infoResp.json();
            if (!info.email) {
              console.error('userinfo missing email:', info);
              resolve(false);
              return;
            }
            const tok = {
              access_token: tokenResponse.access_token,
              expires_at:   Date.now() + (tokenResponse.expires_in - 60) * 1000,
              email:        info.email,
              name:         info.name || info.email,
              accountKey:   accountKey(info.email),
            };
            saveToken(tok);
            console.log(`Auth OK for ${info.email}`);

            // Update UI wherever it's rendered
            _updateSetupUI();
            renderAuthPills();
            checkReauthNeeded();

            resolve(tok);
          } catch (e) {
            console.error('userinfo fetch failed:', e);
            resolve(false);
          }
        },
        error_callback: (err) => {
          console.error('GIS error:', err);
          resolve(false);
        },
      });

      client.requestAccessToken({
        // Force account picker for new accounts; silent for known emails
        prompt: hintEmail ? '' : 'select_account',
      });
    });
  }

  // ── Silent Refresh ────────────────────────────────────────
  async function silentReauth(email) {
    await waitForGIS();
    return new Promise((resolve) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        scope:     'https://www.googleapis.com/auth/calendar.readonly openid email profile',
        hint:      email,
        callback:  async (tokenResponse) => {
          if (tokenResponse.error) {
            console.warn(`Silent re-auth failed for ${email}:`, tokenResponse.error);
            checkReauthNeeded();
            resolve(false);
            return;
          }
          const existing = getToken(email);
          saveToken({
            access_token: tokenResponse.access_token,
            expires_at:   Date.now() + (tokenResponse.expires_in - 60) * 1000,
            email:        existing?.email || email,
            name:         existing?.name  || email,
            accountKey:   accountKey(email),
          });
          renderAuthPills();
          resolve(true);
        },
        error_callback: (err) => {
          console.warn(`Silent re-auth error for ${email}:`, err);
          checkReauthNeeded();
          resolve(false);
        },
      });
      client.requestAccessToken({ prompt: '' });
    });
  }

  // Proactively refresh tokens expiring within 10 min
  function startSilentRefreshLoop() {
    setInterval(async () => {
      for (const tok of getAllTokens()) {
        if (!tok.email) continue;
        const expiresIn = tok.expires_at - Date.now();
        if (expiresIn > 0 && expiresIn < 10 * 60_000) {
          await silentReauth(tok.email);
        }
      }
      checkReauthNeeded();
    }, 5 * 60_000);
  }

  // ── Migration from old auth_token_N format ────────────────
  function migrateOldTokens() {
    const owners = CONFIG.CALENDAR_OWNERS || [];
    owners.forEach((owner, idx) => {
      const oldKey = `auth_token_${idx}`;
      const raw = localStorage.getItem(oldKey);
      if (!raw) return;
      try {
        const tok = JSON.parse(raw);
        if (tok?.access_token && tok?.expires_at) {
          saveToken({
            access_token: tok.access_token,
            expires_at:   tok.expires_at,
            email:        tok.email || owner.email,
            name:         tok.name  || owner.name,
            accountKey:   accountKey(tok.email || owner.email),
          });
          console.log(`Migrated auth token for ${owner.email}`);
        }
      } catch {}
      localStorage.removeItem(oldKey);
    });
  }

  // ── Setup Splash UI ───────────────────────────────────────
  function _updateSetupUI() {
    const container = document.getElementById('setup-users');
    if (!container) return;

    const tokens = getAllTokens();
    container.innerHTML = '';

    if (tokens.length === 0) {
      const p = document.createElement('p');
      p.style.cssText = 'color:var(--text-secondary);text-align:center;margin:16px 0';
      p.textContent = 'No accounts connected yet.';
      container.appendChild(p);
    } else {
      tokens.forEach(tok => {
        const valid = isValid(tok);
        const card = document.createElement('div');
        card.className = `setup-user-card${valid ? ' connected' : ''}`;
        card.innerHTML = `
          <div style="font-size:40px;line-height:1">${escapeHtml((tok.name || tok.email).charAt(0).toUpperCase())}</div>
          <div class="setup-user-name">${escapeHtml(tok.name || tok.email)}</div>
          <div class="setup-status ${valid ? 'ok' : ''}">${valid ? '✓ Connected' : escapeHtml(tok.email)}</div>
          <button class="btn ${valid ? 'btn-outline btn-sm' : 'btn-primary'}"
                  onclick="Auth.signIn('${escapeHtml(tok.email)}')">
            ${valid ? 'Reconnect' : 'Sign In'}
          </button>
        `;
        container.appendChild(card);
      });
    }

    _updateContinueButton();
  }

  function renderSetupSplash() { _updateSetupUI(); }

  function _updateContinueButton() {
    const btn = document.getElementById('setup-continue');
    if (btn) btn.style.display = anyConnected() ? 'inline-flex' : 'none';
  }

  function finishSetup() {
    const splash = document.getElementById('setup-splash');
    if (!splash) return;
    splash.classList.add('hidden');
    setTimeout(() => {
      splash.style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      window.App && window.App.init();
    }, 500);
  }

  // ── Auth Pills in Header ───────────────────────────────────
  function renderAuthPills() {
    const container = document.getElementById('auth-pills');
    if (!container) return;
    container.innerHTML = '';

    getAllTokens().forEach(tok => {
      const valid       = isValid(tok);
      const expiringSoon = tok.expires_at > Date.now() &&
                           tok.expires_at < Date.now() + 10 * 60_000;

      const pill = document.createElement('div');
      pill.className = 'auth-pill';
      pill.title = valid
        ? `${tok.name || tok.email} — connected`
        : `${tok.name || tok.email} — tap to reconnect`;
      pill.innerHTML = `
        <span class="dot ${valid ? (expiringSoon ? 'warn' : 'ok') : 'err'}"></span>
        <span>${escapeHtml(tok.name || tok.email)}</span>
      `;
      if (!valid) pill.addEventListener('click', () => signIn(tok.email));
      container.appendChild(pill);
    });
  }

  // ── Reauth Banner ─────────────────────────────────────────
  function checkReauthNeeded() {
    const expired = getAllTokens().filter(t => !isValid(t));
    const banner  = document.getElementById('reauth-banner');
    if (!banner) return;

    if (expired.length > 0) {
      const names = expired.map(t => t.name || t.email).join(' & ');
      const msg   = document.getElementById('reauth-message');
      if (msg) msg.textContent = `Calendar session expired for ${names} — tap to sign in again`;
      banner.classList.add('visible');
      banner.onclick = () => signIn(expired[0].email);
    } else {
      banner.classList.remove('visible');
    }
    renderAuthPills();
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    migrateOldTokens();

    if (anyConnected()) {
      document.getElementById('setup-splash').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      // app.js DOMContentLoaded boots App.init()
    } else {
      _updateSetupUI();
      document.getElementById('setup-splash').style.display = 'flex';
    }

    startSilentRefreshLoop();
  }

  return {
    init, signIn, silentReauth, clearToken, finishSetup,
    getAllTokens, getValidTokens, isValid, anyConnected, apiFetch,
    renderAuthPills, checkReauthNeeded, renderSetupSplash,
  };
})();

document.addEventListener('DOMContentLoaded', () => Auth.init());
