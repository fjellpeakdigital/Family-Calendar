/* ============================================================
   calendar.js — Time-grid calendar (week / 4-day / month)
   ============================================================ */

window.Calendar = (() => {
  let _cache      = {};
  let _eventsById = {};
  let _lastFetch  = 0;
  let _fetchMin   = null;
  let _fetchMax   = null;
  const CACHE_MS  = 5 * 60_000;

  let _view     = 'week';     // 'week' | '4day' | 'month'
  let _viewDate = new Date();

  const GRID_START = 6;   // 6 AM
  const GRID_END   = 21;  // 9 PM  (15 hours)
  const HOUR_PX    = 68;  // pixels per hour — keep in sync with CSS

  const DAY_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTH_FULL = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

  // ── Helpers ───────────────────────────────────────────────
  function toLocalDateStr(d) {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const dt = typeof d === 'string' ? new Date(d) : d;
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  }

  function todayStr() { return toLocalDateStr(new Date()); }

  function weekStart(d) {
    const dt = new Date(d);
    dt.setDate(dt.getDate() - dt.getDay());
    dt.setHours(0,0,0,0);
    return dt;
  }

  function addDays(d, n) {
    const r = new Date(d); r.setDate(r.getDate() + n); return r;
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

  function formatHourLabel(h) {
    if (CONFIG.TIME_FORMAT_24H) return `${String(h).padStart(2,'0')}:00`;
    if (h === 0)  return '12 AM';
    if (h === 12) return '12 PM';
    return h < 12 ? `${h} AM` : `${h-12} PM`;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Convert hex color + alpha → rgba string for transparent event blocks
  function colorWithAlpha(hex, alpha) {
    const h = hex.replace('#','');
    const r = parseInt(h.slice(0,2),16);
    const g = parseInt(h.slice(2,4),16);
    const b = parseInt(h.slice(4,6),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ── Per-person filter (localStorage-backed) ────────────────
  function _getHiddenPeople() {
    try { return JSON.parse(localStorage.getItem('fd_cal_hidden_people')) || []; }
    catch { return []; }
  }
  function _setHiddenPeople(arr) {
    localStorage.setItem('fd_cal_hidden_people', JSON.stringify(arr));
  }
  function togglePersonFilter(personId) {
    const hidden = new Set(_getHiddenPeople());
    if (hidden.has(personId)) hidden.delete(personId);
    else hidden.add(personId);
    _setHiddenPeople([...hidden]);
    render();
    if (document.getElementById('today-events-panel')) renderTodayPanel();
  }
  function clearPersonFilter() {
    _setHiddenPeople([]);
    render();
    if (document.getElementById('today-events-panel')) renderTodayPanel();
  }

  function eventsForDay(dateObj) {
    const ds = toLocalDateStr(dateObj);
    const hidden = new Set(_getHiddenPeople());
    const people = _getPeople();
    // Build owner-name → personId lookup so we can filter by id even though
    // events only carry the owner display name.
    const nameToId = {};
    people.forEach(p => { nameToId[p.name] = p.id; });
    return Object.values(_cache).flat()
      .filter(ev => toLocalDateStr(ev.start) === ds)
      .filter(ev => {
        const pid = nameToId[ev.owner];
        return !pid || !hidden.has(pid);
      })
      .sort((a,b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return new Date(a.start) - new Date(b.start);
      });
  }

  // ── Overlap layout ────────────────────────────────────────
  // Returns events annotated with { col, totalCols } for side-by-side rendering
  function layoutTimedEvents(events) {
    const sorted = events
      .filter(ev => !ev.allDay)
      .sort((a,b) => new Date(a.start) - new Date(b.start));

    const colEnds = [];   // end-time (ms) for each column
    const laid = sorted.map(ev => {
      const startMs = new Date(ev.start).getTime();
      const endMs   = Math.max(
        ev.end ? new Date(ev.end).getTime() : startMs + 30*60000,
        startMs + 15*60000   // minimum 15-min display height
      );
      let col = colEnds.findIndex(e => e <= startMs);
      if (col === -1) { col = colEnds.length; colEnds.push(endMs); }
      else colEnds[col] = endMs;
      return { ev, col, startMs, endMs };
    });

    // Determine total concurrent columns for each event
    return laid.map(item => {
      const concurrent = laid.filter(o =>
        o !== item && o.startMs < item.endMs && o.endMs > item.startMs
      );
      const totalCols = concurrent.length
        ? Math.max(item.col, ...concurrent.map(o => o.col)) + 1
        : 1;
      return { ...item, totalCols };
    });
  }

  // ── Fetch ──────────────────────────────────────────────────
  // Reads fd_cal_assignments + fd_people from localStorage so the
  // calendar works without any changes to config.js.
  function _getPeople() {
    try { return JSON.parse(localStorage.getItem('fd_people')) || []; } catch { return []; }
  }
  function _getAssignments() {
    try { return JSON.parse(localStorage.getItem('fd_cal_assignments')) || []; } catch { return []; }
  }

  // Fetch events for all calendars assigned under one account token
  async function fetchEventsForToken(tok, minDate, maxDate) {
    if (!Auth.isValid(tok)) return [];

    const assignments = _getAssignments().filter(a => a.accountEmail === tok.email);
    if (assignments.length === 0) return [];

    const people = _getPeople();
    const allEvents = [];

    for (const assignment of assignments) {
      const person = people.find(p => p.id === assignment.personId);
      if (!person) continue;

      const calId = encodeURIComponent(assignment.calendarId);
      const url   = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`
      );
      url.searchParams.set('timeMin',      minDate.toISOString());
      url.searchParams.set('timeMax',      maxDate.toISOString());
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy',      'startTime');
      url.searchParams.set('maxResults',   '200');

      try {
        const resp = await Auth.apiFetch(tok, url.toString());
        if (!resp.ok) { console.error(`Calendar fetch (${tok.email} / ${assignment.calendarId}):`, resp.status); continue; }
        const data = await resp.json();

        const events = (data.items || []).map(item => ({
          id:          item.id,
          title:       item.summary     || '(No title)',
          allDay:      !!item.start?.date,
          start:       item.start?.dateTime || item.start?.date,
          end:         item.end?.dateTime   || item.end?.date,
          color:       person.color,
          owner:       person.name,
          personId:    person.id,
          calendarId:  assignment.calendarId,
          accountEmail: tok.email,
          recurring:   !!item.recurringEventId,
          description: item.description || '',
          location:    item.location    || '',
          htmlLink:    item.htmlLink    || '',
          attendees:   (item.attendees || [])
                         .filter(a => !a.self)
                         .map(a => a.displayName || a.email),
          meetLink:    item.conferenceData?.entryPoints
                         ?.find(e => e.entryPointType === 'video')?.uri || '',
        }));
        allEvents.push(...events);
      } catch (e) {
        console.error(`Calendar fetch error (${tok.email}):`, e);
      }
    }
    return allEvents;
  }

  async function fetchAll(force = false) {
    const minDate = addDays(weekStart(new Date()), -42);
    const maxDate = addDays(new Date(), Math.max(CONFIG.CALENDAR_LOOKAHEAD_DAYS, 112));

    const alreadyCurrent = _fetchMin === minDate.toISOString()
                        && _fetchMax === maxDate.toISOString();
    if (!force && alreadyCurrent && Date.now() - _lastFetch < CACHE_MS) return;

    const tokens  = Auth.getValidTokens();
    const results = await Promise.allSettled(
      tokens.map(tok => fetchEventsForToken(tok, minDate, maxDate))
    );
    _cache = {}; _eventsById = {};
    let anyOk = tokens.length === 0;  // nothing to fetch is not a failure
    results.forEach((r, i) => {
      _cache[i] = r.status === 'fulfilled' ? r.value : [];
      if (r.status === 'fulfilled') anyOk = true;
      _cache[i].forEach(ev => { _eventsById[ev.id] = ev; });
    });
    _lastFetch = Date.now();
    _fetchMin  = minDate.toISOString();
    _fetchMax  = maxDate.toISOString();
    window.App?.recordDataFetch?.('calendar', anyOk);
  }

  // ── Time Grid (shared by week + 4-day) ────────────────────
  function renderTimeGrid(container, days) {
    const today = new Date();
    const now   = new Date();

    // ── Update toolbar title ─────────────────────────────────
    const titleEl = document.getElementById('cal-view-title');
    if (titleEl) {
      const s = days[0], e = days[days.length-1];
      if (s.getMonth() === e.getMonth()) {
        titleEl.textContent =
          `${MONTH_FULL[s.getMonth()]} ${s.getDate()} – ${e.getDate()}, ${s.getFullYear()}`;
      } else {
        titleEl.textContent =
          `${MONTH_FULL[s.getMonth()]} ${s.getDate()} – ${MONTH_FULL[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
      }
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'cal-tgrid-wrapper';

    // ── Day header row ───────────────────────────────────────
    const headerRow = document.createElement('div');
    headerRow.className = 'cal-tgrid-header-row';

    const gutterH = document.createElement('div');
    gutterH.className = 'cal-tgrid-gutter';
    headerRow.appendChild(gutterH);

    days.forEach(day => {
      const isToday = isSameDay(day, today);
      const dh = document.createElement('div');
      dh.className = `cal-tgrid-dayhead${isToday ? ' today' : ''}`;
      dh.innerHTML = `
        <span class="cal-tgrid-dayname">${DAY_SHORT[day.getDay()]}</span>
        <span class="cal-tgrid-daynum">${day.getDate()}</span>
      `;
      headerRow.appendChild(dh);
    });
    wrapper.appendChild(headerRow);

    // ── All-day strip ────────────────────────────────────────
    const allDayRow  = document.createElement('div');
    allDayRow.className = 'cal-tgrid-allday-row';

    const gutterA = document.createElement('div');
    gutterA.className = 'cal-tgrid-gutter';
    allDayRow.appendChild(gutterA);

    let hasAllDay = false;
    days.forEach(day => {
      const col = document.createElement('div');
      col.className = 'cal-tgrid-allday-col';
      eventsForDay(day).filter(ev => ev.allDay).forEach(ev => {
        hasAllDay = true;
        const chip = document.createElement('div');
        chip.className = 'cal-tgrid-allday-chip';
        chip.textContent = ev.owner ? `${ev.owner} – ${ev.title}` : ev.title;
        chip.style.background = colorWithAlpha(ev.color, 0.22);
        chip.style.borderLeft = `3px solid ${ev.color}`;
        makeChipClickable(chip, ev.id);
        col.appendChild(chip);
      });
      allDayRow.appendChild(col);
    });

    // Only show all-day strip if there are all-day events (or always for structure)
    allDayRow.style.display = hasAllDay ? 'flex' : 'none';
    wrapper.appendChild(allDayRow);

    // ── Scrollable body ──────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'cal-tgrid-body';

    // Time axis
    const axis = document.createElement('div');
    axis.className = 'cal-tgrid-axis';
    const totalHours = GRID_END - GRID_START;
    for (let h = GRID_START; h <= GRID_END; h++) {
      const lbl = document.createElement('div');
      lbl.className = 'cal-tgrid-hour-label';
      lbl.style.height = `${HOUR_PX}px`;
      lbl.textContent = h < GRID_END ? formatHourLabel(h) : '';
      axis.appendChild(lbl);
    }
    body.appendChild(axis);

    // Day columns
    const colsWrap = document.createElement('div');
    colsWrap.className = 'cal-tgrid-cols';
    colsWrap.style.gridTemplateColumns = `repeat(${days.length}, 1fr)`;

    const gridHeight = totalHours * HOUR_PX;

    days.forEach(day => {
      const isToday = isSameDay(day, today);
      const col     = document.createElement('div');
      col.className = `cal-tgrid-col${isToday ? ' today-col' : ''}`;
      col.style.height = `${gridHeight}px`;

      // Click an empty spot to create an event starting at that hour
      col.addEventListener('click', (e) => {
        if (e.target !== col) return;  // clicks on events stopPropagation
        const rect = col.getBoundingClientRect();
        const y    = e.clientY - rect.top;
        const hour = Math.max(GRID_START, Math.min(GRID_END - 1, Math.floor(y / HOUR_PX + GRID_START)));
        const startDate = new Date(day);
        startDate.setHours(hour, 0, 0, 0);
        const endDate   = new Date(startDate.getTime() + 60*60000);
        showEventForm({ initial: { start: startDate, end: endDate, allDay: false } });
      });

      // Hour and half-hour grid lines
      for (let h = 0; h < totalHours; h++) {
        const line = document.createElement('div');
        line.className = 'cal-tgrid-hour-line';
        line.style.top = `${h * HOUR_PX}px`;
        col.appendChild(line);

        const half = document.createElement('div');
        half.className = 'cal-tgrid-half-line';
        half.style.top = `${h * HOUR_PX + HOUR_PX / 2}px`;
        col.appendChild(half);
      }

      // Current time line
      if (isToday) {
        const nowH = now.getHours() + now.getMinutes() / 60;
        if (nowH >= GRID_START && nowH <= GRID_END) {
          const nowLine = document.createElement('div');
          nowLine.className = 'cal-tgrid-now-line';
          nowLine.style.top = `${(nowH - GRID_START) * HOUR_PX}px`;
          col.appendChild(nowLine);
        }
      }

      // Lay out timed events with overlap detection
      const timedEvents = eventsForDay(day).filter(ev => !ev.allDay);
      const laid = layoutTimedEvents(timedEvents);

      laid.forEach(({ ev, col: evCol, totalCols, startMs, endMs }) => {
        const startH = new Date(ev.start).getHours() + new Date(ev.start).getMinutes() / 60;
        const duration = (endMs - startMs) / 3600000;

        const topPx    = Math.max(0, (startH - GRID_START) * HOUR_PX);
        const heightPx = Math.max(duration * HOUR_PX, 22); // min 22px

        const pct   = 100 / totalCols;
        const left  = `calc(${evCol * pct}% + 2px)`;
        const width = `calc(${pct}% - 4px)`;

        const block = document.createElement('div');
        block.className = 'cal-tgrid-event';
        block.style.cssText = `
          top: ${topPx}px;
          height: ${heightPx}px;
          left: ${left};
          width: ${width};
          background: ${colorWithAlpha(ev.color, 0.22)};
          border-left-color: ${ev.color};
        `;

        const showTime = heightPx >= 36;
        block.innerHTML = `
          <div class="cal-tgrid-event-title">${ev.owner ? `<span class="ev-owner-prefix">${escapeHtml(ev.owner)}</span> – ` : ''}${escapeHtml(ev.title)}</div>
          ${showTime ? `<div class="cal-tgrid-event-time">${formatTime(ev.start, false)}${ev.end ? ` – ${formatTime(ev.end, false)}` : ''}</div>` : ''}
        `;
        makeChipClickable(block, ev.id);
        col.appendChild(block);
      });

      colsWrap.appendChild(col);
    });

    body.appendChild(colsWrap);
    wrapper.appendChild(body);
    container.appendChild(wrapper);

    // Auto-scroll to 8am (2 hours into grid)
    requestAnimationFrame(() => {
      body.scrollTop = (8 - GRID_START) * HOUR_PX;
    });
  }

  // ── Month View ─────────────────────────────────────────────
  function renderMonthView(container) {
    const year  = _viewDate.getFullYear();
    const month = _viewDate.getMonth();
    const today = new Date();

    const titleEl = document.getElementById('cal-view-title');
    if (titleEl) titleEl.textContent = `${MONTH_FULL[month]} ${year}`;

    const grid = document.createElement('div');
    grid.className = 'cal-month-grid';

    DAY_SHORT.forEach(name => {
      const dow = document.createElement('div');
      dow.className = 'cal-month-dow';
      dow.textContent = name;
      grid.appendChild(dow);
    });

    const firstDay    = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells  = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      const dayNum   = i - startOffset + 1;
      const cellDate = new Date(year, month, dayNum);
      const inMonth  = dayNum >= 1 && dayNum <= daysInMonth;
      const isToday  = isSameDay(cellDate, today);

      const cell = document.createElement('div');
      cell.className = `cal-month-cell${isToday ? ' today-cell' : ''}${!inMonth ? ' other-month' : ''}`;

      // Click empty area of the cell (not an event chip) to create all-day
      cell.addEventListener('click', (e) => {
        if (e.target !== cell && e.target.className !== 'cal-month-date') return;
        const startDate = new Date(cellDate); startDate.setHours(0,0,0,0);
        const endDate   = new Date(startDate);
        showEventForm({ initial: { start: startDate, end: endDate, allDay: true } });
      });

      const dateNum = document.createElement('div');
      dateNum.className = 'cal-month-date';
      dateNum.textContent = cellDate.getDate();
      cell.appendChild(dateNum);

      const events = eventsForDay(cellDate);
      const maxShow = 3;
      events.slice(0, maxShow).forEach(ev => {
        const chip = document.createElement('div');
        chip.className = 'cal-month-event';
        chip.style.background  = colorWithAlpha(ev.color, 0.25);
        chip.style.borderLeft  = `3px solid ${ev.color}`;
        chip.textContent = ev.allDay
          ? (ev.owner ? `${ev.owner} – ${ev.title}` : ev.title)
          : `${formatTime(ev.start, false)} ${ev.owner ? `${ev.owner} – ` : ''}${ev.title}`;
        makeChipClickable(chip, ev.id);
        cell.appendChild(chip);
      });
      if (events.length > maxShow) {
        const more = document.createElement('div');
        more.className = 'cal-month-more';
        more.textContent = `+${events.length - maxShow} more`;
        cell.appendChild(more);
      }

      grid.appendChild(cell);
    }

    container.appendChild(grid);
  }

  // ── Agenda View ───────────────────────────────────────────
  function renderAgendaView(container) {
    const today = new Date(); today.setHours(0,0,0,0);
    const span  = Math.max(14, CONFIG.CALENDAR_LOOKAHEAD_DAYS || 14);

    // Use the _viewDate so prev/next shifts the agenda window
    const viewStart = new Date(_viewDate); viewStart.setHours(0,0,0,0);
    const titleEl   = document.getElementById('cal-view-title');
    if (titleEl) {
      const endView = addDays(viewStart, span - 1);
      const sMonth  = MONTH_FULL[viewStart.getMonth()];
      const eMonth  = MONTH_FULL[endView.getMonth()];
      titleEl.textContent = sMonth === eMonth
        ? `${sMonth} ${viewStart.getDate()} – ${endView.getDate()}, ${endView.getFullYear()}`
        : `${sMonth} ${viewStart.getDate()} – ${eMonth} ${endView.getDate()}, ${endView.getFullYear()}`;
    }

    const list = document.createElement('div');
    list.className = 'cal-agenda-list';

    let hadAny = false;
    for (let i = 0; i < span; i++) {
      const day = addDays(viewStart, i);
      const events = eventsForDay(day);
      if (events.length === 0) continue;
      hadAny = true;

      const section = document.createElement('div');
      section.className = 'cal-agenda-day';

      const header = document.createElement('div');
      const isToday = isSameDay(day, today);
      header.className = `cal-agenda-day-header${isToday ? ' today' : ''}`;
      header.innerHTML = `
        <span class="cal-agenda-dayname">${DAY_SHORT[day.getDay()]}</span>
        <span class="cal-agenda-daynum">${day.getDate()}</span>
        <span class="cal-agenda-daymonth">${MONTH_FULL[day.getMonth()].slice(0,3)}</span>
        ${isToday ? '<span class="cal-agenda-today-pill">Today</span>' : ''}
      `;
      section.appendChild(header);

      events.forEach(ev => {
        const row = document.createElement('div');
        row.className = 'cal-agenda-row';
        row.style.borderLeftColor = ev.color;
        row.innerHTML = `
          <div class="cal-agenda-time">
            ${ev.allDay
              ? '<span class="cal-agenda-allday">All day</span>'
              : `<span class="cal-agenda-time-start">${escapeHtml(formatTime(ev.start, false))}</span>`}
          </div>
          <div class="cal-agenda-body">
            <div class="cal-agenda-title">${ev.owner ? `<span class="ev-owner-prefix">${escapeHtml(ev.owner)}</span> – ` : ''}${escapeHtml(ev.title)}</div>
            ${ev.location ? `<div class="cal-agenda-loc">📍 ${escapeHtml(ev.location)}</div>` : ''}
          </div>
          <span class="cal-agenda-arrow">›</span>
        `;
        makeChipClickable(row, ev.id);
        section.appendChild(row);
      });

      list.appendChild(section);
    }

    if (!hadAny) {
      const empty = document.createElement('div');
      empty.className = 'cal-agenda-empty';
      empty.textContent = `No events in the next ${span} days.`;
      list.appendChild(empty);
    }

    container.appendChild(list);
  }

  // ── Event Detail Modal ────────────────────────────────────
  function makeChipClickable(el, evId) {
    el.style.cursor = 'pointer';
    el.addEventListener('click', e => { e.stopPropagation(); showEventDetail(evId); });
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
        const s    = new Date(startIso + (startIso.length === 10 ? 'T00:00:00' : ''));
        const eRaw = new Date(endIso   + (endIso.length   === 10 ? 'T00:00:00' : ''));
        const e    = new Date(eRaw.getTime() - 86400_000);
        const sStr = `${DAYS[s.getDay()]}, ${MONTHS[s.getMonth()]} ${s.getDate()}`;
        return s.toDateString() === e.toDateString() ? sStr
          : `${sStr} – ${MONTHS[e.getMonth()]} ${e.getDate()}`;
      }
      const s = new Date(startIso), e = new Date(endIso);
      return `${DAYS[s.getDay()]}, ${MONTHS[s.getMonth()]} ${s.getDate()} · ${formatTime(startIso,false)} – ${formatTime(endIso,false)}`;
    }

    function fmtDuration(s, e, allDay) {
      if (allDay || !e) return '';
      const mins = Math.round((new Date(e) - new Date(s)) / 60_000);
      if (mins < 60) return `${mins}m`;
      const h = Math.floor(mins/60), m = mins%60;
      return m ? `${h}h ${m}m` : `${h}h`;
    }

    const when     = fmtDatetime(ev.start, ev.end, ev.allDay);
    const duration = fmtDuration(ev.start, ev.end, ev.allDay);
    const desc     = ev.description
      ? ev.description.replace(/\n/g,'<br>').replace(/<(?!br)[^>]+>/g,'') : '';

    body.innerHTML = `
      <div class="emd-header">
        <span class="emd-color-bar" style="background:${ev.color}"></span>
        <div class="emd-title">${escapeHtml(ev.title)}</div>
        <button class="emd-close" onclick="Calendar.closeModal()" aria-label="Close">✕</button>
      </div>
      <div class="emd-rows">
        <div class="emd-row">
          <span class="emd-icon">📅</span>
          <span class="emd-text">${escapeHtml(when)}
            ${duration ? `<span class="emd-duration">${duration}</span>` : ''}
          </span>
        </div>
        ${ev.owner ? `<div class="emd-row">
          <span class="emd-icon"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${ev.color};vertical-align:middle"></span></span>
          <span class="emd-text">${escapeHtml(ev.owner)}'s calendar</span>
        </div>` : ''}
        ${ev.location ? `<div class="emd-row">
          <span class="emd-icon">📍</span>
          <span class="emd-text">${escapeHtml(ev.location)}</span>
        </div>` : ''}
        ${ev.meetLink ? `<div class="emd-row">
          <span class="emd-icon">🎥</span>
          <a class="emd-link" href="${ev.meetLink}" target="_blank" rel="noopener">Join Google Meet</a>
        </div>` : ''}
        ${ev.attendees.length ? `<div class="emd-row">
          <span class="emd-icon">👥</span>
          <span class="emd-text">${ev.attendees.map(escapeHtml).join(', ')}</span>
        </div>` : ''}
        ${desc ? `<div class="emd-row emd-row-desc">
          <span class="emd-icon">📝</span>
          <span class="emd-text emd-desc">${desc}</span>
        </div>` : ''}
      </div>
      <div class="emd-footer emd-actions">
        ${ev.recurring
          ? '<span class="emd-readonly-note" title="Edit recurring events in Google Calendar">Recurring — read-only here</span>'
          : `
            <button class="btn btn-sm btn-danger"  id="emd-delete">Delete</button>
            <button class="btn btn-sm btn-outline" id="emd-edit">Edit</button>
          `}
        ${ev.htmlLink ? `<a class="emd-gcal-link" href="${ev.htmlLink}" target="_blank" rel="noopener">Open in Google Calendar ↗</a>` : ''}
      </div>
    `;

    if (!ev.recurring) {
      body.querySelector('#emd-edit')?.addEventListener('click', () => showEditForm(ev));
      body.querySelector('#emd-delete')?.addEventListener('click', () => confirmDelete(ev));
    }

    overlay.classList.add('visible');
    overlay.onclick = e => { if (e.target === overlay) closeModal(); };
  }

  function closeModal() {
    const overlay = document.getElementById('event-modal-overlay');
    if (overlay) overlay.classList.remove('visible');
  }

  // ── Edit / Create Form ────────────────────────────────────
  // Single form used for both editing an existing event and creating a new
  // one. Pass either { ev } for edit or { initial, personId } for create.
  function showEventForm({ ev = null, initial = null, personId = null }) {
    const overlay = document.getElementById('event-modal-overlay');
    const body    = document.getElementById('event-modal-body');
    if (!overlay || !body) return;

    const isEdit = !!ev;
    const people = _getPeople();
    const assigned = people.filter(p =>
      _getAssignments().some(a => a.personId === p.id)
    );
    const selectedPersonId = personId || ev?.personId || assigned[0]?.id || '';

    // Build start/end Date objects from event or provided initial time
    let start, end, allDay;
    if (isEdit) {
      allDay = ev.allDay;
      start  = new Date(ev.start + (allDay && ev.start.length === 10 ? 'T00:00:00' : ''));
      end    = ev.end ? new Date(ev.end + (allDay && ev.end.length === 10 ? 'T00:00:00' : '')) : new Date(start.getTime() + 60*60000);
    } else {
      allDay = initial?.allDay || false;
      start  = initial?.start || new Date();
      end    = initial?.end   || new Date(start.getTime() + 60*60000);
    }

    const dStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const tStr = d => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

    body.innerHTML = `
      <div class="emd-header">
        <span class="emd-color-bar" style="background:${escapeHtml(people.find(p=>p.id===selectedPersonId)?.color || '#888')}"></span>
        <div class="emd-title-edit">${isEdit ? 'Edit event' : 'New event'}</div>
        <button class="emd-close" type="button" onclick="Calendar.closeModal()" aria-label="Close">✕</button>
      </div>
      <form class="emd-form" id="emd-form">
        <label class="emd-field">
          <span class="emd-label">Title</span>
          <input id="ef-title" type="text" class="admin-input" value="${escapeHtml(ev?.title || '')}" placeholder="Event title" required />
        </label>

        <label class="emd-field">
          <span class="emd-label">Who</span>
          <select id="ef-person" class="admin-select" ${isEdit ? 'disabled' : ''}>
            ${assigned.map(p => `
              <option value="${escapeHtml(p.id)}" ${p.id === selectedPersonId ? 'selected' : ''}>
                ${escapeHtml(p.emoji || '')} ${escapeHtml(p.name)}
              </option>
            `).join('')}
          </select>
          ${isEdit ? '<span class="emd-field-hint">Move in Google Calendar to reassign</span>' : ''}
        </label>

        <label class="emd-field emd-field-inline">
          <input id="ef-allday" type="checkbox" ${allDay ? 'checked' : ''} />
          <span>All-day event</span>
        </label>

        <div class="emd-field-row">
          <label class="emd-field">
            <span class="emd-label">Start date</span>
            <input id="ef-start-date" type="date" class="admin-input" value="${dStr(start)}" />
          </label>
          <label class="emd-field ef-time-field">
            <span class="emd-label">Start time</span>
            <input id="ef-start-time" type="time" class="admin-input" value="${tStr(start)}" ${allDay ? 'disabled' : ''} />
          </label>
        </div>

        <div class="emd-field-row">
          <label class="emd-field">
            <span class="emd-label">End date</span>
            <input id="ef-end-date" type="date" class="admin-input" value="${dStr(end)}" />
          </label>
          <label class="emd-field ef-time-field">
            <span class="emd-label">End time</span>
            <input id="ef-end-time" type="time" class="admin-input" value="${tStr(end)}" ${allDay ? 'disabled' : ''} />
          </label>
        </div>

        <label class="emd-field">
          <span class="emd-label">Location <span class="emd-field-hint">(optional)</span></span>
          <input id="ef-location" type="text" class="admin-input" value="${escapeHtml(ev?.location || '')}" />
        </label>

        <div id="ef-error" class="emd-error" style="display:none"></div>

        <div class="emd-footer emd-actions">
          <button type="button" class="btn btn-sm btn-outline" id="ef-cancel">Cancel</button>
          <button type="submit" class="btn btn-sm btn-primary" id="ef-save">${isEdit ? 'Save' : 'Create'}</button>
        </div>
      </form>
    `;

    overlay.classList.add('visible');

    const allDayChk = body.querySelector('#ef-allday');
    const startTime = body.querySelector('#ef-start-time');
    const endTime   = body.querySelector('#ef-end-time');
    allDayChk.addEventListener('change', () => {
      startTime.disabled = allDayChk.checked;
      endTime.disabled   = allDayChk.checked;
    });

    body.querySelector('#ef-cancel').addEventListener('click', closeModal);

    body.querySelector('#emd-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = body.querySelector('#ef-error');
      err.style.display = 'none';

      const title   = body.querySelector('#ef-title').value.trim();
      const isAllDay = allDayChk.checked;
      const sDate = body.querySelector('#ef-start-date').value;
      const eDate = body.querySelector('#ef-end-date').value;
      const sTime = body.querySelector('#ef-start-time').value || '00:00';
      const eTime = body.querySelector('#ef-end-time').value   || '00:00';
      const location = body.querySelector('#ef-location').value.trim();
      const personIdSel = body.querySelector('#ef-person').value;

      if (!title) { err.textContent = 'Title is required.'; err.style.display = 'block'; return; }

      let startIso, endIso;
      if (isAllDay) {
        startIso = `${sDate}T00:00:00`;
        // Google all-day end dates are exclusive; if user picks same day, bump by 1
        const endDate = new Date(eDate + 'T00:00:00');
        if (endDate <= new Date(sDate + 'T00:00:00')) endDate.setDate(endDate.getDate() + 1);
        endIso = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}T00:00:00`;
      } else {
        const s = new Date(`${sDate}T${sTime}:00`);
        let   eD = new Date(`${eDate}T${eTime}:00`);
        if (eD <= s) eD = new Date(s.getTime() + 60*60000);
        startIso = s.toISOString();
        endIso   = eD.toISOString();
      }

      const patch = { title, location, allDay: isAllDay, startIso, endIso };
      const saveBtn = body.querySelector('#ef-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      try {
        if (isEdit) await updateEvent(ev, patch);
        else        await createEvent(personIdSel, patch);
        closeModal();
      } catch (e) {
        console.error('Save failed:', e);
        err.textContent = e.message === 'SCOPE_UPGRADE_REQUIRED'
          ? 'Google is reconnecting with write access — please try again after sign-in completes.'
          : `Save failed: ${e.message || e}`;
        err.style.display = 'block';
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? 'Save' : 'Create';
      }
    });
  }

  function showEditForm(ev)     { showEventForm({ ev }); }
  function showCreateForm(opts) { showEventForm(opts); }

  async function confirmDelete(ev) {
    if (!confirm(`Delete "${ev.title}"? This cannot be undone.`)) return;
    try {
      await deleteEvent(ev);
      closeModal();
    } catch (e) {
      console.error('Delete failed:', e);
      alert(`Delete failed: ${e.message || e}`);
    }
  }

  // ── Filter chip row ───────────────────────────────────────
  function renderFilterChips() {
    const host = document.getElementById('cal-filter-chips');
    if (!host) return;
    // Only show owners that actually have events assigned to them
    const people = _getPeople();
    const assignments = _getAssignments();
    const assignedIds = new Set(assignments.map(a => a.personId));
    const shown = people.filter(p => assignedIds.has(p.id));
    if (shown.length <= 1) { host.innerHTML = ''; host.style.display = 'none'; return; }

    const hidden = new Set(_getHiddenPeople());
    host.style.display = '';
    host.innerHTML = '';
    shown.forEach(p => {
      const chip = document.createElement('button');
      const isOff = hidden.has(p.id);
      chip.className = `cal-filter-chip${isOff ? ' off' : ''}`;
      chip.style.setProperty('--chip-color', p.color || '#888');
      chip.innerHTML = `
        <span class="cal-filter-dot" style="background:${escapeHtml(p.color || '#888')}"></span>
        <span class="cal-filter-name">${escapeHtml(p.name)}</span>
      `;
      chip.addEventListener('click', () => togglePersonFilter(p.id));
      host.appendChild(chip);
    });

    if (hidden.size > 0) {
      const all = document.createElement('button');
      all.className = 'cal-filter-chip cal-filter-all';
      all.textContent = 'Show all';
      all.addEventListener('click', clearPersonFilter);
      host.appendChild(all);
    }
  }

  // ── Event Write API (create / update / delete) ───────────
  // All three throw on failure so callers can show a toast. A 403 with
  // "insufficient" in the body means the token was granted with the old
  // readonly scope — we force a full signIn to upgrade.
  async function _apiWrite(accountEmail, url, method, body) {
    const tok = Auth.getAllTokens().find(t => t.email === accountEmail);
    if (!tok || !Auth.isValid(tok)) throw new Error('NO_VALID_TOKEN');
    const resp = await Auth.apiFetch(tok, url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (resp.status === 403) {
      const text = await resp.text();
      if (/insufficient/i.test(text)) {
        // Trigger full consent so the new calendar.events scope is granted
        await Auth.signIn(accountEmail);
        throw new Error('SCOPE_UPGRADE_REQUIRED');
      }
      throw new Error(`403 ${text}`);
    }
    if (resp.status === 204) return null;
    if (!resp.ok) throw new Error(`${resp.status} ${await resp.text()}`);
    return resp.json();
  }

  async function updateEvent(ev, patch) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ev.calendarId)}/events/${encodeURIComponent(ev.id)}`;
    const body = _eventBodyFromPatch(patch);
    const updated = await _apiWrite(ev.accountEmail, url, 'PATCH', body);
    await fetchAll(true);
    render();
    if (document.getElementById('today-events-panel')) renderTodayPanel();
    return updated;
  }

  async function deleteEvent(ev) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ev.calendarId)}/events/${encodeURIComponent(ev.id)}`;
    await _apiWrite(ev.accountEmail, url, 'DELETE');
    delete _eventsById[ev.id];
    await fetchAll(true);
    render();
    if (document.getElementById('today-events-panel')) renderTodayPanel();
  }

  async function createEvent(personId, patch) {
    const assignments = _getAssignments().filter(a => a.personId === personId);
    if (assignments.length === 0) throw new Error('NO_CALENDAR_FOR_PERSON');
    // Prefer an assignment whose account token is valid
    const validTokens = new Set(Auth.getValidTokens().map(t => t.email));
    const chosen = assignments.find(a => validTokens.has(a.accountEmail)) || assignments[0];
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(chosen.calendarId)}/events`;
    const body = _eventBodyFromPatch(patch);
    const created = await _apiWrite(chosen.accountEmail, url, 'POST', body);
    await fetchAll(true);
    render();
    if (document.getElementById('today-events-panel')) renderTodayPanel();
    return created;
  }

  // Convert our edit-form shape into Google Calendar's request body.
  // patch: { title, allDay, startIso, endIso, location, description }
  function _eventBodyFromPatch(p) {
    const body = {};
    if ('title'       in p) body.summary     = p.title;
    if ('location'    in p) body.location    = p.location || '';
    if ('description' in p) body.description = p.description || '';
    if ('startIso' in p || 'endIso' in p || 'allDay' in p) {
      if (p.allDay) {
        // All-day events use `date` (YYYY-MM-DD). End is exclusive.
        body.start = { date: p.startIso.slice(0, 10) };
        body.end   = { date: p.endIso.slice(0, 10) };
      } else {
        body.start = { dateTime: p.startIso, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
        body.end   = { dateTime: p.endIso,   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      }
    }
    return body;
  }

  // ── Public render ──────────────────────────────────────────
  async function render(force = false) {
    const container = document.getElementById('cal-view-container');
    if (!container) return;

    renderFilterChips();

    container.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><span>Loading…</span></div>';
    await fetchAll(force);
    container.innerHTML = '';

    if (_view === 'month') {
      renderMonthView(container);
    } else if (_view === 'agenda') {
      renderAgendaView(container);
    } else {
      const start = _view === '4day'
        ? (() => { const d = new Date(_viewDate); d.setHours(0,0,0,0); return d; })()
        : weekStart(_viewDate);
      const numDays = _view === '4day' ? 4 : 7;
      const days = Array.from({ length: numDays }, (_, i) => addDays(start, i));
      renderTimeGrid(container, days);
    }
  }

  // ── Public: Today page panel ──────────────────────────────
  async function renderTodayPanel(force = false) {
    const el = document.getElementById('today-events-panel');
    if (!el) return;

    await fetchAll(force);

    const events = eventsForDay(new Date());
    el.innerHTML = '';

    if (events.length === 0) {
      el.innerHTML = '<div class="no-events">Nothing scheduled for today</div>';
      return;
    }

    events.forEach((ev, i) => {
      const item = document.createElement('div');
      item.className = `event-item${ev.allDay ? ' event-allday' : ''}`;
      item.style.animationDelay = `${i * 20}ms`;
      item.style.background     = colorWithAlpha(ev.color, 0.10);
      item.style.borderLeft     = `3px solid ${ev.color}`;
      item.style.borderRadius   = '10px';
      item.innerHTML = `
        <div class="event-body">
          <div class="event-title">${ev.owner ? `<span class="ev-owner-prefix">${escapeHtml(ev.owner)}</span> – ` : ''}${escapeHtml(ev.title)}</div>
          <div class="event-time">${formatTime(ev.start, ev.allDay)}</div>
        </div>
        <span class="event-detail-arrow">›</span>
      `;
      makeChipClickable(item, ev.id);
      el.appendChild(item);
    });
  }

  // ── Navigation ────────────────────────────────────────────
  function navigate(dir) {
    if (_view === '4day') {
      _viewDate = addDays(_viewDate, dir * 4);
    } else if (_view === 'week') {
      _viewDate = addDays(_viewDate, dir * 7);
    } else if (_view === 'agenda') {
      const span = Math.max(14, CONFIG.CALENDAR_LOOKAHEAD_DAYS || 14);
      _viewDate = addDays(_viewDate, dir * span);
    } else {
      _viewDate = new Date(_viewDate.getFullYear(), _viewDate.getMonth() + dir, 1);
    }
    render();
  }

  function goToToday() { _viewDate = new Date(); render(); }

  function setView(v) {
    _view = v;
    ['week','4day','month','agenda'].forEach(name => {
      const btn = document.getElementById(`btn-${name}`);
      if (btn) btn.classList.toggle('active', v === name);
    });
    render();
  }

  function startAutoRefresh() {
    setInterval(() => {
      fetchAll(true).then(() => {
        if (document.getElementById('cal-view-container')) render();
        if (document.getElementById('today-events-panel')) renderTodayPanel();
      });
    }, CACHE_MS);

    // Redraw time grid every minute to keep now-line accurate
    setInterval(() => {
      const container = document.getElementById('cal-view-container');
      if (container && _view !== 'month' && _view !== 'agenda') render();
    }, 60_000);
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  return {
    render, renderTodayPanel, navigate, goToToday, setView, startAutoRefresh,
    closeModal, togglePersonFilter, clearPersonFilter,
    createEvent, updateEvent, deleteEvent,
    showEditForm, showCreateForm,
  };
})();
