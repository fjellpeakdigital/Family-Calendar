/* ============================================================
   weather.js — Open-Meteo weather fetch + render
   ============================================================ */

window.Weather = (() => {
  let _data = null;
  let _fetchedAt = null;
  const CACHE_MS = 10 * 60_000; // 10-min cache

  // ── Weather Code Mappings ─────────────────────────────────
  const WMO_ICONS = {
    0:  '☀️',
    1:  '🌤️',
    2:  '⛅',
    3:  '☁️',
    45: '🌫️', 48: '🌫️',
    51: '🌦️', 53: '🌦️', 55: '🌧️',
    56: '🌧️', 57: '🌧️',
    61: '🌧️', 63: '🌧️', 65: '🌧️',
    66: '🌧️', 67: '🌧️',
    71: '❄️',  73: '❄️',  75: '❄️',  77: '❄️',
    80: '🌦️', 81: '🌦️', 82: '⛈️',
    85: '❄️',  86: '❄️',
    95: '⛈️', 96: '⛈️', 99: '⛈️',
  };

  const WMO_LABELS = {
    0:  'Clear Sky',
    1:  'Mostly Clear',
    2:  'Partly Cloudy',
    3:  'Overcast',
    45: 'Foggy', 48: 'Icy Fog',
    51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
    56: 'Freezing Drizzle', 57: 'Heavy Freezing Drizzle',
    61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
    66: 'Freezing Rain', 67: 'Heavy Freezing Rain',
    71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 77: 'Snow Grains',
    80: 'Showers', 81: 'Showers', 82: 'Violent Showers',
    85: 'Snow Showers', 86: 'Heavy Snow Showers',
    95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Heavy Thunderstorm',
  };

  // ── Theme mapping ──────────────────────────────────────────
  function getThemeClass(code) {
    if (code === 0 || code === 1)            return 'weather-theme-sunny';
    if (code === 2)                           return 'weather-theme-partly-cloudy';
    if (code === 3)                           return 'weather-theme-cloudy';
    if (code === 45 || code === 48)           return 'weather-theme-fog';
    if (code >= 51 && code <= 67)            return 'weather-theme-rain';
    if (code >= 71 && code <= 77)            return 'weather-theme-snow';
    if (code >= 80 && code <= 82)            return 'weather-theme-rain';
    if (code >= 85 && code <= 86)            return 'weather-theme-snow';
    if (code >= 95)                           return 'weather-theme-storm';
    return '';
  }

  function getIcon(code) {
    // Find closest code
    if (WMO_ICONS[code]) return WMO_ICONS[code];
    // Fallback: find nearest
    const keys = Object.keys(WMO_ICONS).map(Number).sort((a,b) => a-b);
    for (const k of keys) { if (k >= code) return WMO_ICONS[k]; }
    return '🌡️';
  }

  function getLabel(code) {
    return WMO_LABELS[code] || 'Unknown';
  }

  // ── Fetch ──────────────────────────────────────────────────
  async function fetchWeather() {
    const { lat, lon } = CONFIG.LOCATION;
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    Object.entries({
      latitude:               lat,
      longitude:              lon,
      current:                'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m',
      daily:                  'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
      temperature_unit:       'fahrenheit',
      wind_speed_unit:        'mph',
      precipitation_unit:     'inch',
      forecast_days:          7,
      timezone:               'auto',
    }).forEach(([k, v]) => url.searchParams.set(k, v));

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`Weather fetch failed: ${resp.status}`);
    return resp.json();
  }

  // ── Render ─────────────────────────────────────────────────
  function renderWeather() {
    if (!_data) return;

    const c = _data.current;
    const d = _data.daily;

    const weatherPage = document.getElementById('weather-page');
    if (!weatherPage) return;

    // Theme background
    const themeClass = getThemeClass(c.weather_code);
    weatherPage.className = `page-content ${themeClass}`;

    // Current conditions
    const iconEl   = document.getElementById('weather-icon-big');
    const tempEl   = document.getElementById('weather-temp-big');
    const condEl   = document.getElementById('weather-condition');
    const feelsEl  = document.getElementById('weather-feels');
    const metaEl   = document.getElementById('weather-meta');

    if (iconEl)  iconEl.textContent  = getIcon(c.weather_code);
    if (tempEl)  tempEl.textContent  = `${Math.round(c.temperature_2m)}°`;
    if (condEl)  condEl.textContent  = getLabel(c.weather_code);
    if (feelsEl) feelsEl.textContent = `Feels like ${Math.round(c.apparent_temperature)}°`;

    const minsAgo = _fetchedAt ? Math.round((Date.now() - _fetchedAt) / 60_000) : 0;
    const updStr  = minsAgo < 2 ? 'Just updated' : `Updated ${minsAgo} min ago`;

    document.getElementById('weather-city').textContent    = CONFIG.LOCATION.city;
    document.getElementById('weather-updated').textContent = updStr;
    document.getElementById('weather-humidity').textContent = `💧 ${c.relative_humidity_2m}%`;
    document.getElementById('weather-wind').textContent    = `💨 ${Math.round(c.wind_speed_10m)} mph`;

    // Forecast strip
    const strip = document.getElementById('weather-forecast-strip');
    if (strip && d.time) {
      strip.innerHTML = '';
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      d.time.forEach((dateStr, i) => {
        const dt    = new Date(dateStr + 'T12:00:00');
        const label = i === 0 ? 'Today' : days[dt.getDay()];
        const precip = d.precipitation_sum[i];

        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
          <div class="forecast-day">${label}</div>
          <div class="forecast-icon">${getIcon(d.weather_code[i])}</div>
          <div class="forecast-high">${Math.round(d.temperature_2m_max[i])}°</div>
          <div class="forecast-low">${Math.round(d.temperature_2m_min[i])}°</div>
          ${precip > 0.01 ? `<div class="forecast-precip">${precip.toFixed(2)}"</div>` : ''}
        `;
        strip.appendChild(card);
      });
    }
  }

  // ── Render compact panel for Today page ───────────────────
  function renderTodayPanel() {
    if (!_data) return;
    const c = _data.current;
    const d = _data.daily;

    const panel = document.getElementById('today-weather-current');
    if (panel) {
      panel.className = `today-weather-current card ${getThemeClass(c.weather_code)}`;
    }

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set('today-weather-icon',     getIcon(c.weather_code));
    set('today-weather-temp',     `${Math.round(c.temperature_2m)}°`);
    set('today-weather-cond',     getLabel(c.weather_code));
    set('today-weather-feels',    `Feels like ${Math.round(c.apparent_temperature)}°`);
    set('today-weather-city',     CONFIG.LOCATION.city);
    set('today-weather-humidity', `💧 ${c.relative_humidity_2m}%`);
    set('today-weather-wind',     `💨 ${Math.round(c.wind_speed_10m)} mph`);

    const minsAgo = _fetchedAt ? Math.round((Date.now() - _fetchedAt) / 60_000) : 0;
    set('today-weather-updated', minsAgo < 2 ? 'Just updated' : `Updated ${minsAgo} min ago`);

    // Forecast strip (5 days, compact)
    const strip = document.getElementById('today-forecast-strip');
    if (strip && d.time) {
      strip.innerHTML = '';
      const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      d.time.slice(0, 5).forEach((dateStr, i) => {
        const dt    = new Date(dateStr + 'T12:00:00');
        const label = i === 0 ? 'Today' : dayNames[dt.getDay()];
        const precip = d.precipitation_sum[i];
        const card  = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
          <div class="forecast-day">${label}</div>
          <div class="forecast-icon">${getIcon(d.weather_code[i])}</div>
          <div class="forecast-high">${Math.round(d.temperature_2m_max[i])}°</div>
          <div class="forecast-low">${Math.round(d.temperature_2m_min[i])}°</div>
          ${precip > 0.01 ? `<div class="forecast-precip">${precip.toFixed(2)}"</div>` : ''}
        `;
        strip.appendChild(card);
      });
    }
  }

  // ── Public API ─────────────────────────────────────────────
  async function render(force = false) {
    if (!force && _data && Date.now() - _fetchedAt < CACHE_MS) {
      renderWeather();
      return;
    }

    try {
      _data      = await fetchWeather();
      _fetchedAt = Date.now();
      renderWeather();
    } catch (e) {
      console.error('Weather render error:', e);
      const condEl = document.getElementById('weather-condition');
      if (condEl) condEl.textContent = 'Weather unavailable';
    }
  }

  function startAutoRefresh() {
    setInterval(() => {
      // Update "X min ago" text periodically
      const updEl = document.getElementById('weather-updated');
      if (updEl && _fetchedAt) {
        const minsAgo = Math.round((Date.now() - _fetchedAt) / 60_000);
        updEl.textContent = minsAgo < 2 ? 'Just updated' : `Updated ${minsAgo} min ago`;
      }
      // Re-fetch every CACHE_MS
      render();
    }, CACHE_MS);
  }

  // expose renderTodayPanel for Today page + ensure data is fetched first
  async function renderTodayPanelWithFetch(force = false) {
    if (!_data || force) {
      try { _data = await fetchWeather(); _fetchedAt = Date.now(); } catch (e) { console.error(e); }
    }
    renderTodayPanel();
  }

  return { render, renderTodayPanel: renderTodayPanelWithFetch, startAutoRefresh };
})();
