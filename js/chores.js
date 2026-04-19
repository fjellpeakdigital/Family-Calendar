/* ============================================================
   chores.js — Chore chart with localStorage persistence
   ============================================================
   Kids and chore definitions are managed via the admin panel
   and stored in fd_people / fd_chore_data.
   Daily completion state lives in fd_chore_YYYY-MM-DD.
   Points accumulate in fd_points (per kid).
   Rewards defined per kid in fd_rewards.
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

  // ── Bonus Chores (one-off for a specific date) ────────────
  // fd_bonus_chores: { "kidId": [{id, task, points, forDate:'YYYY-MM-DD'}] }
  function getBonusChoresRaw() {
    try { return JSON.parse(localStorage.getItem('fd_bonus_chores') || '{}'); }
    catch { return {}; }
  }

  function saveBonusChoresRaw(obj) {
    localStorage.setItem('fd_bonus_chores', JSON.stringify(obj));
  }

  // Prune bonus chores whose forDate is in the past, then return today's bonus
  // chores for one kid.
  function getKidBonusChoresForToday(kidId) {
    const all = getBonusChoresRaw();
    const today = todayDateStr();
    let pruned = false;
    Object.keys(all).forEach(kid => {
      const kept = (all[kid] || []).filter(c => (c.forDate || '') >= today);
      if (kept.length !== (all[kid] || []).length) pruned = true;
      all[kid] = kept;
    });
    if (pruned) saveBonusChoresRaw(all);
    return (all[kidId] || []).filter(c => c.forDate === today)
      .map(c => ({ ...c, bonus: true, days: [DAY_SHORT[new Date().getDay()]], period: 'anytime' }));
  }

  // ── Points Storage ────────────────────────────────────────
  function getPoints() {
    try { return JSON.parse(localStorage.getItem('fd_points')) || {}; }
    catch { return {}; }
  }

  function savePoints(pts) {
    localStorage.setItem('fd_points', JSON.stringify(pts));
  }

  function getKidPoints(kidId) {
    return getPoints()[kidId] || 0;
  }

  // ── Rewards Storage ───────────────────────────────────────
  function getRewards() {
    try { return JSON.parse(localStorage.getItem('fd_rewards')) || {}; }
    catch { return {}; }
  }

  function saveRewards(obj) {
    localStorage.setItem('fd_rewards', JSON.stringify(obj));
  }

  // ── Streak Storage ────────────────────────────────────────
  // fd_streaks: { "kidId__choreId": { count, lastDate } }
  function getStreaks() {
    try { return JSON.parse(localStorage.getItem('fd_streaks')) || {}; }
    catch { return {}; }
  }

  function saveStreaks(obj) {
    localStorage.setItem('fd_streaks', JSON.stringify(obj));
  }

  function dateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function todayDateStr() { return dateStr(new Date()); }

  // Previous scheduled day (YYYY-MM-DD) for a chore, walking back up to 7 days
  function prevScheduledDay(choreDays, fromDateStr) {
    const from = new Date(fromDateStr + 'T00:00:00');
    for (let i = 1; i <= 7; i++) {
      const d = new Date(from);
      d.setDate(d.getDate() - i);
      if (choreDays.includes(DAY_SHORT[d.getDay()])) return dateStr(d);
    }
    return null;
  }

  // Returns the current live streak count for a chore, lazily resetting
  // if the last-done date isn't today or the previous scheduled day.
  function getChoreStreak(kidId, chore) {
    const streaks = getStreaks();
    const key = `${kidId}__${chore.id}`;
    const entry = streaks[key];
    if (!entry || !entry.count) return 0;
    const today = todayDateStr();
    if (entry.lastDate === today) return entry.count;
    if (entry.lastDate === prevScheduledDay(chore.days, today)) return entry.count;
    delete streaks[key];
    saveStreaks(streaks);
    return 0;
  }

  function bumpStreak(kidId, chore) {
    const streaks = getStreaks();
    const key = `${kidId}__${chore.id}`;
    const today = todayDateStr();
    const entry = streaks[key] || { count: 0, lastDate: '' };
    if (entry.lastDate === today) return; // already counted today
    const prevSched = prevScheduledDay(chore.days, today);
    const newCount = entry.lastDate === prevSched ? entry.count + 1 : 1;
    streaks[key] = { count: newCount, lastDate: today };
    saveStreaks(streaks);
  }

  function decrementStreak(kidId, chore) {
    const streaks = getStreaks();
    const key = `${kidId}__${chore.id}`;
    const entry = streaks[key];
    if (!entry) return;
    const today = todayDateStr();
    if (entry.lastDate !== today) return;
    const newCount = Math.max(0, entry.count - 1);
    if (newCount === 0) {
      delete streaks[key];
    } else {
      streaks[key] = { count: newCount, lastDate: prevScheduledDay(chore.days, today) || '' };
    }
    saveStreaks(streaks);
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
    const regular = getKidChores(kidId).filter(c => c.days.includes(dayName));
    const bonus   = getKidBonusChoresForToday(kidId);
    return [...regular, ...bonus].sort((a, b) => {
      const ai = PERIOD_ORDER.indexOf(a.period || 'anytime');
      const bi = PERIOD_ORDER.indexOf(b.period || 'anytime');
      return ai - bi;
    });
  }

  // Lookup a chore (regular or bonus) for toggle / undo.
  function findChoreForKid(kidId, choreId) {
    const regular = getKidChores(kidId).find(c => c.id === choreId);
    if (regular) return regular;
    const bonus = getKidBonusChoresForToday(kidId).find(c => c.id === choreId);
    return bonus || null;
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

  // ── Render rewards panel ──────────────────────────────────
  function renderRewardsPanel(kid, currentPoints) {
    const allRewards = getRewards();
    const rewards = allRewards[kid.id] || [];
    if (rewards.length === 0) return null;

    const panel = document.createElement('div');
    panel.className = 'rewards-panel';

    const title = document.createElement('div');
    title.className = 'rewards-panel-title';
    title.textContent = '🏆 Rewards';
    panel.appendChild(title);

    rewards.forEach(reward => {
      const canClaim = currentPoints >= reward.points;
      const row = document.createElement('div');
      row.className = `reward-row${canClaim ? ' can-claim' : ''}`;

      row.innerHTML = `
        <span class="reward-emoji">${escapeHtml(reward.emoji || '🎁')}</span>
        <div class="reward-info">
          <span class="reward-name">${escapeHtml(reward.name)}</span>
          <span class="reward-cost">⭐ ${reward.points} pts</span>
        </div>
        <button class="reward-claim-btn${canClaim ? ' active' : ''}"
                ${canClaim ? '' : 'disabled'}>
          ${canClaim ? 'Claim!' : `${reward.points - currentPoints} more`}
        </button>
      `;

      if (canClaim) {
        row.querySelector('.reward-claim-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          claimReward(kid, reward);
        });
      }

      panel.appendChild(row);
    });

    return panel;
  }

  // ── Claim a reward ────────────────────────────────────────
  function claimReward(kid, reward) {
    const pts = getPoints();
    const current = pts[kid.id] || 0;
    if (current < reward.points) return;

    pts[kid.id] = current - reward.points;
    savePoints(pts);

    // Show a brief celebration message
    const col = document.getElementById(`kid-col-${kid.id}`);
    if (col) {
      spawnConfetti(col);
      const flash = document.createElement('div');
      flash.className = 'reward-claimed-flash';
      flash.textContent = `${reward.emoji || '🎁'} ${reward.name} claimed!`;
      col.appendChild(flash);
      setTimeout(() => flash.remove(), 2500);
    }

    // Undo toast — refunds the points if tapped.
    window.App?.showUndoToast?.(
      `${reward.emoji || '🎁'} ${kid.name}: ${reward.name} claimed (−${reward.points} pts)`,
      () => {
        const p = getPoints();
        p[kid.id] = (p[kid.id] || 0) + reward.points;
        savePoints(p);
        renderChores();
      }
    );

    renderChores();
  }

  // ── Weekly rollup (7-day completion dots) ─────────────────
  // Returns { date, dayLabel, pct, done, total } for each of the last 7 days
  // ending with today. `pct` is null when no chores were due that day.
  function computeWeeklyRollup(kidId) {
    const kidChores = getKidChores(kidId);
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0,0,0,0);
      d.setDate(d.getDate() - i);
      const dateKey = dateStr(d);
      const dayName = DAY_SHORT[d.getDay()];
      const due = kidChores.filter(c => c.days.includes(dayName));
      if (due.length === 0) {
        result.push({ date: dateKey, dayLabel: dayName, pct: null, done: 0, total: 0 });
        continue;
      }
      let state = {};
      try { state = JSON.parse(localStorage.getItem(`fd_chore_${dateKey}`)) || {}; }
      catch {}
      const done = due.filter(c => state[choreKey(kidId, c.id)]).length;
      result.push({
        date: dateKey, dayLabel: dayName,
        pct: Math.round(done / due.length * 100),
        done, total: due.length,
      });
    }
    return result;
  }

  function renderWeeklyRollup(kid) {
    const rollup = computeWeeklyRollup(kid.id);
    if (rollup.every(r => r.pct === null)) return null;

    const wrap = document.createElement('div');
    wrap.className = 'weekly-rollup';
    rollup.forEach((r, i) => {
      const isToday = i === rollup.length - 1;
      const cell = document.createElement('div');
      cell.className = `weekly-rollup-cell${isToday ? ' today' : ''}`;
      if (r.pct === null) {
        cell.classList.add('none-due');
        cell.title = `${r.dayLabel}: no chores`;
      } else {
        if (r.pct === 100)      cell.classList.add('full');
        else if (r.pct >= 50)   cell.classList.add('most');
        else if (r.pct > 0)     cell.classList.add('some');
        else                    cell.classList.add('zero');
        cell.title = `${r.dayLabel}: ${r.done}/${r.total}`;
      }
      cell.innerHTML = `
        <span class="weekly-rollup-dot" style="${r.pct !== null && r.pct > 0 ? `background:${escapeHtml(kid.color || 'var(--accent-blue)')}` : ''}"></span>
        <span class="weekly-rollup-label">${r.dayLabel[0]}</span>
      `;
      wrap.appendChild(cell);
    });
    return wrap;
  }

  // ── Render one kid column ─────────────────────────────────
  function renderKidColumn(kid, state) {
    const chores    = todayChores(kid.id);
    const doneCount = chores.filter(c => state[choreKey(kid.id, c.id)]).length;
    const allDone   = chores.length > 0 && doneCount === chores.length;
    const pct       = chores.length ? Math.round(doneCount / chores.length * 100) : 0;
    const totalPts  = getKidPoints(kid.id);

    const col = document.createElement('div');
    col.className = `kid-column${allDone ? ' kid-all-done' : ''}`;
    col.id = `kid-col-${kid.id}`;

    const header = document.createElement('div');
    header.className = 'kid-header';
    header.innerHTML = `
      <div class="kid-name" style="color:${escapeHtml(kid.color || 'var(--text-primary)')}">${escapeHtml(kid.name)}</div>
      <div class="kid-points-badge">⭐ ${totalPts} pts</div>
      <div class="kid-progress-text">${doneCount} / ${chores.length} done</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${pct}%;background:${escapeHtml(kid.color || 'var(--accent-blue)')}"></div>
      </div>
    `;
    col.appendChild(header);

    const rollup = renderWeeklyRollup(kid);
    if (rollup) col.appendChild(rollup);

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
        const pts = chore.points || 0;
        const streakCount = getChoreStreak(kid.id, chore);
        const item = document.createElement('div');
        item.className = `chore-item${done ? ' done' : ''}${isActive ? ' period-active' : ' period-dim'}`;

        item.innerHTML = `
          <div class="chore-checkbox">${done ? '✓' : ''}</div>
          <div class="chore-task">${escapeHtml(chore.task)}${chore.bonus ? ' <span class="chore-bonus-tag" title="One-off bonus chore">BONUS</span>' : ''}</div>
          ${streakCount >= 2 ? `<div class="chore-streak-badge" title="${streakCount}-day streak">🔥 ${streakCount}</div>` : ''}
          ${pts > 0 ? `<div class="chore-pts-badge${done ? ' earned' : ''}">⭐ ${pts}</div>` : ''}
        `;
        item.addEventListener('click', () => toggleChore(kid.id, chore.id));
        list.appendChild(item);
      });
    }
    col.appendChild(list);

    // Rewards panel
    const rewardsPanel = renderRewardsPanel(kid, totalPts);
    if (rewardsPanel) col.appendChild(rewardsPanel);

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
    const state  = loadState();
    const key    = choreKey(kidId, choreId);
    const wasDone = !!state[key];
    state[key]   = !wasDone;
    saveState(state);

    const chore  = findChoreForKid(kidId, choreId);
    const choreTask = chore?.task || 'Chore';
    const cPts = chore?.points || 0;

    // Update points
    if (chore && cPts > 0) {
      const pts = getPoints();
      pts[kidId] = Math.max(0, (pts[kidId] || 0) + (wasDone ? -cPts : cPts));
      savePoints(pts);
    }

    // Update streak on this chore — skip bonus (one-off) chores so they
    // don't pollute the streak table with single-day entries.
    if (chore && !chore.bonus) {
      if (!wasDone) bumpStreak(kidId, chore);
      else          decrementStreak(kidId, chore);
    }

    // Undo toast — re-toggle to revert points + streak + state
    const kid = getKids().find(k => k.id === kidId);
    const kidName = kid?.name || '';
    const action  = wasDone ? 'Unchecked' : 'Checked';
    window.App?.showUndoToast?.(
      `${action}: ${kidName ? kidName + ' · ' : ''}${choreTask}${cPts ? ` (${wasDone ? '-' : '+'}${cPts} pts)` : ''}`,
      () => toggleChore(kidId, choreId)
    );

    renderChores();
  }

  // ── Full Render ───────────────────────────────────────────
  function renderChores() {
    // Keep the Today-page strip fresh whenever the chores page re-renders.
    renderTodayStrip();
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

  // ── Compact chore strip for the Today page ────────────────
  function renderTodayStrip() {
    const host = document.getElementById('today-chore-strip');
    if (!host) return;

    const kids = getKids();
    if (kids.length === 0) { host.style.display = 'none'; host.innerHTML = ''; return; }

    const state = loadState();
    host.style.display = '';
    host.innerHTML = `<div class="today-chore-strip-label">Chores Today</div>`;

    const grid = document.createElement('div');
    grid.className = 'today-chore-strip-grid';

    let anyToday = false;
    kids.forEach(kid => {
      const chores = todayChores(kid.id);
      if (chores.length === 0) return;
      anyToday = true;
      const done = chores.filter(c => state[choreKey(kid.id, c.id)]).length;
      const pct = Math.round(done / chores.length * 100);
      const allDone = done === chores.length;

      const card = document.createElement('div');
      card.className = `today-chore-strip-card${allDone ? ' all-done' : ''}`;
      card.innerHTML = `
        <div class="tcs-kid-name" style="color:${escapeHtml(kid.color || 'var(--text-primary)')}">
          ${escapeHtml(kid.emoji || '')} ${escapeHtml(kid.name)}
        </div>
        <div class="tcs-progress">
          <div class="tcs-count">${done}/${chores.length}${allDone ? ' ✓' : ''}</div>
          <div class="tcs-bar">
            <div class="tcs-bar-fill" style="width:${pct}%;background:${escapeHtml(kid.color || 'var(--accent-blue)')}"></div>
          </div>
        </div>
      `;
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        const idx = (CONFIG.PAGES || []).indexOf('chores');
        if (idx >= 0) window.App?.goTo?.(idx);
      });
      grid.appendChild(card);
    });

    if (!anyToday) {
      host.innerHTML = '';
      host.style.display = 'none';
      return;
    }
    host.appendChild(grid);
  }

  // ── Admin API: bonus chores ───────────────────────────────
  function addBonusChore(kidId, { task, points = 1 }) {
    const all = getBonusChoresRaw();
    if (!all[kidId]) all[kidId] = [];
    all[kidId].push({
      id: crypto.randomUUID(),
      task,
      points: Math.max(1, parseInt(points, 10) || 1),
      forDate: todayDateStr(),
    });
    saveBonusChoresRaw(all);
  }

  function listBonusChoresForToday(kidId) {
    return getKidBonusChoresForToday(kidId);
  }

  function removeBonusChore(kidId, choreId) {
    const all = getBonusChoresRaw();
    if (!all[kidId]) return;
    all[kidId] = all[kidId].filter(c => c.id !== choreId);
    saveBonusChoresRaw(all);
  }

  return {
    render, renderTodayStrip, startMidnightReset,
    addBonusChore, listBonusChoresForToday, removeBonusChore,
  };
})();
