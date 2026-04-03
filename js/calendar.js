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

  function eventsForDay(dateObj) {
    const ds = toLocalDateStr(dateObj);
    return Object.values(_cache).flat()
      .filter(ev => toLocalDateStr(ev.start) === ds)
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
      htmlLink:    item.htmlLink    || '',
      attendees:   (item.attendees || [])
                     .filter(a => !a.self)
                     .map(a => a.displayName || a.email),
      meetLink:    item.conferenceData?.entryPoints
                     ?.find(e => e.entryPointType === 'video')?.uri || '',
    }));
  }

  async function fetchAll(force = false) {
    const minDate = addDays(weekStart(new Date()), -42);
    const maxDate = addDays(new Date(), Math.max(CONFIG.CALENDAR_LOOKAHEAD_DAYS, 112));

    const alreadyCurrent = _fetchMin === minDate.toISOString()
                        && _fetchMax === maxDate.toISOString();
    if (!force && alreadyCurrent && Date.now() - _lastFetch < CACHE_MS) return;

    const results = await Promise.allSettled(
      CONFIG.CALENDAR_OWNERS.map((_, i) => fetchEventsForOwner(i, minDate, maxDate))
    );
    _cache = {}; _eventsById = {};
    results.forEach((r, i) => {
      _cache[i] = r.status === 'fulfilled' ? r.value : [];
      _cache[i].forEach(ev => { _eventsById[ev.id] = ev; });
    });
    _lastFetch = Date.now();
    _fetchMin  = minDate.toISOString();
    _fetchMax  = maxDate.toISOString();
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
        chip.textContent = ev.title;
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
          <div class="cal-tgrid-event-title">${escapeHtml(ev.title)}</div>
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

      grid.appendChild(cell);
    }

    container.appendChild(grid);
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
      ${ev.htmlLink ? `<div class="emd-footer">
        <a class="emd-gcal-link" href="${ev.htmlLink}" target="_blank" rel="noopener">Open in Google Calendar ↗</a>
      </div>` : ''}
    `;

    overlay.classList.add('visible');
    overlay.onclick = e => { if (e.target === overlay) closeModal(); };
  }

  function closeModal() {
    const overlay = document.getElementById('event-modal-overlay');
    if (overlay) overlay.classList.remove('visible');
  }

  // ── Public render ──────────────────────────────────────────
  async function render(force = false) {
    const container = document.getElementById('cal-view-container');
    if (!container) return;

    container.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><span>Loading…</span></div>';
    await fetchAll(force);
    container.innerHTML = '';

    if (_view === 'month') {
      renderMonthView(container);
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
          <div class="event-title">${escapeHtml(ev.title)}</div>
          <div class="event-time">${formatTime(ev.start, ev.allDay)}
            ${CONFIG.CALENDAR_OWNERS.length > 1
              ? `<span class="event-who"> · ${escapeHtml(ev.owner)}</span>` : ''}
          </div>
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
    } else {
      _viewDate = new Date(_viewDate.getFullYear(), _viewDate.getMonth() + dir, 1);
    }
    render();
  }

  function goToToday() { _viewDate = new Date(); render(); }

  function setView(v) {
    _view = v;
    ['week','4day','month'].forEach(name => {
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
      if (container && _view !== 'month') render();
    }, 60_000);
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  return { render, renderTodayPanel, navigate, goToToday, setView, startAutoRefresh, closeModal };
})();
