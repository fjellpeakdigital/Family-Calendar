/* ============================================================
   app.js — App shell: routing, swipe nav, clock, boot
   ============================================================ */

window.App = (() => {
  let _currentPage  = 0;
  let _pageCount    = 0;
  let _autoTimer    = null;
  let _renderedPages = new Set();
  let _autoPausedUntil = 0;   // ms timestamp; auto-advance skips ticks until this time
  const AUTO_PAUSE_MS = 60_000;

  // ── One-time migration: seed fd_people / fd_chore_data ───
  // Runs on first boot from CONFIG.CALENDAR_OWNERS + CONFIG.KIDS.
  // After first run these live in localStorage and are managed
  // via the ⚙ admin panel — config.js never needs to be edited again.
  function migrateConfigData() {
    if (localStorage.getItem('fd_people')) return; // already migrated

    const people    = [];
    const choreData = {};
    const assignments = [];

    // Adults from CALENDAR_OWNERS
    (CONFIG.CALENDAR_OWNERS || []).forEach(owner => {
      const id = crypto.randomUUID();
      people.push({ id, name: owner.name, color: owner.color, emoji: '👤', type: 'adult' });
      // Seed a 'primary' calendar assignment so existing users see events immediately
      assignments.push({ calendarId: 'primary', accountEmail: owner.email, personId: id });
    });

    // Kids from KIDS
    (CONFIG.KIDS || []).forEach(kid => {
      const id = crypto.randomUUID();
      people.push({ id, name: kid.name, color: kid.color || '#3FB950', emoji: '🧒', type: 'kid' });
      choreData[id] = (kid.chores || []).map(c => ({
        id:   crypto.randomUUID(),
        task: c.task,
        days: c.days,
      }));
    });

    localStorage.setItem('fd_people',          JSON.stringify(people));
    localStorage.setItem('fd_chore_data',       JSON.stringify(choreData));
    localStorage.setItem('fd_cal_assignments',  JSON.stringify(assignments));
    console.log('Migrated config data to localStorage');
  }

  // ── Apply saved settings ──────────────────────────────────
  function applySavedSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('fd_settings') || '{}');
      if (saved.LOCATION)                CONFIG.LOCATION = saved.LOCATION;
      if (saved.TIME_FORMAT_24H != null)  CONFIG.TIME_FORMAT_24H = saved.TIME_FORMAT_24H;
      if (saved.CALENDAR_LOOKAHEAD_DAYS)  CONFIG.CALENDAR_LOOKAHEAD_DAYS = saved.CALENDAR_LOOKAHEAD_DAYS;
      applyKidMode(!!saved.KID_MODE);
    } catch {}
  }

  // Toggled from admin settings — adds data-kid-mode="true" to <html> so CSS
  // can bump font sizes / touch targets on the chores page for younger kids.
  function applyKidMode(on) {
    document.documentElement.setAttribute('data-kid-mode', on ? 'true' : 'false');
  }

  // ── Load Page HTML ────────────────────────────────────────
  async function loadPages() {
    const track = document.getElementById('page-track');
    track.innerHTML = '';
    _pageCount = CONFIG.PAGES.length;

    const fetches = CONFIG.PAGES.map(name =>
      fetch(`pages/${name}.html`).then(r => r.text())
        .catch(() => `<div class="page-content"><p>Error loading ${name}</p></div>`)
    );
    const htmls = await Promise.all(fetches);
    htmls.forEach((html, i) => {
      const slide = document.createElement('div');
      slide.className = 'page-slide';
      slide.dataset.page = CONFIG.PAGES[i];
      slide.id = `page-slide-${i}`;
      slide.innerHTML = html;
      track.appendChild(slide);
    });
  }

  // ── Nav Dots ──────────────────────────────────────────────
  function renderDots() {
    const container = document.getElementById('nav-dots');
    if (!container) return;
    container.innerHTML = '';
    CONFIG.PAGES.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = `nav-dot${i === _currentPage ? ' active' : ''}`;
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-selected', i === _currentPage);
      dot.setAttribute('aria-label', `Go to ${CONFIG.PAGES[i]} page`);
      dot.addEventListener('click', () => goTo(i));
      container.appendChild(dot);
    });
  }

  // ── Navigate ──────────────────────────────────────────────
  function goTo(idx, animate = true) {
    if (idx < 0 || idx >= _pageCount) return;
    _currentPage = idx;

    const track = document.getElementById('page-track');
    track.style.transition = animate
      ? 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)'
      : 'none';
    track.style.transform = `translateX(-${idx * 100}vw)`;

    renderDots();
    const titleEl = document.getElementById('page-title');
    if (titleEl) {
      titleEl.textContent = CONFIG.PAGES[idx].charAt(0).toUpperCase() + CONFIG.PAGES[idx].slice(1);
    }

    const pageName = CONFIG.PAGES[idx];
    if (!_renderedPages.has(pageName)) {
      _renderedPages.add(pageName);
      renderPage(pageName);
    }

    if (CONFIG.AUTO_ADVANCE_PAGES && _autoTimer) {
      clearInterval(_autoTimer);
      startAutoAdvance();
    }
  }

  function next() { goTo((_currentPage + 1) % _pageCount); }
  function prev() { goTo((_currentPage - 1 + _pageCount) % _pageCount); }

  // ── Render page data ──────────────────────────────────────
  function renderPage(name) {
    switch (name) {
      case 'calendar': Calendar.render(); break;
      case 'today':
        Calendar.renderTodayPanel();
        Weather.renderTodayPanel();
        Chores.renderTodayStrip();
        break;
      case 'chores': Chores.render(); break;
      case 'weather': Weather.render(); break;
    }
  }

  // ── Clock ─────────────────────────────────────────────────
  function updateClock() {
    const now = new Date();
    let h = now.getHours(), m = now.getMinutes();
    let timeStr;

    if (CONFIG.TIME_FORMAT_24H) {
      timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    } else {
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      timeStr = `${h}:${String(m).padStart(2,'0')} <span style="font-size:0.35em;letter-spacing:1px;vertical-align:middle">${ampm}</span>`;
    }

    const clockEl = document.getElementById('clock');
    if (clockEl) clockEl.innerHTML = timeStr;

    const dateEl = document.getElementById('date-display');
    if (dateEl) {
      const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const months = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
      dateEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
    }
  }

  // ── Swipe ─────────────────────────────────────────────────
  let _touchStartX = 0, _touchStartY = 0;
  let _mouseStartX = 0, _isDragging  = false;

  function initSwipe() {
    const vp = document.getElementById('page-viewport');

    vp.addEventListener('touchstart', e => {
      _touchStartX = e.touches[0].clientX;
      _touchStartY = e.touches[0].clientY;
    }, { passive: true });

    vp.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - _touchStartX;
      const dy = e.changedTouches[0].clientY - _touchStartY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        dx < 0 ? next() : prev();
      }
    }, { passive: true });

    vp.addEventListener('mousedown', e => { _mouseStartX = e.clientX; _isDragging = true; });
    vp.addEventListener('mouseup',   e => {
      if (!_isDragging) return;
      _isDragging = false;
      const dx = e.clientX - _mouseStartX;
      if (Math.abs(dx) > 50) dx < 0 ? next() : prev();
    });
    vp.addEventListener('mouseleave', () => { _isDragging = false; });
  }

  // ── Keyboard ──────────────────────────────────────────────
  function initKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft')  prev();
    });
  }

  // ── Auto-Advance ──────────────────────────────────────────
  function startAutoAdvance() {
    if (!CONFIG.AUTO_ADVANCE_PAGES) return;
    _autoTimer = setInterval(() => {
      if (Date.now() < _autoPausedUntil) return;
      next();
    }, CONFIG.AUTO_ADVANCE_INTERVAL_MS);
  }

  function pauseAutoAdvance(ms = AUTO_PAUSE_MS) {
    _autoPausedUntil = Date.now() + ms;
  }

  function initAutoPause() {
    if (!CONFIG.AUTO_ADVANCE_PAGES) return;
    const bump = () => pauseAutoAdvance();
    document.addEventListener('touchstart', bump, { passive: true });
    document.addEventListener('mousedown',  bump);
    document.addEventListener('keydown',    bump);
    document.addEventListener('wheel',      bump, { passive: true });
  }

  // ── Data Status (online/offline + cache age chip) ─────────
  const _dataStatus = {
    calendar: { lastOk: 0, lastError: 0 },
    weather:  { lastOk: 0, lastError: 0 },
  };
  const STALE_MS = { calendar: 15 * 60_000, weather: 30 * 60_000 };

  function recordDataFetch(kind, ok) {
    if (!_dataStatus[kind]) return;
    if (ok) _dataStatus[kind].lastOk    = Date.now();
    else    _dataStatus[kind].lastError = Date.now();
    renderDataStatus();
  }

  function renderDataStatus() {
    const el = document.getElementById('data-status');
    if (!el) return;

    if (!navigator.onLine) {
      el.className = 'data-status err';
      el.textContent = '● Offline';
      el.title = 'No network connection — data may be stale';
      return;
    }

    const now = Date.now();
    const staleKinds = [];
    for (const kind of ['calendar', 'weather']) {
      const { lastOk } = _dataStatus[kind];
      if (!lastOk) continue;
      const age = now - lastOk;
      if (age > STALE_MS[kind]) staleKinds.push({ kind, age });
    }

    if (staleKinds.length === 0) {
      // Fully fresh — hide chip unless error recorded after last success
      const anyError = ['calendar','weather'].some(k =>
        _dataStatus[k].lastError > _dataStatus[k].lastOk && _dataStatus[k].lastError
      );
      if (anyError) {
        el.className = 'data-status warn';
        el.textContent = '● Fetch error';
        el.title = 'A recent fetch failed — check console';
      } else {
        el.className = 'data-status hidden';
        el.textContent = '';
      }
      return;
    }

    const oldest = staleKinds.reduce((a, b) => a.age > b.age ? a : b);
    const mins = Math.round(oldest.age / 60_000);
    el.className = 'data-status warn';
    el.textContent = `● Stale ${mins}m`;
    el.title = staleKinds.map(s => `${s.kind}: ${Math.round(s.age/60_000)}m old`).join(' · ');
  }

  function initDataStatus() {
    window.addEventListener('online',  renderDataStatus);
    window.addEventListener('offline', renderDataStatus);
    setInterval(renderDataStatus, 30_000);
    renderDataStatus();
  }

  // ── Undo Toast ────────────────────────────────────────────
  // Shows a bottom-screen toast with an Undo button.
  // Calling again while one is visible dismisses the prior toast.
  let _toastEl = null, _toastTimer = null;

  function showUndoToast(message, onUndo, durationMs = 7000) {
    pauseAutoAdvance(Math.max(durationMs + 2000, AUTO_PAUSE_MS));
    dismissToast();

    const toast = document.createElement('div');
    toast.className = 'undo-toast';
    toast.innerHTML = `
      <span class="undo-toast-msg"></span>
      <button class="undo-toast-btn" type="button">Undo</button>
    `;
    toast.querySelector('.undo-toast-msg').textContent = message;
    toast.querySelector('.undo-toast-btn').addEventListener('click', () => {
      try { onUndo?.(); } finally { dismissToast(); }
    });

    document.body.appendChild(toast);
    // Force reflow so the transition runs
    void toast.offsetWidth;
    toast.classList.add('visible');

    _toastEl = toast;
    _toastTimer = setTimeout(dismissToast, durationMs);
  }

  function dismissToast() {
    if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
    if (!_toastEl) return;
    const el = _toastEl;
    _toastEl = null;
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 250);
  }

  // ── Fullscreen ────────────────────────────────────────────
  function requestFullscreenOnce() {
    const handler = () => {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      document.removeEventListener('click',     handler);
      document.removeEventListener('touchstart', handler);
    };
    document.addEventListener('click',     handler, { once: true });
    document.addEventListener('touchstart', handler, { once: true, passive: true });
  }

  // ── Theme ─────────────────────────────────────────────────
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('dashboard_theme', theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#0D1117' : '#EEF2F7';
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  function initTheme() {
    const saved = localStorage.getItem('dashboard_theme') || 'dark';
    applyTheme(saved);
  }

  // ── Setup screen: add-account button ─────────────────────
  function initSetupScreen() {
    const addBtn = document.getElementById('setup-add-account');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        addBtn.disabled = true;
        addBtn.textContent = 'Opening sign-in…';
        await Auth.signIn();
        addBtn.disabled = false;
        addBtn.textContent = '+ Add Account';
      });
    }
  }

  // ── Init ──────────────────────────────────────────────────
  async function init() {
    applySavedSettings();
    migrateConfigData();
    initTheme();

    await loadPages();
    goTo(0, false);
    renderPage(CONFIG.PAGES[0]);

    updateClock();
    setInterval(updateClock, 1000);

    Auth.renderAuthPills();
    Auth.checkReauthNeeded();

    Admin.init();

    initSwipe();
    initKeyboard();
    startAutoAdvance();
    initAutoPause();
    initDataStatus();
    requestFullscreenOnce();

    Calendar.startAutoRefresh();
    Weather.startAutoRefresh();
    Chores.startMidnightReset();

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) renderPage(CONFIG.PAGES[_currentPage]);
    });
  }

  return { init, goTo, next, prev, toggleTheme, showUndoToast, pauseAutoAdvance, applyKidMode, recordDataFetch };
})();

document.addEventListener('DOMContentLoaded', () => {
  // Setup screen add-account button is always available
  const addBtn = document.getElementById('setup-add-account');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      addBtn.textContent = 'Opening sign-in…';
      await Auth.signIn();
      addBtn.disabled = false;
      addBtn.textContent = '+ Add Account';
    });
  }

  // auth.js already ran init; if the app shell is visible, boot.
  if (document.getElementById('app').style.display !== 'none') {
    App.init();
  }
});
