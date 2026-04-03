/* ============================================================
   auth.js — Google Identity Services Token Client
   ============================================================
   Uses google.accounts.oauth2.initTokenClient (implicit-style),
   which works from pure client-side JS with no client_secret.
   Tokens are short-lived (~1 hr); the user is prompted to
   re-auth when they expire.
   ============================================================ */

window.Auth = (() => {
  // ── Token Storage ─────────────────────────────────────────
  function tokenKey(idx) { return `auth_token_${idx}`; }

  function saveToken(idx, tokenObj) {
    localStorage.setItem(tokenKey(idx), JSON.stringify(tokenObj));
  }

  function loadToken(idx) {
    try { return JSON.parse(localStorage.getItem(tokenKey(idx))); }
    catch { return null; }
  }

  function isTokenValid(tok) {
    if (!tok || !tok.access_token) return false;
    return tok.expires_at > Date.now() + 60_000; // 1-min buffer
  }

  // ── Wait for GIS library ──────────────────────────────────
  function waitForGIS() {
    return new Promise(resolve => {
      if (window.google?.accounts?.oauth2) { resolve(); return; }
      const interval = setInterval(() => {
        if (window.google?.accounts?.oauth2) { clearInterval(interval); resolve(); }
      }, 100);
    });
  }

  // ── Request a token for one owner ─────────────────────────
  async function startAuth(idx) {
    await waitForGIS();

    const owner = CONFIG.CALENDAR_OWNERS[idx];

    return new Promise((resolve) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id:    CONFIG.GOOGLE_CLIENT_ID,
        scope:        'https://www.googleapis.com/auth/calendar.readonly',
        hint:         owner.email,
        callback: (tokenResponse) => {
          if (tokenResponse.error) {
            console.error('GIS token error:', tokenResponse);
            resolve(false);
            return;
          }

          saveToken(idx, {
            access_token: tokenResponse.access_token,
            expires_at:   Date.now() + (tokenResponse.expires_in - 60) * 1000,
            email:        owner.email,
            name:         owner.name,
          });

          console.log(`Auth OK for ${owner.name}`);

          // Update setup UI if visible
          updateSetupCard(idx, true);
          updateContinueButton();

          // Update header pill if app is running
          renderAuthPills();
          checkReauthNeeded();

          resolve(true);
        },
        error_callback: (err) => {
          console.error('GIS error callback:', err);
          resolve(false);
        },
      });

      client.requestAccessToken({ prompt: allConnected() ? '' : 'consent' });
    });
  }

  // ── Silent token refresh ──────────────────────────────────
  // Called proactively before a token expires. Uses prompt:'' so
  // Google skips the consent/account-chooser UI when the browser
  // still has an active Google session — the callback fires
  // silently and the new token is saved without user interaction.
  // Falls back to showing the reauth banner if the session is gone.
  async function silentReauth(idx) {
    await waitForGIS();
    const owner = CONFIG.CALENDAR_OWNERS[idx];
    console.log(`Silent re-auth attempt for ${owner.name}…`);

    return new Promise((resolve) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id:    CONFIG.GOOGLE_CLIENT_ID,
        scope:        'https://www.googleapis.com/auth/calendar.readonly',
        hint:         owner.email,
        callback: (tokenResponse) => {
          if (tokenResponse.error) {
            console.warn(`Silent re-auth failed for ${owner.name}:`, tokenResponse.error);
            checkReauthNeeded(); // surface banner if truly expired
            resolve(false);
            return;
          }
          saveToken(idx, {
            access_token: tokenResponse.access_token,
            expires_at:   Date.now() + (tokenResponse.expires_in - 60) * 1000,
            email:        owner.email,
            name:         owner.name,
          });
          console.log(`Silent re-auth OK for ${owner.name}`);
          renderAuthPills();
          resolve(true);
        },
        error_callback: (err) => {
          console.warn(`Silent re-auth error for ${owner.name}:`, err);
          checkReauthNeeded();
          resolve(false);
        },
      });

      // prompt:'' → skip consent/account-chooser if session still valid
      client.requestAccessToken({ prompt: '' });
    });
  }

  // Checks every 5 min; if a token expires within 10 min, silently refreshes it.
  function startSilentRefreshLoop() {
    setInterval(async () => {
      for (let i = 0; i < CONFIG.CALENDAR_OWNERS.length; i++) {
        const tok = loadToken(i);
        if (!tok) continue;
        const expiresIn = tok.expires_at - Date.now();
        // Refresh if expiring within 10 minutes but not already expired
        if (expiresIn > 0 && expiresIn < 10 * 60_000) {
          await silentReauth(i);
        }
      }
      checkReauthNeeded();
    }, 5 * 60_000);
  }

  function reauth(idx) {
    startAuth(idx);
  }

  // ── Check all tokens ──────────────────────────────────────
  function allConnected() {
    return CONFIG.CALENDAR_OWNERS.every((_, i) => isTokenValid(loadToken(i)));
  }

  function getToken(idx) { return loadToken(idx); }

  // ── Setup Splash ──────────────────────────────────────────
  function renderSetupSplash() {
    const container = document.getElementById('setup-users');
    if (!container) return;
    container.innerHTML = '';

    CONFIG.CALENDAR_OWNERS.forEach((owner, idx) => {
      const connected = isTokenValid(loadToken(idx));
      const card = document.createElement('div');
      card.className = `setup-user-card${connected ? ' connected' : ''}`;
      card.id = `setup-card-${idx}`;
      card.innerHTML = `
        <div style="font-size:48px;line-height:1">${owner.name.charAt(0)}</div>
        <div class="setup-user-name" style="color:${owner.color}">${escapeHtml(owner.name)}</div>
        <div class="setup-status ${connected ? 'ok' : ''}" id="setup-status-${idx}">
          ${connected ? '✓ Connected' : escapeHtml(owner.email)}
        </div>
        ${connected
          ? `<button class="btn btn-outline btn-sm" onclick="window.Auth.reauth(${idx})">Reconnect</button>`
          : `<button class="btn btn-primary" onclick="window.Auth.startAuth(${idx})">Sign In with Google</button>`
        }
      `;
      container.appendChild(card);
    });

    updateContinueButton();
  }

  function updateSetupCard(idx, connected) {
    const card = document.getElementById(`setup-card-${idx}`);
    if (!card) return;
    const owner = CONFIG.CALENDAR_OWNERS[idx];
    if (connected) {
      card.classList.add('connected');
      const status = document.getElementById(`setup-status-${idx}`);
      if (status) { status.textContent = '✓ Connected'; status.classList.add('ok'); }
      // Swap button to "Reconnect"
      const btn = card.querySelector('button');
      if (btn) {
        btn.className = 'btn btn-outline btn-sm';
        btn.textContent = 'Reconnect';
        btn.onclick = () => reauth(idx);
      }
    }
  }

  function updateContinueButton() {
    const btn = document.getElementById('setup-continue');
    if (btn) btn.style.display = allConnected() ? 'inline-flex' : 'none';
  }

  function finishSetup() {
    const splash = document.getElementById('setup-splash');
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

    CONFIG.CALENDAR_OWNERS.forEach((owner, idx) => {
      const tok = loadToken(idx);
      const valid = isTokenValid(tok);
      const expiringSoon = tok && tok.expires_at > Date.now() && tok.expires_at < Date.now() + 10 * 60_000;

      const pill = document.createElement('div');
      pill.className = 'auth-pill';
      pill.title = valid ? `${owner.name} — connected` : `${owner.name} — tap to reconnect`;
      pill.innerHTML = `
        <span class="dot ${valid ? (expiringSoon ? 'warn' : 'ok') : 'err'}"></span>
        <span>${escapeHtml(owner.name)}</span>
      `;
      pill.addEventListener('click', () => { if (!valid) reauth(idx); });
      container.appendChild(pill);
    });
  }

  // ── Reauth Banner ──────────────────────────────────────────
  function checkReauthNeeded() {
    const expired = CONFIG.CALENDAR_OWNERS.filter((_, i) => !isTokenValid(loadToken(i)));
    const banner  = document.getElementById('reauth-banner');
    if (!banner) return;

    if (expired.length > 0) {
      const names = expired.map(o => o.name).join(' & ');
      const msg   = document.getElementById('reauth-message');
      if (msg) msg.textContent = `Calendar session expired for ${names} — tap to sign in again`;
      banner.classList.add('visible');
      banner.onclick = () => {
        const idx = CONFIG.CALENDAR_OWNERS.findIndex((_, i) => !isTokenValid(loadToken(i)));
        if (idx >= 0) reauth(idx);
      };
    } else {
      banner.classList.remove('visible');
    }

    renderAuthPills();
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    if (allConnected()) {
      document.getElementById('setup-splash').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      // app.js DOMContentLoaded handler boots App.init()
    } else {
      renderSetupSplash();
      document.getElementById('setup-splash').style.display = 'flex';
    }

    // Proactive silent refresh + health check every 5 min
    startSilentRefreshLoop();
  }

  return { init, startAuth, reauth, silentReauth, finishSetup, getToken, isTokenValid, allConnected, renderAuthPills, checkReauthNeeded };
})();

document.addEventListener('DOMContentLoaded', () => Auth.init());
