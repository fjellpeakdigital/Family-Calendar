/* ============================================================
   auth.js — Google OAuth 2.0 with PKCE + Setup Splash
   ============================================================ */

window.Auth = (() => {
  // ── PKCE Helpers ──────────────────────────────────────────
  function randomBase64url(len) {
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  async function sha256base64url(plain) {
    const enc = new TextEncoder().encode(plain);
    const hash = await crypto.subtle.digest('SHA-256', enc);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  // ── Token Storage ─────────────────────────────────────────
  function tokenKey(idx) { return `auth_token_${idx}`; }

  function saveToken(idx, tokenObj) {
    localStorage.setItem(tokenKey(idx), JSON.stringify(tokenObj));
  }

  function loadToken(idx) {
    try {
      return JSON.parse(localStorage.getItem(tokenKey(idx)));
    } catch { return null; }
  }

  function isTokenValid(tok) {
    if (!tok || !tok.access_token) return false;
    return tok.expires_at > Date.now() + 60_000; // 1-min buffer
  }

  // ── Initiate OAuth Flow ───────────────────────────────────
  async function startAuth(idx) {
    const owner = CONFIG.CALENDAR_OWNERS[idx];
    const verifier = randomBase64url(64);
    const challenge = await sha256base64url(verifier);
    const state = `idx_${idx}_${randomBase64url(16)}`;

    sessionStorage.setItem(`pkce_verifier_${state}`, verifier);
    sessionStorage.setItem(`pkce_idx_${state}`, String(idx));

    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     CONFIG.GOOGLE_CLIENT_ID,
      redirect_uri:  location.origin + location.pathname,
      scope:         'https://www.googleapis.com/auth/calendar.readonly',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      login_hint:  owner.email,
      prompt:      'consent',
    });

    location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  // ── Handle OAuth Redirect ─────────────────────────────────
  async function handleRedirect() {
    const params = new URLSearchParams(location.search);
    const code  = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
      console.warn('OAuth error:', error);
      // Clean URL and continue
      history.replaceState({}, '', location.pathname);
      return;
    }

    if (!code || !state) return;

    const verifier = sessionStorage.getItem(`pkce_verifier_${state}`);
    const idxStr   = sessionStorage.getItem(`pkce_idx_${state}`);

    if (!verifier || idxStr === null) {
      console.warn('Missing PKCE state for', state);
      history.replaceState({}, '', location.pathname);
      return;
    }

    sessionStorage.removeItem(`pkce_verifier_${state}`);
    sessionStorage.removeItem(`pkce_idx_${state}`);
    history.replaceState({}, '', location.pathname);

    const idx = parseInt(idxStr, 10);

    try {
      const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id:     CONFIG.GOOGLE_CLIENT_ID,
          redirect_uri:  location.origin + location.pathname,
          grant_type:    'authorization_code',
          code_verifier: verifier,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        // If this is a public client trying to exchange (requires client_secret on web),
        // surface a helpful message rather than a cryptic error.
        if (err.error === 'invalid_client' || err.error === 'unauthorized_client') {
          console.error(
            'Token exchange failed — make sure your OAuth Client ID is set to ' +
            '"Web application" and your redirect URI is registered in Google Cloud Console.\n' +
            'Error:', err
          );
        } else {
          console.error('Token exchange error:', err);
        }
        return;
      }

      const data = await resp.json();
      saveToken(idx, {
        access_token: data.access_token,
        expires_at:   Date.now() + (data.expires_in - 60) * 1000,
        email:        CONFIG.CALENDAR_OWNERS[idx].email,
        name:         CONFIG.CALENDAR_OWNERS[idx].name,
      });

      console.log(`Auth OK for ${CONFIG.CALENDAR_OWNERS[idx].name}`);
    } catch (e) {
      console.error('Token exchange fetch failed:', e);
    }
  }

  // ── Check all tokens ──────────────────────────────────────
  function allConnected() {
    return CONFIG.CALENDAR_OWNERS.every((_, i) => isTokenValid(loadToken(i)));
  }

  function getToken(idx) {
    return loadToken(idx);
  }

  // ── Setup Splash ──────────────────────────────────────────
  function renderSetupSplash() {
    const container = document.getElementById('setup-users');
    container.innerHTML = '';

    CONFIG.CALENDAR_OWNERS.forEach((owner, idx) => {
      const tok = loadToken(idx);
      const connected = isTokenValid(tok);

      const card = document.createElement('div');
      card.className = `setup-user-card${connected ? ' connected' : ''}`;
      card.id = `setup-card-${idx}`;
      card.innerHTML = `
        <div class="kid-avatar" style="font-size:48px">${ownerAvatar(owner)}</div>
        <div class="setup-user-name" style="color:${owner.color}">${owner.name}</div>
        <div class="setup-status ${connected ? 'ok' : ''}" id="setup-status-${idx}">
          ${connected ? '✓ Connected' : owner.email}
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

  function ownerAvatar(owner) {
    // Simple initials fallback if no avatar
    return owner.name.charAt(0).toUpperCase();
  }

  function updateContinueButton() {
    const btn = document.getElementById('setup-continue');
    if (btn) {
      btn.style.display = allConnected() ? 'inline-flex' : 'none';
    }
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

  function reauth(idx) {
    startAuth(idx);
  }

  // ── Auth Pill in Header ───────────────────────────────────
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
      pill.title = valid ? `${owner.name} — calendar connected` : `${owner.name} — tap to reconnect`;
      pill.innerHTML = `
        <span class="dot ${valid ? (expiringSoon ? 'warn' : 'ok') : 'err'}"></span>
        <span>${owner.name}</span>
      `;
      pill.addEventListener('click', () => {
        if (!valid) reauth(idx);
      });
      container.appendChild(pill);
    });
  }

  // ── Reauth Banner ─────────────────────────────────────────
  function checkReauthNeeded() {
    const expired = CONFIG.CALENDAR_OWNERS.filter((_, i) => !isTokenValid(loadToken(i)));
    const banner = document.getElementById('reauth-banner');
    if (!banner) return;

    if (expired.length > 0) {
      const names = expired.map(o => o.name).join(' & ');
      document.getElementById('reauth-message').textContent =
        `Calendar session expired for ${names} — tap to sign in again`;
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

  // ── Init ──────────────────────────────────────────────────
  async function init() {
    await handleRedirect();

    // Decide: show setup or app
    if (allConnected()) {
      document.getElementById('setup-splash').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      // App will be initialized by app.js
    } else {
      renderSetupSplash();
      document.getElementById('setup-splash').style.display = 'flex';
    }

    // Re-check token health every 5 minutes
    setInterval(checkReauthNeeded, 5 * 60_000);
  }

  return { init, startAuth, reauth, finishSetup, getToken, isTokenValid, allConnected, renderAuthPills, checkReauthNeeded };
})();

// Auto-start auth module
document.addEventListener('DOMContentLoaded', () => Auth.init());
