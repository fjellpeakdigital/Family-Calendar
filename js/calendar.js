/* ============================================================
   calendar.js — Google Calendar fetch, week view, month view
   ============================================================ */

window.Calendar = (() => {
  let _cache      = {};
  let _eventsById = {};   // id → event object for modal lookup
  let _lastFetch  = 0;
  let _fetchMin   = null;
  let _fetchMax   = null;
  const CACHE_MS  = 5 * 60_000;

  let _view     = 'week';          // 'week' | 'month'
  let _viewDate = new Date();      // anchor date for current view

  const DAY_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTH_FULL = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

  // ── Date helpers ──────────────────────────────────────────
  function toLocalDateStr(d) {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const dt = typeof d === 'string' ? new Date(d) : d;
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  }

  function todayStr() { return toLocalDateStr(new Date()); }

  function weekStart(d) {
    // Sunday of the week containing d
    const dt = new Date(d);
    dt.setDate(dt.getDate() - dt.getDay());
    dt.setHours(0,0,0,0);
    return dt;
  }

  function monthStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth()    === b.getMonth()
        && a.getDate()     === b.getDate();
  }

  function formatTime(isoStr, allDay) {
    if (allDay) return 'All day';
    const d = new Date(isoStr);
    if (CONFIG.TIME_FORMAT_24H) {
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }
    let h = d.getHours(), m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return m === 0 ? `${h} ${ampm}` : `${h}:${String(m).padStart(2,'0')} ${ampm}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Fetch ──────────────────────────────────────────────────
  async function fetchEventsForOwner(idx, minDate, maxDate) {
    const tok = Auth.getToken(idx);
    if (!Auth.isTokenValid(tok)) return [];

    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin',      minDate.toISOString());
    url.searchParams.set('timeMax',      maxDate.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy',      'startTime');
    url.searchParams.set('maxResults',   '200');

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (!resp.ok) { console.error(`Calendar fetch ${idx}:`, resp.status); return []; }

    const data  = await resp.json();
    const owner = CONFIG.CALENDAR_OWNERS[idx];
    return (data.items || []).map(item => ({
      id:          item.id,
      title:       item.summary     || '(No title)',
      allDay:      !!item.start?.date,
      start:       item.start?.dateTime || item.start?.date,
      end:         item.end?.dateTime   || item.end?.date,
      color:       owner.color,
      owner:       owner.name,
      ownerIdx:    idx,
      description: item.description || '',
      location:    item.location    || '',
      htmlLink:    item.htmlLink     || '',
      attendees:   (item.attendees || [])
                     .filter(a => !a.self)
                     .map(a => a.displayName || a.email),
      meetLink:    item.conferenceData?.entryPoints
                     ?.find(e => e.entryPointType === 'video')?.uri || '',
      status:      item.status || 'confirmed',
    }));
  }

  async function fetchAll(force = false) {
    // Fetch window: 6 weeks before today → 16 weeks after today
    // Covers month-back navigation and lookahead
    const minDate = addDays(weekStart(new Date()), -42);
    const maxDate = addDays(new Date(), Math.max(CONFIG.CALENDAR_LOOKAHEAD_DAYS, 112));

    const alreadyCurrent = _fetchMin === minDate.toISOString()
                        && _fetchMax === maxDate.toISOString();
    if (!force && alreadyCurrent && Date.now() - _lastFetch < CACHE_MS) return;

    const results = await Promise.allSettled(
      CONFIG.CALENDAR_OWNERS.map((_, i) => fetchEventsForOwner(i, minDate, maxDate))
    );
    _cache = {};
    _eventsById = {};
    results.forEach((r, i) => {
      _cache[i] = r.status === 'fulfilled' ? r.value : [];
      _cache[i].forEach(ev => { _eventsById[ev.id] = ev; });
    });
    _lastFetch = Date.now();
    _fetchMin  = minDate.toISOString();
    _fetchMax  = maxDate.toISOString();
  }

  function allEvents() {
    return Object.values(_cache).flat().sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return new Date(a.start) - new Date(b.start);
    });
  }

  function eventsForDay(dateObj) {
    const ds = toLocalDateStr(dateObj);
    return allEvents().filter(ev => toLocalDateStr(ev.start) === ds);
  }

  // ── Week View ──────────────────────────────────────────────
  function renderWeekView(container) {
    const start = weekStart(_viewDate);
    const days  = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const today = new Date();

    // Update title
    const titleEl = document.getElementById('cal-view-title');
    if (titleEl) {
      const endDay = days[6];
      if (start.getMonth() === endDay.getMonth()) {
        titleEl.textContent = `${MONTH_FULL[start.getMonth()]} ${start.getDate()} – ${endDay.getDate()}, ${start.getFullYear()}`;
      } else {
        titleEl.textContent = `${MONTH_FULL[start.getMonth()]} ${start.getDate()} – ${MONTH_FULL[endDay.getMonth()]} ${endDay.getDate()}, ${endDay.getFullYear()}`;
      }
    }

    const grid = document.createElement('div');
    grid.className = 'cal-week-grid';

    days.forEach(day => {
      const isToday = isSameDay(day, today);
      const col = document.createElement('div');
      col.className = `cal-week-col${isToday ? ' today-col' : ''}`;

      // Day header
      const hdr = document.createElement('div');
      hdr.className = 'cal-week-day-header';
      const numEl = document.createElement('span');
      numEl.className = 'cal-day-num';
      numEl.textContent = day.getDate();
      hdr.innerHTML = `<span class="cal-day-name">${DAY_SHORT[day.getDay()]}</span>`;
      hdr.appendChild(numEl);
      col.appendChild(hdr);

      // Events
      const events = eventsForDay(day);
      if (events.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'cal-no-events';
        col.appendChild(empty);
      } else {
        events.forEach((ev, idx) => {
          const chip = document.createElement('div');
          chip.className = 'cal-event-chip';
          chip.style.borderLeftColor = ev.color;
          chip.style.animationDelay  = `${idx * 15}ms`;
          chip.innerHTML = `
            <div class="cal-event-chip-title">${escapeHtml(ev.title)}</div>
            <div class="cal-event-chip-time">${formatTime(ev.start, ev.allDay)}</div>
          `;
          makeChipClickable(chip, ev.id);
          col.appendChild(chip);
        });
      }

      grid.appendChild(col);
    });

    container.appendChild(grid);
  }

  // ── Month View ─────────────────────────────────────────────
  function renderMonthView(container) {
    const year  = _viewDate.getFullYear();
    const month = _viewDate.getMonth();
    const today = new Date();

    // Update title
    const titleEl = document.getElementById('cal-view-title');
    if (titleEl) titleEl.textContent = `${MONTH_FULL[month]} ${year}`;

    const grid = document.createElement('div');
    grid.className = 'cal-month-grid';

    // Day-of-week headers
    DAY_SHORT.forEach(name => {
      const dow = document.createElement('div');
      dow.className = 'cal-month-dow';
      dow.textContent = name;
      grid.appendChild(dow);
    });

    // Calendar cells
    const firstDay    = new Date(year, month, 1);
    const startOffset = firstDay.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells  = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      const dayNum  = i - startOffset + 1;
      const cellDate = new Date(year, month, dayNum);
      const inMonth  = dayNum >= 1 && dayNum <= daysInMonth;
      const isToday  = isSameDay(cellDate, today);

      const cell = document.createElement('div');
      cell.className = `cal-month-cell${isToday ? ' today-cell' : ''}${!inMonth ? ' other-month' : ''}`;

      const dateNum = document.createElement('div');
      dateNum.className = 'cal-month-date';
      dateNum.textContent = cellDate.getDate();
      cell.appendChild(dateNum);

      if (inMonth || !inMonth) { // show events in adjacent months too for context
        const events = eventsForDay(cellDate);
        const maxShow = 3;
        events.slice(0, maxShow).forEach(ev => {
          const chip = document.createElement('div');
          chip.className = 'cal-month-event';
          chip.style.background = ev.color;
          chip.textContent = ev.allDay ? ev.title : `${formatTime(ev.start, false)} ${ev.title}`;
          makeChipClickable(chip, ev.id);
          cell.appendChild(chip);
        });
        if (events.length > maxShow) {
          const more = document.createElement('div');
          more.className = 'cal-month-more';
          more.textContent = `+${events.length - maxShow} more`;
          cell.appendChild(more);
        }
      }

      grid.appendChild(cell);
    }

    container.appendChild(grid);
  }

  // ── Event Detail Modal ────────────────────────────────────
  function makeChipClickable(el, evId) {
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      showEventDetail(evId);
    });
  }

  function showEventDetail(evId) {
    const ev = _eventsById[evId];
    if (!ev) return;

    const overlay = document.getElementById('event-modal-overlay');
    const body    = document.getElementById('event-modal-body');
    if (!overlay || !body) return;

    const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

    function fmtDatetime(startIso, endIso, allDay) {
      if (allDay) {
        const s = new Date(startIso + (startIso.length === 10 ? 'T00:00:00' : ''));
        // end for all-day is exclusive
        const eRaw = new Date(endIso   + (endIso.length   === 10 ? 'T00:00:00' : ''));
        const e    = new Date(eRaw.getTime() - 86400_000); // last actual day
        const sStr = `${DAYS[s.getDay()]}, ${MONTHS[s.getMonth()]} ${s.getDate()}`;
        if (s.toDateString() === e.toDateString()) return sStr;
        return `${sStr} – ${MONTHS[e.getMonth()]} ${e.getDate()}`;
      }
      const s = new Date(startIso);
      const e = new Date(endIso);
      const dateStr = `${DAYS[s.getDay()]}, ${MONTHS[s.getMonth()]} ${s.getDate()}`;
      return `${dateStr} · ${formatTime(startIso, false)} – ${formatTime(endIso, false)}`;
    }

    function fmtDuration(startIso, endIso, allDay) {
      if (allDay) return '';
      const mins = Math.round((new Date(endIso) - new Date(startIso)) / 60_000);
      if (mins < 60) return `${mins}m`;
      const h = Math.floor(mins / 60), m = mins % 60;
      return m ? `${h}h ${m}m` : `${h}h`;
    }

    const when     = fmtDatetime(ev.start, ev.end, ev.allDay);
    const duration = fmtDuration(ev.start, ev.end, ev.allDay);
    const desc     = ev.description
      ? ev.description.replace(/\n/g, '<br>').replace(/<(?!br)[^>]+>/g, '') // strip HTML except <br>
      : '';

    body.innerHTML = `
      <div class="emd-header">
        <span class="emd-color-bar" style="background:${ev.color}"></span>
        <div class="emd-title">${escapeHtml(ev.title)}</div>
        <button class="emd-close" onclick="Calendar.closeModal()" aria-label="Close">✕</button>
      </div>

      <div class="emd-rows">
        <div class="emd-row">
          <span class="emd-icon">📅</span>
          <span class="emd-text">
            ${escapeHtml(when)}
            ${duration ? `<span class="emd-duration">${duration}</span>` : ''}
          </span>
        </div>

        ${ev.owner ? `
        <div class="emd-row">
          <span class="emd-icon">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${ev.color};vertical-align:middle"></span>
          </span>
          <span class="emd-text">${escapeHtml(ev.owner)}'s calendar</span>
        </div>` : ''}

        ${ev.location ? `
        <div class="emd-row">
          <span class="emd-icon">📍</span>
          <span class="emd-text">${escapeHtml(ev.location)}</span>
        </div>` : ''}

        ${ev.meetLink ? `
        <div class="emd-row">
          <span class="emd-icon">🎥</span>
          <a class="emd-link" href="${ev.meetLink}" target="_blank" rel="noopener">Join Google Meet</a>
        </div>` : ''}

        ${ev.attendees.length ? `
        <div class="emd-row">
          <span class="emd-icon">👥</span>
          <span class="emd-text">${ev.attendees.map(escapeHtml).join(', ')}</span>
        </div>` : ''}

        ${desc ? `
        <div class="emd-row emd-row-desc">
          <span class="emd-icon">📝</span>
          <span class="emd-text emd-desc">${desc}</span>
        </div>` : ''}
      </div>

      ${ev.htmlLink ? `
      <div class="emd-footer">
        <a class="emd-gcal-link" href="${ev.htmlLink}" target="_blank" rel="noopener">
          Open in Google Calendar ↗
        </a>
      </div>` : ''}
    `;

    overlay.classList.add('visible');
    // Close on overlay backdrop click
    overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
  }

  function closeModal() {
    const overlay = document.getElementById('event-modal-overlay');
    if (overlay) overlay.classList.remove('visible');
  }

  // ── Public: render calendar view ──────────────────────────
  async function render(force = false) {
    const container = document.getElementById('cal-view-container');
    if (!container) return;

    container.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><span>Loading…</span></div>';

    await fetchAll(force);

    container.innerHTML = '';
    if (_view === 'week') {
      renderWeekView(container);
    } else {
      renderMonthView(container);
    }
  }

  // ── Public: render today's events (for Today page) ────────
  async function renderTodayPanel(force = false) {
    const el = document.getElementById('today-events-panel');
    if (!el) return;

    await fetchAll(force);

    const today  = todayStr();
    const events = allEvents().filter(ev => toLocalDateStr(ev.start) === today);

    el.innerHTML = '';

    if (events.length === 0) {
      el.innerHTML = '<div class="no-events">Nothing scheduled for today</div>';
      return;
    }

    events.forEach((ev, i) => {
      const item = document.createElement('div');
      item.className = `event-item${ev.allDay ? ' event-allday' : ''}`;
      item.style.animationDelay = `${i * 20}ms`;
      item.innerHTML = `
        <div class="event-dot" style="background:${ev.color}"></div>
        <div class="event-body">
          <div class="event-title">${escapeHtml(ev.title)}</div>
          <div class="event-time">${formatTime(ev.start, ev.allDay)}
            ${CONFIG.CALENDAR_OWNERS.length > 1
              ? `<span class="event-who"> · ${escapeHtml(ev.owner)}</span>`
              : ''}
          </div>
        </div>
        <span class="event-detail-arrow">›</span>
      `;
      makeChipClickable(item, ev.id);
      el.appendChild(item);
    });
  }

  // ── Navigation controls ────────────────────────────────────
  function navigate(dir) {
    if (_view === 'week') {
      _viewDate = addDays(_viewDate, dir * 7);
    } else {
      _viewDate = new Date(_viewDate.getFullYear(), _viewDate.getMonth() + dir, 1);
    }
    render();
  }

  function goToToday() {
    _viewDate = new Date();
    render();
  }

  function setView(v) {
    _view = v;
    // Toggle button styles
    const wBtn = document.getElementById('btn-week');
    const mBtn = document.getElementById('btn-month');
    if (wBtn) wBtn.classList.toggle('active', v === 'week');
    if (mBtn) mBtn.classList.toggle('active', v === 'month');
    render();
  }

  // ── Auto-refresh ──────────────────────────────────────────
  function startAutoRefresh() {
    setInterval(() => {
      fetchAll(true).then(() => {
        // Re-render whichever view/panel is currently visible
        const calContainer = document.getElementById('cal-view-container');
        if (calContainer) render();
        const todayPanel = document.getElementById('today-events-panel');
        if (todayPanel) renderTodayPanel();
      });
    }, CACHE_MS);
  }

  // Close modal on Escape
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  return { render, renderTodayPanel, navigate, goToToday, setView, startAutoRefresh, closeModal };
})();
