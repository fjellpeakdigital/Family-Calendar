// ============================================================
//  FAMILY DASHBOARD — CONFIG FILE
//  Edit GOOGLE_CLIENT_ID and LOCATION here.
//  All other settings (people, chores, calendars) are managed
//  via the ⚙ admin panel on the dashboard — no code editing needed.
// ============================================================

const CONFIG = {
  // ── Google OAuth ────────────────────────────────────────────
  // Get this from: console.cloud.google.com → APIs & Services → Credentials
  GOOGLE_CLIENT_ID: '757651858385-u41viuii19b38eh04lu5cess9cppc8ll.apps.googleusercontent.com',

  // ── Location (for weather) ──────────────────────────────────
  LOCATION: { lat: 43.1979, lon: -70.8737, city: 'Dover, NH' },

  // ── Pages to show (in order) ────────────────────────────────
  PAGES: ['calendar', 'today', 'chores'],

  // ── Display Settings (overridden by admin panel settings) ───
  AUTO_ADVANCE_PAGES:        false,
  AUTO_ADVANCE_INTERVAL_MS:  30000,
  CALENDAR_LOOKAHEAD_DAYS:   14,
  TIME_FORMAT_24H:           false,

  // ── Initial data (used only on first run to seed the database)
  // After first run, manage people & chores via the ⚙ admin panel.
  CALENDAR_OWNERS: [
    { name: 'Chris', color: '#58A6FF', email: 'cjones.eco@gmail.com' },
    { name: 'Kayla', color: '#FF7EB3', email: 'jones.b.kayla@gmail.com' },
  ],
  KIDS: [
    {
      name: 'Colette',
      color: '#3FB950',
      chores: [
        { task: 'Make bed',         days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
        { task: 'Brush teeth',      days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
        { task: 'Clean room',       days: ['Sat'] },
        { task: 'Empty Dishwasher', days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
      ]
    },
    {
      name: 'Theo',
      color: '#F59E0B',
      chores: [
        { task: 'Make bed',            days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
        { task: 'Brush teeth',         days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
        { task: 'Feed Cats',           days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
        { task: 'Empty Bathroom Trash', days: ['Sun'] },
      ]
    }
  ],
};
