// ============================================================
//  FAMILY DASHBOARD — CONFIG FILE
//  This is the ONLY file you need to edit to customize your
//  family dashboard. See README.md for detailed instructions.
// ============================================================

const CONFIG = {
  // ── Google OAuth ────────────────────────────────────────────
  // Get this from: console.cloud.google.com → APIs & Services → Credentials
  GOOGLE_CLIENT_ID: '757651858385-u41viuii19b38eh04lu5cess9cppc8ll.apps.googleusercontent.com',

  // ── Family Members ──────────────────────────────────────────
  // Each person gets their own color-coded events on the calendar.
  // 'email' must match their Google account email.
  CALENDAR_OWNERS: [
    { name: 'Chris', color: '#58A6FF', email: 'cjones.eco@gmail.com' },
    { name: 'Kayla', color: '#FF7EB3', email: 'jones.b.kayla@gmail.com' },
  ],

  // ── Location (for weather) ──────────────────────────────────
  // Find your lat/lon at: latlong.net or maps.google.com (right-click → "What's here?")
  LOCATION: { lat: 43.1979, lon: -70.8737, city: 'Dover, NH' },

  // ── Pages to show (in order) ────────────────────────────────
  PAGES: ['calendar', 'weather', 'chores'],

  // ── Kids & Chores ───────────────────────────────────────────
  // days: which days of the week the chore is required
  // Valid day names: 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
  KIDS: [
    {
      name: 'Kid 1',
      avatar: '🧒',
      chores: [
        { task: 'Make bed',    days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
        { task: 'Brush teeth', days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
        { task: 'Clean room',  days: ['Sat'] },
        { task: 'Set table',   days: ['Mon','Wed','Fri'] },
      ]
    },
    {
      name: 'Kid 2',
      avatar: '👧',
      chores: [
        { task: 'Make bed',    days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
        { task: 'Brush teeth', days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
        { task: 'Feed pet',    days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
        { task: 'Vacuum',      days: ['Sun'] },
      ]
    }
  ],

  // ── Display Settings ────────────────────────────────────────
  // Auto-advance rotates through pages automatically
  AUTO_ADVANCE_PAGES: false,
  AUTO_ADVANCE_INTERVAL_MS: 30000,    // 30 seconds between pages

  // How many days ahead to show on the calendar
  CALENDAR_LOOKAHEAD_DAYS: 14,

  // Set true for 24-hour clock (e.g. 14:30 instead of 2:30 PM)
  TIME_FORMAT_24H: false,
};
