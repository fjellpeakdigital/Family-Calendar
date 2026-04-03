/* ============================================================
   chores.js — Chore chart with localStorage persistence
   ============================================================ */

window.Chores = (() => {
  const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // ── Storage ────────────────────────────────────────────────
  function todayKey() {
    const d = new Date();
    return `chores_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(todayKey())) || {};
    } catch { return {}; }
  }

  function saveState(state) {
    localStorage.setItem(todayKey(), JSON.stringify(state));
  }

  function choreKey(kidIdx, task) {
    return `${kidIdx}_${task}`;
  }

  // ── Get today's chores for a kid ──────────────────────────
  function todayChores(kid) {
    const dayName = DAY_SHORT[new Date().getDay()];
    return kid.chores.filter(c => c.days.includes(dayName));
  }

  // ── Confetti ───────────────────────────────────────────────
  function spawnConfetti(container) {
    const colors = ['#58A6FF','#FF7EB3','#3FB950','#D29922','#F85149','#ffffff'];
    const confettiWrap = document.createElement('div');
    confettiWrap.className = 'confetti-container';
    container.appendChild(confettiWrap);

    for (let i = 0; i < 20; i++) {
      const p = document.createElement('span');
      p.className = 'confetti-particle';
      p.style.cssText = `
        left: ${Math.random() * 100}%;
        top: -10px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        width: ${6 + Math.random() * 8}px;
        height: ${6 + Math.random() * 8}px;
        animation-duration: ${1.2 + Math.random() * 1.4}s;
        animation-delay: ${Math.random() * 0.5}s;
        transform: rotate(${Math.random() * 360}deg);
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      `;
      confettiWrap.appendChild(p);
    }

    // Remove after animation
    setTimeout(() => confettiWrap.remove(), 3000);
  }

  // ── Render one kid column ──────────────────────────────────
  function renderKidColumn(kid, kidIdx, state) {
    const chores = todayChores(kid);
    const doneCount = chores.filter(c => state[choreKey(kidIdx, c.task)]).length;
    const allDone = chores.length > 0 && doneCount === chores.length;
    const pct = chores.length ? Math.round(doneCount / chores.length * 100) : 0;

    const col = document.createElement('div');
    col.className = `kid-column${allDone ? ' kid-all-done' : ''}`;
    col.id = `kid-col-${kidIdx}`;

    // Header
    const header = document.createElement('div');
    header.className = 'kid-header';
    header.innerHTML = `
      <div class="kid-avatar">${kid.avatar}</div>
      <div class="kid-name">${escapeHtml(kid.name)}</div>
      <div class="kid-progress-text">${doneCount} / ${chores.length} done</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
    `;
    col.appendChild(header);

    // Chore list
    const list = document.createElement('div');
    list.className = 'chore-list';

    if (chores.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'no-events';
      empty.style.padding = '20px';
      empty.textContent = 'No chores today! 🎉';
      list.appendChild(empty);
    } else {
      chores.forEach(chore => {
        const done = !!state[choreKey(kidIdx, chore.task)];
        const item = document.createElement('div');
        item.className = `chore-item${done ? ' done' : ''}`;
        item.dataset.kidIdx = kidIdx;
        item.dataset.task   = chore.task;

        item.innerHTML = `
          <div class="chore-checkbox">${done ? '✓' : ''}</div>
          <div class="chore-task">${escapeHtml(chore.task)}</div>
        `;

        item.addEventListener('click', () => toggleChore(kidIdx, chore.task));
        list.appendChild(item);
      });
    }

    col.appendChild(list);

    // Celebration overlay (if all done)
    if (allDone && chores.length > 0) {
      const overlay = document.createElement('div');
      overlay.className = 'celebration-overlay';
      overlay.innerHTML = `
        <div style="font-size:60px">${kid.avatar}</div>
        <div class="celebration-text">🎉 Amazing, ${escapeHtml(kid.name)}!</div>
        <div style="font-size:18px;color:var(--text-secondary)">All done for today!</div>
      `;
      col.style.position = 'relative';
      col.appendChild(overlay);
      spawnConfetti(col);
    }

    return col;
  }

  // ── Toggle a chore ─────────────────────────────────────────
  function toggleChore(kidIdx, task) {
    const state = loadState();
    const key   = choreKey(kidIdx, task);
    state[key]  = !state[key];
    saveState(state);
    renderChores(); // full re-render to update progress
  }

  // ── Full render ────────────────────────────────────────────
  function renderChores() {
    const page = document.getElementById('chores-page');
    if (!page) return;
    page.innerHTML = '';

    const state = loadState();

    CONFIG.KIDS.forEach((kid, idx) => {
      page.appendChild(renderKidColumn(kid, idx, state));
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Midnight reset check ───────────────────────────────────
  let _lastDate = new Date().toDateString();

  function startMidnightReset() {
    setInterval(() => {
      const today = new Date().toDateString();
      if (today !== _lastDate) {
        _lastDate = today;
        renderChores(); // New day — chores auto-reset via new todayKey
      }
    }, 60_000);
  }

  // ── Public API ─────────────────────────────────────────────
  function render() {
    renderChores();
  }

  return { render, startMidnightReset };
})();
