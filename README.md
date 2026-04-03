# Family Dashboard

A beautiful always-on family display for a wall-mounted tablet — shows your family's Google Calendars, local weather, and the kids' daily chore charts. Think of it like a Skylight frame, but free and completely customizable.

---

## One-Time Setup

### Step 1 — Fork this repository

1. Go to the repository on GitHub and click **Fork** (top-right corner)
2. Name it whatever you like (e.g. `family-dashboard`)

### Step 2 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project picker at the top → **New Project**
3. Give it a name (e.g. "Family Dashboard") and click **Create**
4. In the left sidebar: **APIs & Services → Library**
5. Search for **Google Calendar API** and click **Enable**

### Step 3 — Create OAuth credentials

1. In the left sidebar: **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. If prompted, click **Configure Consent Screen** first:
   - Choose **External** → **Create**
   - Fill in App name (e.g. "Family Dashboard") and your email
   - Click **Save and Continue** through all steps
   - Back on the credentials page, click **+ Create Credentials → OAuth client ID** again
4. Application type: **Web application**
5. Name it anything (e.g. "Family Dashboard Web")
6. Under **Authorized redirect URIs**, click **Add URI** and enter your GitHub Pages URL:
   ```
   https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPO-NAME/
   ```
   Also add `http://localhost:8080/` if you want to test locally
7. Click **Create**
8. Copy the **Client ID** (looks like `123456789.apps.googleusercontent.com`)

### Step 4 — Add your Client ID to the config

Open `js/config.js` and paste your Client ID:
```javascript
GOOGLE_CLIENT_ID: '123456789.apps.googleusercontent.com',
```

---

## Customizing for Your Family

Open `js/config.js` — it's the only file you need to edit. Here's what each section does:

**Family members** (for the calendar):
```javascript
CALENDAR_OWNERS: [
  { name: 'Chris', color: '#58A6FF', email: 'chris@gmail.com' },
  { name: 'Kayla', color: '#FF7EB3', email: 'kayla@gmail.com' },
],
```
Change the names, pick any hex colors you like, and use the exact Google account emails.

**Your location** (for weather):
```javascript
LOCATION: { lat: 43.1979, lon: -70.8737, city: 'Dover, NH' },
```
Find your coordinates at [latlong.net](https://www.latlong.net) or by right-clicking on Google Maps and selecting "What's here?"

**Kids and chores**:
```javascript
KIDS: [
  {
    name: 'Emma',
    avatar: '👧',
    chores: [
      { task: 'Make bed',    days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
      { task: 'Feed the dog', days: ['Mon','Wed','Fri'] },
    ]
  },
]
```
Add as many kids as you have. Valid day abbreviations: `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`.

**Other settings**:
- `TIME_FORMAT_24H: true` — switches to 24-hour clock
- `AUTO_ADVANCE_PAGES: true` — automatically rotates between pages
- `CALENDAR_LOOKAHEAD_DAYS: 14` — how far ahead the calendar looks

---

## Deploying to GitHub Pages

1. **Push your changes** to the `main` branch of your forked repo
2. Go to your repo on GitHub → **Settings → Pages**
3. Under **Source**, select **GitHub Actions**
4. The workflow will run automatically on the next push — your site will be live at:
   ```
   https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPO-NAME/
   ```
5. **Important**: Go back to your Google Cloud OAuth credentials and make sure this exact URL is in the **Authorized redirect URIs** list

---

## Tablet Setup

### iPad
1. Open Safari and go to your GitHub Pages URL
2. Tap the **Share** button (box with arrow) at the bottom
3. Tap **Add to Home Screen**
4. Name it "Family Dashboard" and tap **Add**
5. Open the app from your home screen — it will launch full-screen

For always-on use, go to **Settings → Display & Brightness → Auto-Lock** and set it to **Never**.

### Android Tablet
1. Open Chrome and go to your GitHub Pages URL
2. Tap the three-dot menu (⋮) in the top-right
3. Tap **Add to Home screen** or **Install app**
4. Open the app from your home screen — it will launch full-screen

For always-on use, go to **Settings → Display → Screen timeout** and set it to the longest option, or use a "Stay Awake" app.

---

## Troubleshooting

**Calendar not loading / shows "tap to reconnect"**
The Google sign-in session has expired (they last about an hour). Tap the person's name in the top-right corner of the dashboard to sign in again. This is normal — Google requires periodic re-authentication for calendar access.

**Wrong location on weather**
Edit the `lat` and `lon` values in `js/config.js`. You can get exact coordinates from [latlong.net](https://www.latlong.net). Remember to commit and push the change.

**"Sign In" button does nothing or gives an error**
- Make sure `GOOGLE_CLIENT_ID` in `config.js` is set correctly (not the placeholder)
- Check that your GitHub Pages URL is listed in the OAuth credential's **Authorized redirect URIs**
- Make sure you're opening the app from the exact URL you registered (with or without trailing slash matters)

**Chores reset at the wrong time**
Chores automatically reset each day at midnight in the tablet's local time zone. If the tablet's clock is wrong, chores may reset at an unexpected time. Check the tablet's date/time settings.

**App won't go full-screen automatically**
Tap anywhere on the screen once after loading — the app requests full-screen on the first user interaction. If it still doesn't work, use the "Add to Home Screen" method above, which gives true full-screen.
