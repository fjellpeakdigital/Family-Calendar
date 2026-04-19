/* ============================================================
   admin.js — PIN-protected settings panel
   ============================================================
   Access: tap the ⚙ gear button in the footer.
   Default PIN: 1234

   Tabs: People | Calendars | Chores | Settings
   ============================================================ */

window.Admin = (() => {
  let _pinBuffer  = '';
  let _activeTab  = 'people';
  let _calLists   = {};   // { email: [calendarListItem, ...] }

  // ── Color & emoji palettes ────────────────────────────────
  const COLORS = [
    '#58A6FF','#FF7EB3','#3FB950','#F59E0B',
    '#8B5CF6','#EC4899','#14B8A6','#F87171',
    '#A78BFA','#34D399','#FBBF24','#FF8C42',
  ];

  const EMOJIS_ADULT = ['👤','👩','👨','🧑','🦸','🧙','🎅','🧔','👩‍💼','👨‍💼','🦊','🐻'];
  const EMOJIS_KID   = ['🧒','👧','👦','👶','🐱','🐶','🦄','🐸','🎈','⭐','🚀','🎮'];

  // ── localStorage helpers ──────────────────────────────────
  function getPeople() {
    try { return JSON.parse(localStorage.getItem('fd_people')) || []; } catch { return []; }
  }
  function savePeople(arr) {
    localStorage.setItem('fd_people', JSON.stringify(arr));
  }

  function getChoreData() {
    try { return JSON.parse(localStorage.getItem('fd_chore_data')) || {}; } catch { return {}; }
  }
  function saveChoreData(obj) {
    localStorage.setItem('fd_chore_data', JSON.stringify(obj));
  }

  function getRewards() {
    try { return JSON.parse(localStorage.getItem('fd_rewards')) || {}; } catch { return {}; }
  }
  function saveRewards(obj) {
    localStorage.setItem('fd_rewards', JSON.stringify(obj));
  }

  function getAssignments() {
    try { return JSON.parse(localStorage.getItem('fd_cal_assignments')) || []; } catch { return []; }
  }
  function saveAssignments(arr) {
    localStorage.setItem('fd_cal_assignments', JSON.stringify(arr));
  }

  function getPin() { return localStorage.getItem('fd_pin') || '1234'; }
  function savePin(p) { localStorage.setItem('fd_pin', p); }

  function getSavedSettings() {
    try { return JSON.parse(localStorage.getItem('fd_settings') || '{}'); } catch { return {}; }
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    const btn = document.getElementById('admin-btn');
    if (btn) btn.addEventListener('click', openAdmin);

    // Close on overlay background click
    const overlay = document.getElementById('admin-overlay');
    if (overlay) {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) closeAdmin();
      });
    }

    // Tab buttons
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Close button
    const closeBtn = document.getElementById('admin-close');
    if (closeBtn) closeBtn.addEventListener('click', closeAdmin);

    // Apply saved settings to CONFIG on load
    const saved = getSavedSettings();
    if (saved.LOCATION)               CONFIG.LOCATION = saved.LOCATION;
    if (saved.TIME_FORMAT_24H != null) CONFIG.TIME_FORMAT_24H = saved.TIME_FORMAT_24H;
    if (saved.CALENDAR_LOOKAHEAD_DAYS) CONFIG.CALENDAR_LOOKAHEAD_DAYS = saved.CALENDAR_LOOKAHEAD_DAYS;
  }

  // ── Open / Close ──────────────────────────────────────────
  function openAdmin() {
    _pinBuffer = '';
    updatePinDots();
    const errEl = document.getElementById('pin-error');
    if (errEl) errEl.style.display = 'none';
    document.getElementById('pin-screen').style.display  = 'flex';
    document.getElementById('admin-panel').style.display = 'none';
    document.getElementById('admin-overlay').classList.add('visible');
  }

  function closeAdmin() {
    document.getElementById('admin-overlay').classList.remove('visible');
  }

  // ── PIN Screen ────────────────────────────────────────────
  function updatePinDots() {
    document.querySelectorAll('.pin-dot').forEach((dot, i) => {
      dot.classList.toggle('filled', i < _pinBuffer.length);
    });
  }

  function pinKey(char) {
    if (char === 'back') {
      _pinBuffer = _pinBuffer.slice(0, -1);
      updatePinDots();
    } else if (_pinBuffer.length < 4) {
      _pinBuffer += char;
      updatePinDots();
      if (_pinBuffer.length === 4) setTimeout(checkPin, 150);
    }
  }

  function checkPin() {
    if (_pinBuffer === getPin()) {
      document.getElementById('pin-screen').style.display  = 'none';
      document.getElementById('admin-panel').style.display = 'flex';
      switchTab('people');
    } else {
      const display = document.querySelector('.pin-display');
      if (display) {
        display.classList.add('shake');
        setTimeout(() => display.classList.remove('shake'), 400);
      }
      const errEl = document.getElementById('pin-error');
      if (errEl) { errEl.textContent = 'Incorrect PIN'; errEl.style.display = 'block'; }
      _pinBuffer = '';
      updatePinDots();
      setTimeout(() => { if (errEl) errEl.style.display = 'none'; }, 2000);
    }
  }

  // ── Tabs ──────────────────────────────────────────────────
  function switchTab(tab) {
    _activeTab = tab;
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    renderTabContent(tab);
  }

  function renderTabContent(tab) {
    const el = document.getElementById('admin-content');
    if (!el) return;
    el.innerHTML = '';
    switch (tab) {
      case 'people':    renderPeopleTab(el);    break;
      case 'calendars': renderCalendarsTab(el); break;
      case 'chores':    renderChoresTab(el);    break;
      case 'settings':  renderSettingsTab(el);  break;
    }
  }

  // ══════════════════════════════════════════════════════════
  // TAB: PEOPLE
  // ══════════════════════════════════════════════════════════
  function renderPeopleTab(el) {
    const people = getPeople();
    const adults = people.filter(p => p.type === 'adult');
    const kids   = people.filter(p => p.type === 'kid');

    el.innerHTML = `
      <div class="admin-section">
        <div class="admin-section-header">
          <h3>Adults</h3>
          <button class="btn btn-sm btn-outline" id="add-adult-btn">+ Add Adult</button>
        </div>
        <div id="adults-list" class="people-list"></div>
      </div>
      <div class="admin-section">
        <div class="admin-section-header">
          <h3>Kids</h3>
          <button class="btn btn-sm btn-outline" id="add-kid-btn">+ Add Kid</button>
        </div>
        <div id="kids-list" class="people-list"></div>
      </div>
    `;

    renderPeopleList(document.getElementById('adults-list'), adults, 'adult');
    renderPeopleList(document.getElementById('kids-list'),   kids,   'kid');

    document.getElementById('add-adult-btn').addEventListener('click', () => showPersonForm(null, 'adult'));
    document.getElementById('add-kid-btn').addEventListener('click',   () => showPersonForm(null, 'kid'));
  }

  function renderPeopleList(container, people, type) {
    if (people.length === 0) {
      container.innerHTML = `<div class="admin-empty">No ${type}s added yet.</div>`;
      return;
    }
    people.forEach(p => {
      const row = document.createElement('div');
      row.className = 'person-row';
      row.innerHTML = `
        <span class="person-emoji">${escapeHtml(p.emoji || '👤')}</span>
        <span class="person-name" style="color:${escapeHtml(p.color)}">${escapeHtml(p.name)}</span>
        <span class="person-type-badge">${p.type}</span>
        <button class="btn btn-sm btn-outline" data-edit="${escapeHtml(p.id)}">Edit</button>
        <button class="btn btn-sm btn-danger"  data-remove="${escapeHtml(p.id)}">Remove</button>
      `;
      row.querySelector('[data-edit]').addEventListener('click', () => showPersonForm(p, p.type));
      row.querySelector('[data-remove]').addEventListener('click', () => removePerson(p.id));
      container.appendChild(row);
    });
  }

  function showPersonForm(person, type) {
    const isNew = !person;
    const emojis = type === 'kid' ? EMOJIS_KID : EMOJIS_ADULT;
    const currentEmoji = person?.emoji || emojis[0];
    const currentColor = person?.color || COLORS[0];

    const modal = document.createElement('div');
    modal.className = 'person-form-modal';
    modal.innerHTML = `
      <div class="person-form">
        <h3>${isNew ? `Add ${type}` : 'Edit person'}</h3>

        <label>Name</label>
        <input id="pf-name" type="text" class="admin-input" value="${escapeHtml(person?.name || '')}" placeholder="Name" />

        <label>Emoji</label>
        <div class="emoji-grid" id="pf-emojis">
          ${emojis.map(e => `
            <button class="emoji-btn${e === currentEmoji ? ' selected' : ''}" data-emoji="${e}">${e}</button>
          `).join('')}
        </div>
        <input type="hidden" id="pf-emoji" value="${escapeHtml(currentEmoji)}" />

        <label>Color</label>
        <div class="color-swatches" id="pf-colors">
          ${COLORS.map(c => `
            <button class="color-swatch${c === currentColor ? ' selected' : ''}"
                    data-color="${c}" style="background:${c}"></button>
          `).join('')}
        </div>
        <input type="hidden" id="pf-color" value="${escapeHtml(currentColor)}" />

        <div class="form-actions">
          <button class="btn btn-outline" id="pf-cancel">Cancel</button>
          <button class="btn btn-primary" id="pf-save">Save</button>
        </div>
      </div>
    `;

    document.getElementById('admin-content').appendChild(modal);

    // Emoji selection
    modal.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('pf-emoji').value = btn.dataset.emoji;
      });
    });

    // Color selection
    modal.querySelectorAll('.color-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('pf-color').value = btn.dataset.color;
      });
    });

    document.getElementById('pf-cancel').addEventListener('click', () => modal.remove());

    document.getElementById('pf-save').addEventListener('click', () => {
      const name  = document.getElementById('pf-name').value.trim();
      const emoji = document.getElementById('pf-emoji').value;
      const color = document.getElementById('pf-color').value;
      if (!name) return;

      const people = getPeople();
      if (isNew) {
        people.push({ id: crypto.randomUUID(), name, emoji, color, type });
      } else {
        const idx = people.findIndex(p => p.id === person.id);
        if (idx >= 0) people[idx] = { ...people[idx], name, emoji, color };
      }
      savePeople(people);
      modal.remove();
      renderTabContent('people');
    });
  }

  function removePerson(id) {
    if (!confirm('Remove this person? This will also remove their chores.')) return;
    const people = getPeople().filter(p => p.id !== id);
    savePeople(people);
    // Remove their chores
    const cd = getChoreData();
    delete cd[id];
    saveChoreData(cd);
    // Remove their calendar assignments
    saveAssignments(getAssignments().filter(a => a.personId !== id));
    renderTabContent('people');
  }

  // ══════════════════════════════════════════════════════════
  // TAB: CALENDARS
  // ══════════════════════════════════════════════════════════
  function renderCalendarsTab(el) {
    const tokens = Auth.getAllTokens();
    const people = getPeople();

    if (tokens.length === 0) {
      el.innerHTML = `
        <div class="admin-section">
          <p class="admin-empty">No Google accounts connected.</p>
          <button class="btn btn-primary" id="cal-connect-btn">Connect Google Account</button>
        </div>
      `;
      document.getElementById('cal-connect-btn').addEventListener('click', async () => {
        el.innerHTML = '<div class="admin-loading">Opening sign-in…</div>';
        await Auth.signIn();
        renderTabContent('calendars');
      });
      return;
    }

    el.innerHTML = `
      <div class="admin-section">
        <p class="admin-hint">Assign each calendar to a family member. Unassigned calendars won't appear on the dashboard.</p>
      </div>
      <div id="cal-accounts"></div>
      <div class="admin-section">
        <button class="btn btn-outline" id="cal-connect-btn">+ Connect Another Account</button>
      </div>
    `;

    document.getElementById('cal-connect-btn').addEventListener('click', async () => {
      const btn = document.getElementById('cal-connect-btn');
      btn.disabled = true;
      btn.textContent = 'Opening sign-in…';
      await Auth.signIn();
      renderTabContent('calendars');
    });

    const accountsEl = document.getElementById('cal-accounts');

    tokens.forEach(tok => {
      const section = document.createElement('div');
      section.className = 'admin-section';
      const valid = Auth.isValid(tok);

      section.innerHTML = `
        <div class="admin-section-header">
          <h3>${escapeHtml(tok.name || tok.email)}
            <span class="account-email">${escapeHtml(tok.email)}</span>
          </h3>
          <div style="display:flex;gap:8px">
            ${!valid
              ? `<button class="btn btn-sm btn-primary" data-reconnect="${escapeHtml(tok.email)}">Reconnect</button>`
              : ''}
            <button class="btn btn-sm btn-danger" data-disconnect="${escapeHtml(tok.email)}">Disconnect</button>
          </div>
        </div>
        <div class="cal-list-container" id="cals-${escapeHtml(accountKey(tok.email))}">
          ${valid ? '<div class="admin-loading">Loading calendars…</div>' : '<p class="admin-hint">Sign in to manage calendars.</p>'}
        </div>
      `;
      accountsEl.appendChild(section);

      // Disconnect handler
      section.querySelector('[data-disconnect]')?.addEventListener('click', () => {
        if (!confirm(`Disconnect ${tok.email}?`)) return;
        Auth.clearToken(tok.email);
        renderTabContent('calendars');
      });

      // Reconnect handler
      section.querySelector('[data-reconnect]')?.addEventListener('click', async () => {
        await Auth.signIn(tok.email);
        renderTabContent('calendars');
      });

      // Fetch and render calendar list
      if (valid) {
        fetchAndRenderCalendars(tok, document.getElementById(`cals-${accountKey(tok.email)}`), people);
      }
    });
  }

  function accountKey(email) {
    return email.replace(/[^a-zA-Z0-9]/g, '_');
  }

  async function fetchAndRenderCalendars(tok, container, people) {
    // Use cached list if available
    if (!_calLists[tok.email]) {
      try {
        const resp = await Auth.apiFetch(tok,
          'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader'
        );
        const data = await resp.json();
        _calLists[tok.email] = data.items || [];
      } catch (e) {
        container.innerHTML = `<p class="admin-hint">Could not load calendars: ${escapeHtml(String(e))}</p>`;
        return;
      }
    }

    const cals        = _calLists[tok.email];
    const assignments = getAssignments();

    if (cals.length === 0) {
      container.innerHTML = '<p class="admin-hint">No calendars found.</p>';
      return;
    }

    container.innerHTML = '';
    cals.forEach(cal => {
      const existing = assignments.find(
        a => a.calendarId === cal.id && a.accountEmail === tok.email
      );

      const row = document.createElement('div');
      row.className = 'cal-row';
      row.innerHTML = `
        <span class="cal-color-badge" style="background:${escapeHtml(cal.backgroundColor || '#888')}"></span>
        <span class="cal-name">${escapeHtml(cal.summary || cal.id)}</span>
        <select class="admin-select cal-assign-select" data-cal-id="${escapeHtml(cal.id)}" data-email="${escapeHtml(tok.email)}">
          <option value="">— Not shown —</option>
          ${people.map(p => `
            <option value="${escapeHtml(p.id)}" ${existing?.personId === p.id ? 'selected' : ''}>
              ${escapeHtml(p.emoji || '')} ${escapeHtml(p.name)}
            </option>
          `).join('')}
        </select>
      `;

      row.querySelector('select').addEventListener('change', e => {
        const newPersonId = e.target.value;
        const all = getAssignments().filter(
          a => !(a.calendarId === cal.id && a.accountEmail === tok.email)
        );
        if (newPersonId) {
          all.push({ calendarId: cal.id, accountEmail: tok.email, personId: newPersonId });
        }
        saveAssignments(all);
      });

      container.appendChild(row);
    });
  }

  // ══════════════════════════════════════════════════════════
  // TAB: CHORES
  // ══════════════════════════════════════════════════════════
  const ALL_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  function renderChoresTab(el) {
    const kids = getPeople().filter(p => p.type === 'kid');

    if (kids.length === 0) {
      el.innerHTML = `
        <div class="admin-section">
          <p class="admin-empty">No kids added yet. Add kids in the People tab first.</p>
        </div>
      `;
      return;
    }

    el.innerHTML = '';
    const choreData = getChoreData();

    kids.forEach(kid => {
      const chores = choreData[kid.id] || [];
      const section = document.createElement('div');
      section.className = 'admin-section';
      section.innerHTML = `
        <div class="admin-section-header">
          <h3 style="color:${escapeHtml(kid.color)}">${escapeHtml(kid.emoji || '🧒')} ${escapeHtml(kid.name)}</h3>
        </div>
        <div class="chore-admin-list" id="chores-${escapeHtml(kid.id)}"></div>
        <div class="add-chore-form">
          <input type="text" class="admin-input" id="new-task-${escapeHtml(kid.id)}" placeholder="New chore…" />
          <div class="day-toggles" id="day-toggles-${escapeHtml(kid.id)}">
            ${ALL_DAYS.map(d => `
              <button class="day-btn selected" data-day="${d}">${d}</button>
            `).join('')}
          </div>
          <div class="period-toggles" id="period-toggles-${escapeHtml(kid.id)}">
            <span class="period-label-hint">Time of day:</span>
            <button class="period-btn selected" data-period="anytime">Any time</button>
            <button class="period-btn" data-period="morning">Morning</button>
            <button class="period-btn" data-period="afternoon">Afternoon</button>
            <button class="period-btn" data-period="evening">Evening</button>
          </div>
          <div class="chore-points-row">
            <span class="period-label-hint">Points:</span>
            <div class="points-preset-btns">
              <button class="points-preset selected" data-pts="1">1</button>
              <button class="points-preset" data-pts="2">2</button>
              <button class="points-preset" data-pts="5">5</button>
              <button class="points-preset" data-pts="10">10</button>
            </div>
            <input type="number" class="admin-input points-custom-input"
                   id="new-pts-${escapeHtml(kid.id)}" min="1" max="100" value="1" />
          </div>
          <button class="btn btn-sm btn-primary add-chore-btn" data-kid="${escapeHtml(kid.id)}">Add Chore</button>
        </div>

        <div class="admin-section-header" style="margin-top:16px">
          <h3>🏆 Rewards</h3>
          <button class="btn btn-sm btn-outline add-reward-btn" data-kid="${escapeHtml(kid.id)}">+ Add Reward</button>
        </div>
        <div class="rewards-admin-list" id="rewards-${escapeHtml(kid.id)}"></div>
      `;
      el.appendChild(section);

      renderChoreList(document.getElementById(`chores-${kid.id}`), kid, chores);
      renderRewardList(document.getElementById(`rewards-${kid.id}`), kid);

      // Day toggle buttons
      section.querySelectorAll('.day-btn').forEach(btn => {
        btn.addEventListener('click', () => btn.classList.toggle('selected'));
      });

      // Period toggle buttons (single-select)
      section.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          section.querySelectorAll('.period-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
        });
      });

      // Points preset buttons — sync with number input
      const ptsInput = document.getElementById(`new-pts-${kid.id}`);
      section.querySelectorAll('.points-preset').forEach(btn => {
        btn.addEventListener('click', () => {
          section.querySelectorAll('.points-preset').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          ptsInput.value = btn.dataset.pts;
        });
      });
      ptsInput.addEventListener('input', () => {
        section.querySelectorAll('.points-preset').forEach(b =>
          b.classList.toggle('selected', b.dataset.pts === ptsInput.value)
        );
      });

      // Add chore button
      section.querySelector('.add-chore-btn').addEventListener('click', () => {
        const taskInput = document.getElementById(`new-task-${kid.id}`);
        const task = taskInput.value.trim();
        if (!task) return;
        const selectedDays = [...section.querySelectorAll('.day-btn.selected')].map(b => b.dataset.day);
        if (selectedDays.length === 0) return;
        const period = section.querySelector('.period-btn.selected')?.dataset.period || 'anytime';
        const points = Math.max(1, parseInt(ptsInput.value, 10) || 1);

        const cd = getChoreData();
        if (!cd[kid.id]) cd[kid.id] = [];
        cd[kid.id].push({ id: crypto.randomUUID(), task, days: selectedDays, period, points });
        saveChoreData(cd);
        taskInput.value = '';
        ptsInput.value = '1';
        section.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('selected', b.dataset.period === 'anytime'));
        section.querySelectorAll('.points-preset').forEach(b => b.classList.toggle('selected', b.dataset.pts === '1'));
        renderChoreList(document.getElementById(`chores-${kid.id}`), kid, cd[kid.id]);
      });

      // Add reward button
      section.querySelector('.add-reward-btn').addEventListener('click', () => {
        showRewardForm(kid, document.getElementById(`rewards-${kid.id}`));
      });
    });
  }

  function renderChoreList(container, kid, chores) {
    container.innerHTML = '';
    if (chores.length === 0) {
      container.innerHTML = '<div class="admin-empty">No chores yet.</div>';
      return;
    }
    chores.forEach(chore => {
      const row = buildChoreRow(container, kid, chore);
      container.appendChild(row);
    });
  }

  function buildChoreRow(container, kid, chore) {
    const row = document.createElement('div');
    row.className = 'chore-admin-row';
    const periodLabel = { morning: '🌅 Morning', afternoon: '☀️ Afternoon', evening: '🌙 Evening' }[chore.period] || '';
    const pts = chore.points || 1;
    row.innerHTML = `
      <span class="chore-task-name">${escapeHtml(chore.task)}</span>
      ${periodLabel ? `<span class="chore-period-tag">${periodLabel}</span>` : ''}
      <span class="chore-pts-tag">⭐ ${pts}pt${pts !== 1 ? 's' : ''}</span>
      <span class="chore-days">${escapeHtml(chore.days.join(', '))}</span>
      <button class="btn btn-sm btn-outline" data-edit-chore="${escapeHtml(chore.id)}" aria-label="Edit chore">✎</button>
      <button class="btn btn-sm btn-danger"  data-remove-chore="${escapeHtml(chore.id)}" aria-label="Delete chore">✕</button>
    `;
    row.querySelector('[data-edit-chore]').addEventListener('click', () => {
      showChoreEditForm(row, container, kid, chore);
    });
    row.querySelector('[data-remove-chore]').addEventListener('click', () => {
      const cd = getChoreData();
      cd[kid.id] = (cd[kid.id] || []).filter(c => c.id !== chore.id);
      saveChoreData(cd);
      renderChoreList(container, kid, getChoreData()[kid.id] || []);
    });
    return row;
  }

  function showChoreEditForm(row, container, kid, chore) {
    const existing = container.querySelector('.chore-edit-form');
    if (existing) existing.remove();

    const form = document.createElement('div');
    form.className = 'add-chore-form chore-edit-form';
    const periodVal = chore.period || 'anytime';
    const ptsVal    = chore.points || 1;
    form.innerHTML = `
      <input type="text" class="admin-input ef-task" value="${escapeHtml(chore.task)}" placeholder="Chore name…" />
      <div class="day-toggles ef-days">
        ${ALL_DAYS.map(d => `
          <button class="day-btn${chore.days.includes(d) ? ' selected' : ''}" data-day="${d}">${d}</button>
        `).join('')}
      </div>
      <div class="period-toggles ef-periods">
        <span class="period-label-hint">Time of day:</span>
        ${['anytime','morning','afternoon','evening'].map(p => `
          <button class="period-btn${p === periodVal ? ' selected' : ''}" data-period="${p}">
            ${p === 'anytime' ? 'Any time' : p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        `).join('')}
      </div>
      <div class="chore-points-row">
        <span class="period-label-hint">Points:</span>
        <div class="points-preset-btns">
          ${[1,2,5,10].map(n => `
            <button class="points-preset${n === ptsVal ? ' selected' : ''}" data-pts="${n}">${n}</button>
          `).join('')}
        </div>
        <input type="number" class="admin-input points-custom-input ef-pts" min="1" max="100" value="${ptsVal}" />
      </div>
      <div class="form-actions">
        <button class="btn btn-sm btn-outline ef-cancel">Cancel</button>
        <button class="btn btn-sm btn-primary ef-save">Save</button>
      </div>
    `;
    row.after(form);
    row.style.display = 'none';

    form.querySelectorAll('.day-btn').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('selected'));
    });

    form.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        form.querySelectorAll('.period-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    const ptsInput = form.querySelector('.ef-pts');
    form.querySelectorAll('.points-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        form.querySelectorAll('.points-preset').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        ptsInput.value = btn.dataset.pts;
      });
    });
    ptsInput.addEventListener('input', () => {
      form.querySelectorAll('.points-preset').forEach(b =>
        b.classList.toggle('selected', b.dataset.pts === ptsInput.value)
      );
    });

    form.querySelector('.ef-cancel').addEventListener('click', () => {
      form.remove();
      row.style.display = '';
    });

    form.querySelector('.ef-save').addEventListener('click', () => {
      const task = form.querySelector('.ef-task').value.trim();
      if (!task) return;
      const days = [...form.querySelectorAll('.day-btn.selected')].map(b => b.dataset.day);
      if (days.length === 0) return;
      const period = form.querySelector('.period-btn.selected')?.dataset.period || 'anytime';
      const points = Math.max(1, parseInt(ptsInput.value, 10) || 1);

      const cd = getChoreData();
      const list = cd[kid.id] || [];
      const idx = list.findIndex(c => c.id === chore.id);
      if (idx >= 0) list[idx] = { ...list[idx], task, days, period, points };
      cd[kid.id] = list;
      saveChoreData(cd);
      renderChoreList(container, kid, list);
    });
  }

  // ── Rewards admin ─────────────────────────────────────────
  const REWARD_EMOJIS = ['🎮','🍕','🎬','🍦','📚','🎨','🎯','🏊','🛒','🎁','🌟','🦄'];

  function renderRewardList(container, kid) {
    const rewards = (getRewards()[kid.id] || []);
    container.innerHTML = '';
    if (rewards.length === 0) {
      container.innerHTML = '<div class="admin-empty">No rewards yet.</div>';
      return;
    }
    rewards.forEach(reward => {
      const row = document.createElement('div');
      row.className = 'chore-admin-row';
      row.innerHTML = `
        <span class="reward-emoji-display">${escapeHtml(reward.emoji || '🎁')}</span>
        <span class="chore-task-name">${escapeHtml(reward.name)}</span>
        <span class="chore-pts-tag">⭐ ${reward.points} pts</span>
        <button class="btn btn-sm btn-danger" data-remove-reward="${escapeHtml(reward.id)}">✕</button>
      `;
      row.querySelector('[data-remove-reward]').addEventListener('click', () => {
        const r = getRewards();
        r[kid.id] = (r[kid.id] || []).filter(x => x.id !== reward.id);
        saveRewards(r);
        renderRewardList(container, kid);
      });
      container.appendChild(row);
    });
  }

  function showRewardForm(kid, listContainer) {
    // Remove any existing form
    listContainer.parentElement.querySelector('.reward-add-form')?.remove();

    const form = document.createElement('div');
    form.className = 'add-chore-form reward-add-form';
    form.innerHTML = `
      <div class="emoji-grid reward-emoji-picker">
        ${REWARD_EMOJIS.map((e, i) => `
          <button class="emoji-btn${i === 0 ? ' selected' : ''}" data-emoji="${e}">${e}</button>
        `).join('')}
      </div>
      <input type="hidden" id="rf-emoji" value="${REWARD_EMOJIS[0]}" />
      <input type="text" class="admin-input" id="rf-name" placeholder="Reward name…" />
      <div class="chore-points-row">
        <span class="period-label-hint">Cost (pts):</span>
        <input type="number" class="admin-input points-custom-input" id="rf-pts" min="1" value="25" />
      </div>
      <div class="form-actions">
        <button class="btn btn-outline btn-sm" id="rf-cancel">Cancel</button>
        <button class="btn btn-primary btn-sm" id="rf-save">Add Reward</button>
      </div>
    `;
    listContainer.parentElement.appendChild(form);

    form.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        form.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('rf-emoji').value = btn.dataset.emoji;
      });
    });

    document.getElementById('rf-cancel').addEventListener('click', () => form.remove());

    document.getElementById('rf-save').addEventListener('click', () => {
      const name = document.getElementById('rf-name').value.trim();
      if (!name) return;
      const pts  = Math.max(1, parseInt(document.getElementById('rf-pts').value, 10) || 25);
      const emoji = document.getElementById('rf-emoji').value;

      const r = getRewards();
      if (!r[kid.id]) r[kid.id] = [];
      r[kid.id].push({ id: crypto.randomUUID(), name, emoji, points: pts });
      saveRewards(r);
      form.remove();
      renderRewardList(listContainer, kid);
    });
  }

  // ══════════════════════════════════════════════════════════
  // TAB: SETTINGS
  // ══════════════════════════════════════════════════════════
  function renderSettingsTab(el) {
    const loc = CONFIG.LOCATION;
    el.innerHTML = `
      <div class="admin-section">
        <h3>Weather Location</h3>
        <div class="settings-grid">
          <label>City name</label>
          <input id="s-city" class="admin-input" type="text" value="${escapeHtml(loc.city)}" />
          <label>Latitude</label>
          <input id="s-lat"  class="admin-input" type="number" step="0.0001" value="${loc.lat}" />
          <label>Longitude</label>
          <input id="s-lon"  class="admin-input" type="number" step="0.0001" value="${loc.lon}" />
        </div>
      </div>

      <div class="admin-section">
        <h3>Calendar</h3>
        <div class="settings-grid">
          <label>Lookahead days</label>
          <input id="s-lookahead" class="admin-input" type="number" min="3" max="60"
                 value="${CONFIG.CALENDAR_LOOKAHEAD_DAYS}" />
          <label>24-hour clock</label>
          <label class="toggle-wrap">
            <input id="s-24h" type="checkbox" ${CONFIG.TIME_FORMAT_24H ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="admin-section">
        <h3>Change PIN</h3>
        <div class="settings-grid">
          <label>New PIN (4 digits)</label>
          <input id="s-pin" class="admin-input" type="password" maxlength="4"
                 pattern="[0-9]{4}" placeholder="1234" />
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" id="settings-save-btn">Save Settings</button>
      </div>
      <div id="settings-saved-msg" style="display:none;color:var(--success);margin-top:8px;text-align:center">
        ✓ Settings saved
      </div>
    `;

    document.getElementById('settings-save-btn').addEventListener('click', () => {
      const city     = document.getElementById('s-city').value.trim();
      const lat      = parseFloat(document.getElementById('s-lat').value);
      const lon      = parseFloat(document.getElementById('s-lon').value);
      const lookahead = parseInt(document.getElementById('s-lookahead').value, 10);
      const use24h   = document.getElementById('s-24h').checked;
      const newPin   = document.getElementById('s-pin').value.trim();

      if (city) {
        CONFIG.LOCATION = { lat: isNaN(lat) ? CONFIG.LOCATION.lat : lat,
                            lon: isNaN(lon) ? CONFIG.LOCATION.lon : lon,
                            city };
      }
      if (!isNaN(lookahead) && lookahead >= 3) CONFIG.CALENDAR_LOOKAHEAD_DAYS = lookahead;
      CONFIG.TIME_FORMAT_24H = use24h;

      if (newPin && /^\d{4}$/.test(newPin)) savePin(newPin);

      localStorage.setItem('fd_settings', JSON.stringify({
        LOCATION:               CONFIG.LOCATION,
        CALENDAR_LOOKAHEAD_DAYS: CONFIG.CALENDAR_LOOKAHEAD_DAYS,
        TIME_FORMAT_24H:        CONFIG.TIME_FORMAT_24H,
      }));

      const msg = document.getElementById('settings-saved-msg');
      msg.style.display = 'block';
      setTimeout(() => { msg.style.display = 'none'; }, 2000);
    });
  }

  return { init, openAdmin, closeAdmin, switchTab, pinKey };
})();
