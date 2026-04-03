/* ============================================================
   app.js — App shell: routing, swipe nav, clock, glue
   ============================================================ */

window.App = (() => {
  let _currentPage = 0;
  let _pageCount   = 0;
  let _autoTimer   = null;
  let _renderedPages = new Set();

  // ── Load Page HTML into track ─────────────────────────────
  async function loadPages() {
    const track = document.getElementById('page-track');
    track.innerHTML = '';
    _pageCount = CONFIG.PAGES.length;

    const fetches = CONFIG.PAGES.map(name =>
      fetch(`pages/${name}.html`).then(r => r.text()).catch(() => `<div class="page-content"><p>Error loading ${name}</p></div>`)
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

  // ── Navigate to Page ──────────────────────────────────────
  function goTo(idx, animate = true) {
    if (idx < 0 || idx >= _pageCount) return;
    _currentPage = idx;

    const track = document.getElementById('page-track');
    track.style.transition = animate
      ? 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)'
      : 'none';
    track.style.transform = `translateX(-${idx * 100}vw)`;

    // Update dots & title
    renderDots();
    const titleEl = document.getElementById('page-title');
    if (titleEl) {
      titleEl.textContent = CONFIG.PAGES[idx].charAt(0).toUpperCase() + CONFIG.PAGES[idx].slice(1);
    }

    // Lazy-render page content on first visit
    const pageName = CONFIG.PAGES[idx];
    if (!_renderedPages.has(pageName)) {
      _renderedPages.add(pageName);
      renderPage(pageName);
    }

    // Reset auto-advance timer
    if (CONFIG.AUTO_ADVANCE_PAGES && _autoTimer) {
      clearInterval(_autoTimer);
      startAutoAdvance();
    }
  }

  function next() { goTo((_currentPage + 1) % _pageCount); }
  function prev() { goTo((_currentPage - 1 + _pageCount) % _pageCount); }

  // ── Render page data ───────────────────────────────────────
  function renderPage(name) {
    switch (name) {
      case 'calendar': Calendar.render(); break;
      case 'today':
        Calendar.renderTodayPanel();
        Weather.renderTodayPanel();
        break;
      case 'chores':   Chores.render();   break;
    }
  }

  // ── Clock ──────────────────────────────────────────────────
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
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      dateEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
    }
  }

  // ── Swipe Detection ────────────────────────────────────────
  let _touchStartX = 0, _touchStartY = 0;
  let _mouseStartX = 0, _isDragging = false;

  function initSwipe() {
    const vp = document.getElementById('page-viewport');

    // Touch events
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

    // Mouse drag (for desktop testing)
    vp.addEventListener('mousedown', e => {
      _mouseStartX = e.clientX;
      _isDragging  = true;
    });

    vp.addEventListener('mouseup', e => {
      if (!_isDragging) return;
      _isDragging = false;
      const dx = e.clientX - _mouseStartX;
      if (Math.abs(dx) > 50) dx < 0 ? next() : prev();
    });

    vp.addEventListener('mouseleave', () => { _isDragging = false; });
  }

  // ── Keyboard Navigation ────────────────────────────────────
  function initKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft')  prev();
    });
  }

  // ── Auto-Advance ───────────────────────────────────────────
  function startAutoAdvance() {
    if (!CONFIG.AUTO_ADVANCE_PAGES) return;
    _autoTimer = setInterval(() => next(), CONFIG.AUTO_ADVANCE_INTERVAL_MS);
  }

  // ── Fullscreen on first interaction ───────────────────────
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

  // ── Init ───────────────────────────────────────────────────
  async function init() {
    await loadPages();

    // Start at first page (no animation)
    goTo(0, false);

    // Render first page immediately
    renderPage(CONFIG.PAGES[0]);

    // Clock
    updateClock();
    setInterval(updateClock, 1000);

    // Auth pills
    Auth.renderAuthPills();
    Auth.checkReauthNeeded();

    // Navigation
    initSwipe();
    initKeyboard();

    // Auto-advance
    startAutoAdvance();

    // Fullscreen
    requestFullscreenOnce();

    // Start background refresh loops
    Calendar.startAutoRefresh();
    Weather.startAutoRefresh();
    Chores.startMidnightReset();

    // Re-render the active page when it comes back into focus (e.g. token refreshed)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) renderPage(CONFIG.PAGES[_currentPage]);
    });
  }

  return { init, goTo, next, prev };
})();

// If auth is already done (tokens present), boot directly.
// Otherwise auth.js handles the setup splash and calls App.init() when ready.
document.addEventListener('DOMContentLoaded', () => {
  // auth.js has already run its init; if the app shell is visible, boot.
  if (document.getElementById('app').style.display !== 'none') {
    App.init();
  }
});
