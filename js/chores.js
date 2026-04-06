/* ============================================================
   chores.js — Chore chart with localStorage persistence
   ============================================================
   Kids and chore definitions are managed via the admin panel
   and stored in fd_people / fd_chore_data.
   Daily completion state lives in fd_chore_YYYY-MM-DD.
   ============================================================ */

window.Chores = (() => {
  const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // Period definitions: hour ranges (24h) and display info
  const PERIODS = [
    { key: 'morning',   label: 'Morning',   emoji: '🌅', start:  5, end: 12 },
    { key: 'afternoon', label: 'Afternoon', emoji: '☀️', start: 12, end: 17 },
    { key: 'evening',   label: 'Evening',   emoji: '🌙', start: 17, end: 23 },
    { key: 'anytime',   label: null,        emoji: '',   start:  0, end: 24 },
  ];

  function currentPeriodKey() {
    const h = new Date().getHours();
    for (const p of PERIODS) {
      if (p.key !== 'anytime' && h >= p.start && h < p.end) return p.key;
    }
    return null; // outside any named period (e.g. late night)
  }

  // ── Data Helpers ──────────────────────────────────────────
  function getKids() {
    try {
      return JSON.parse(localStorage.getItem('fd_people') || '[]')
             .filter(p => p.type === 'kid');
    } catch { return []; }
  }

  function getKidChores(kidId) {
    try {
      return (JSON.parse(localStorage.getItem('fd_chore_data') || '{}'))[kidId] || [];
    } catch { return []; }
  }

  // ── State Storage ─────────────────────────────────────────
  function todayKey() {
    const d = new Date();
    return `fd_chore_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(todayKey())) || {}; }
    catch { return {}; }
  }

  function saveState(state) {
    localStorage.setItem(todayKey(), JSON.stringify(state));
    // Prune keys older than 8 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 8);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith('fd_chore_')) continue;
      const dateStr = key.replace('fd_chore_', '');
      if (dateStr < cutoff.toISOString().slice(0, 10)) {
        localStorage.removeItem(key);
      }
    }
  }

  function choreKey(kidId, choreId) { return `${kidId}__${choreId}`; }

  // ── Today's chores for a kid, sorted by period order ─────
  const PERIOD_ORDER = ['morning', 'afternoon', 'evening', 'anytime'];
  function todayChores(kidId) {
    const dayName = DAY_SHORT[new Date().getDay()];
    return getKidChores(kidId)
      .filter(c => c.days.includes(dayName))
      .sort((a, b) => {
        const ai = PERIOD_ORDER.indexOf(a.period || 'anytime');
        const bi = PERIOD_ORDER.indexOf(b.period || 'anytime');
        return ai - bi;
      });
  }

  // ── Confetti ───────────────────────────────────────────────
  function spawnConfetti(container) {
    const colors = ['#58A6FF','#FF7EB3','#3FB950','#D29922','#F85149','#ffffff'];
    const wrap   = document.createElement('div');
    wrap.className = 'confetti-container';
    container.appendChild(wrap);

    for (let i = 0; i < 20; i++) {
      const p = document.createElement('span');
      p.className = 'confetti-particle';
      p.style.cssText = `
        left:${Math.random()*100}%;top:-10px;
        background:${colors[Math.floor(Math.random()*colors.length)]};
        width:${6+Math.random()*8}px;height:${6+Math.random()*8}px;
        animation-duration:${1.2+Math.random()*1.4}s;
        animation-delay:${Math.random()*0.5}s;
        transform:rotate(${Math.random()*360}deg);
        border-radius:${Math.random()>0.5?'50%':'2px'};
      `;
      wrap.appendChild(p);
    }
    setTimeout(() => wrap.remove(), 3000);
  }

  // ── Render one kid column ─────────────────────────────────
  function renderKidColumn(kid, state) {
    const chores    = todayChores(kid.id);
    const doneCount = chores.filter(c => state[choreKey(kid.id, c.id)]).length;
    const allDone   = chores.length > 0 && doneCount === chores.length;
    const pct       = chores.length ? Math.round(doneCount / chores.length * 100) : 0;

    const col = document.createElement('div');
    col.className = `kid-column${allDone ? ' kid-all-done' : ''}`;
    col.id = `kid-col-${kid.id}`;

    const header = document.createElement('div');
    header.className = 'kid-header';
    header.innerHTML = `
      <div class="kid-name" style="color:${escapeHtml(kid.color || 'var(--text-primary)')}">${escapeHtml(kid.name)}</div>
      <div class="kid-progress-text">${doneCount} / ${chores.length} done</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${pct}%;background:${escapeHtml(kid.color || 'var(--accent-blue)')}"></div>
      </div>
    `;
    col.appendChild(header);

    const list = document.createElement('div');
    list.className = 'chore-list';

    if (chores.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'no-events';
      empty.style.padding = '20px';
      empty.textContent = 'No chores today!';
      list.appendChild(empty);
    } else {
      const activePeriod = currentPeriodKey();
      let lastPeriod = null;

      chores.forEach(chore => {
        const period = chore.period || 'anytime';
        const periodMeta = PERIODS.find(p => p.key === period);

        // Insert a section divider when the period changes (skip for 'anytime')
        if (period !== 'anytime' && period !== lastPeriod) {
          lastPeriod = period;
          const divider = document.createElement('div');
          const isActive = period === activePeriod;
          divider.className = `chore-period-divider${isActive ? ' active-period' : ''}`;
          divider.innerHTML = `<span>${periodMeta.emoji} ${periodMeta.label}</span>`;
          list.appendChild(divider);
        }

        const done = !!state[choreKey(kid.id, chore.id)];
        const isActive = period === activePeriod || period === 'anytime';
        const item = document.createElement('div');
        item.className = `chore-item${done ? ' done' : ''}${isActive ? ' period-active' : ' period-dim'}`;

        item.innerHTML = `
          <div class="chore-checkbox">${done ? '✓' : ''}</div>
          <div class="chore-task">${escapeHtml(chore.task)}</div>
        `;
        item.addEventListener('click', () => toggleChore(kid.id, chore.id));
        list.appendChild(item);
      });
    }
    col.appendChild(list);

    if (allDone && chores.length > 0) {
      const overlay = document.createElement('div');
      overlay.className = 'celebration-overlay';
      overlay.innerHTML = `
        <div class="celebration-text">🎉 Amazing, ${escapeHtml(kid.name)}!</div>
        <div style="font-size:18px;color:var(--text-secondary)">All done for today!</div>
      `;
      col.style.position = 'relative';
      col.appendChild(overlay);
      spawnConfetti(col);
    }

    return col;
  }

  // ── Toggle ────────────────────────────────────────────────
  function toggleChore(kidId, choreId) {
    const state = loadState();
    const key   = choreKey(kidId, choreId);
    state[key]  = !state[key];
    saveState(state);
    renderChores();
  }

  // ── Full Render ───────────────────────────────────────────
  function renderChores() {
    const page = document.getElementById('chores-page');
    if (!page) return;
    page.innerHTML = '';

    const kids  = getKids();
    const state = loadState();

    if (kids.length === 0) {
      page.innerHTML = `
        <div class="no-events" style="margin:auto;text-align:center">
          <p>No kids set up yet.</p>
          <p style="font-size:14px;color:var(--text-secondary)">Add kids in the ⚙ admin panel.</p>
        </div>
      `;
      return;
    }

    kids.forEach(kid => page.appendChild(renderKidColumn(kid, state)));
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Midnight Reset ────────────────────────────────────────
  let _lastDate = new Date().toDateString();

  function startMidnightReset() {
    setInterval(() => {
      const today = new Date().toDateString();
      if (today !== _lastDate) {
        _lastDate = today;
        renderChores();
      }
    }, 60_000);
  }

  function render() { renderChores(); }

  return { render, startMidnightReset };
})();
