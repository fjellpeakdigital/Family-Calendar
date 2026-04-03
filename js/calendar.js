/* ============================================================
   calendar.js — Google Calendar fetch + render
   ============================================================ */

window.Calendar = (() => {
  // Cache fetched events: { ownerIdx: [events] }
  let _cache = {};
  let _lastFetch = 0;
  const CACHE_MS = 5 * 60_000; // re-fetch every 5 min

  // ── Fetch Events for One Owner ────────────────────────────
  async function fetchEventsForOwner(idx) {
    const tok = Auth.getToken(idx);
    if (!Auth.isTokenValid(tok)) {
      console.warn(`Token invalid for owner ${idx}, skipping fetch`);
      return [];
    }

    const now    = new Date();
    const future = new Date(now.getTime() + CONFIG.CALENDAR_LOOKAHEAD_DAYS * 86400_000);

    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin',       now.toISOString());
    url.searchParams.set('timeMax',       future.toISOString());
    url.searchParams.set('singleEvents',  'true');
    url.searchParams.set('orderBy',       'startTime');
    url.searchParams.set('maxResults',    '50');

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });

    if (!resp.ok) {
      console.error(`Calendar fetch failed for owner ${idx}:`, resp.status);
      return [];
    }

    const data = await resp.json();
    const owner = CONFIG.CALENDAR_OWNERS[idx];

    return (data.items || []).map(item => ({
      id:      item.id,
      title:   item.summary || '(No title)',
      allDay:  !!item.start?.date,
      start:   item.start?.dateTime || item.start?.date,
      end:     item.end?.dateTime   || item.end?.date,
      color:   owner.color,
      owner:   owner.name,
      ownerIdx: idx,
    }));
  }

  // ── Fetch All Owners ──────────────────────────────────────
  async function fetchAll(force = false) {
    if (!force && Date.now() - _lastFetch < CACHE_MS) return;

    const results = await Promise.allSettled(
      CONFIG.CALENDAR_OWNERS.map((_, i) => fetchEventsForOwner(i))
    );

    _cache = {};
    results.forEach((r, i) => {
      _cache[i] = r.status === 'fulfilled' ? r.value : [];
    });
    _lastFetch = Date.now();
  }

  // ── Flatten & Sort Events ─────────────────────────────────
  function allEvents() {
    return Object.values(_cache).flat().sort((a, b) => {
      const ta = new Date(a.start).getTime();
      const tb = new Date(b.start).getTime();
      // All-day events come first within a day
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return ta - tb;
    });
  }

  // ── Date Helpers ──────────────────────────────────────────
  function toLocalDateStr(isoStr) {
    // Returns "YYYY-MM-DD" in local time
    const d = new Date(isoStr);
    // For all-day events (date only), just use the string directly
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return isoStr;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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

  function formatDateLabel(dateStr) {
    const [y, mo, dy] = dateStr.split('-').map(Number);
    const d = new Date(y, mo - 1, dy);
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
  }

  // ── Render Event Item ─────────────────────────────────────
  function renderEventItem(ev, delay = 0) {
    const item = document.createElement('div');
    item.className = `event-item${ev.allDay ? ' event-allday' : ''}`;
    item.style.animationDelay = `${delay}ms`;
    item.innerHTML = `
      <div class="event-dot" style="background:${ev.color}"></div>
      <div class="event-body">
        <div class="event-title">${escapeHtml(ev.title)}</div>
        <div class="event-time">${formatTime(ev.start, ev.allDay)}
          ${CONFIG.CALENDAR_OWNERS.length > 1 ? `<span class="event-who"> · ${escapeHtml(ev.owner)}</span>` : ''}
        </div>
      </div>
    `;
    return item;
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Render Today Panel ────────────────────────────────────
  function renderToday() {
    const el = document.getElementById('today-events-list');
    if (!el) return;

    const today = todayStr();
    const todayEvents = allEvents().filter(ev => toLocalDateStr(ev.start) === today);

    el.innerHTML = '';

    if (todayEvents.length === 0) {
      el.innerHTML = '<div class="no-events">Nothing scheduled for today</div>';
      return;
    }

    todayEvents.forEach((ev, i) => {
      el.appendChild(renderEventItem(ev, i * 20));
    });
  }

  // ── Render Upcoming Panel ─────────────────────────────────
  function renderUpcoming() {
    const el = document.getElementById('upcoming-events-list');
    if (!el) return;

    const today = todayStr();
    const upcoming = allEvents().filter(ev => toLocalDateStr(ev.start) > today);

    el.innerHTML = '';

    if (upcoming.length === 0) {
      el.innerHTML = '<div class="no-events">Nothing coming up</div>';
      return;
    }

    // Group by date
    const groups = {};
    upcoming.forEach(ev => {
      const d = toLocalDateStr(ev.start);
      if (!groups[d]) groups[d] = [];
      groups[d].push(ev);
    });

    let delay = 0;
    Object.entries(groups).forEach(([dateStr, events]) => {
      const group = document.createElement('div');
      group.className = 'day-group';

      const label = document.createElement('div');
      label.className = 'day-label';
      label.textContent = formatDateLabel(dateStr);
      group.appendChild(label);

      events.forEach(ev => {
        const item = renderEventItem(ev, delay);
        delay += 20;
        group.appendChild(item);
      });

      el.appendChild(group);
    });
  }

  // ── Public render ─────────────────────────────────────────
  async function render(force = false) {
    // Show spinners while loading
    const todayEl    = document.getElementById('today-events-list');
    const upcomingEl = document.getElementById('upcoming-events-list');
    if (todayEl && Object.keys(_cache).length === 0) {
      todayEl.innerHTML    = '<div class="loading-wrap"><div class="spinner"></div><span>Loading…</span></div>';
      if (upcomingEl) upcomingEl.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';
    }

    await fetchAll(force);
    renderToday();
    renderUpcoming();
  }

  // ── Auto-refresh ──────────────────────────────────────────
  function startAutoRefresh() {
    setInterval(() => render(), CACHE_MS);
    // Also re-render today panel at midnight
    setInterval(() => {
      renderToday();
      renderUpcoming();
    }, 60_000);
  }

  return { render, startAutoRefresh };
})();
