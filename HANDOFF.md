# Family Calendar — Handoff

## What It Is

A SaaS family dashboard deployed on Vercel. Families connect their Google Calendars, manage kids' chores and point rewards, and view live weather. Multi-tenant: every family is isolated in Supabase. Stripe handles subscriptions (Free / Family / Family+).

Live app is served from the `saas/` subdirectory. All commands below assume you're in `saas/`.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2.2 (App Router), React 19 |
| Auth | NextAuth v5 beta — Google OAuth only |
| Database | Supabase (Postgres + Realtime) |
| Payments | Stripe (Checkout + Customer Portal + Webhooks) |
| Email | Resend |
| Weather | OpenWeatherMap free tier |
| Rate limiting | Upstash Redis |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel (framework: nextjs, cron job wired via vercel.json) |

> **Important:** This is Next.js 16, not 14/15. APIs and file conventions differ from training data. Read `node_modules/next/dist/docs/` before touching routing or middleware.

---

## Repository Layout

```
Family-Calendar/
├── saas/                  ← the entire Next.js app lives here
│   ├── app/               ← App Router pages + API routes
│   │   ├── page.tsx                     landing/marketing page
│   │   ├── login/page.tsx               Google sign-in
│   │   ├── dashboard/                   main dashboard
│   │   │   ├── layout.tsx               auth guard
│   │   │   └── page.tsx                 fetches config, renders client
│   │   ├── onboarding/page.tsx          first-run setup wizard
│   │   ├── billing/page.tsx             Stripe plan management
│   │   ├── invite/[token]/page.tsx      invite link acceptance
│   │   └── api/
│   │       ├── auth/[...nextauth]/      NextAuth handler
│   │       ├── config/                  read/write family config (JSONB)
│   │       ├── calendar/                Google Calendar proxy
│   │       ├── chores/                  completions read/write
│   │       ├── weather/                 OpenWeatherMap proxy
│   │       ├── account/                 connected accounts, calendars, GDPR export/delete
│   │       ├── invite/                  send invite email
│   │       ├── rewards/claim/           kid claims a reward, deducts points
│   │       ├── stripe/                  checkout, portal, webhook
│   │       └── cron/weekly-summary/     Vercel Cron — Sunday 09:00 UTC
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── DashboardClient.tsx      top-level client orchestrator
│   │   │   ├── ConfigProvider.tsx       React context + Realtime sync
│   │   │   ├── AdminPanel.tsx           settings UI (PIN-protected)
│   │   │   ├── CalendarView.tsx         today / week / month views
│   │   │   ├── ChoresView.tsx           chore columns per kid + rewards panel
│   │   │   └── WeatherWidget.tsx        header weather display
│   │   └── onboarding/                  5-step wizard components
│   ├── lib/
│   │   ├── auth.ts                      NextAuth config, token encryption, user creation
│   │   ├── auth-config.ts               edge-safe auth (no Node.js imports)
│   │   ├── crypto.ts                    AES-256-GCM for OAuth token storage
│   │   ├── email.ts                     Resend — welcome / invite / weekly summary
│   │   ├── invite.ts                    HMAC-SHA256 signed invite tokens (7-day TTL)
│   │   ├── google-calendar.ts           Google Calendar API client
│   │   ├── stripe.ts                    Stripe singleton + plan metadata
│   │   ├── subscription.ts              current plan lookup
│   │   ├── limits.ts                    per-plan feature gates
│   │   ├── rate-limit.ts                Upstash Redis rate limiter (60 req/min/IP)
│   │   └── supabase/
│   │       ├── client.ts                browser client (anon key, Realtime)
│   │       ├── server.ts                server client (service role, bypasses RLS)
│   │       └── types.ts                 hand-written TS types for all DB shapes
│   ├── supabase/schema.sql              full DB schema with RLS, triggers, purge fn
│   ├── app/globals.css                  Tailwind base + light/dark theme CSS vars
│   ├── vercel.json                      framework: nextjs, cron schedule
│   └── .env.example                     all required env vars documented
└── HANDOFF.md             ← this file
```

---

## Database Schema (Supabase)

Five tables, all with RLS enabled. Schema is in `saas/supabase/schema.sql`.

| Table | Purpose |
|---|---|
| `families` | One row per family. Holds `stripe_customer_id` and `plan` (free / family / family_plus) |
| `users` | One row per user. `family_id` FK, `role` (owner / member) |
| `oauth_tokens` | Encrypted Google OAuth tokens per connected Google account |
| `family_config` | Single JSONB blob per family containing all UI config (people, chores, calendars, settings, rewards, points) |
| `chore_completions` | One row per kid × chore × date. Auto-purged by plan tier (14 days free, 90 days paid) |

The entire dashboard state lives in `family_config.config_json`. Shape:
```ts
{
  people:          Person[]           // adults + kids with colors
  chores:          ChoreDefinition[]  // chore defs with points, days, period
  cal_assignments: CalAssignment[]    // which Google calendar → which person
  settings:        Settings           // location, use24h, theme, pin
  rewards:         Record<kidId, Reward[]>
  points:          Record<kidId, number>
}
```

---

## Environment Variables

All required vars — copy `.env.example` to `.env.local` for local dev, then add each to Vercel.

```bash
# NextAuth
NEXTAUTH_SECRET=          # random 32+ byte secret: openssl rand -base64 32
NEXTAUTH_URL=             # http://localhost:3000 (local) or https://your-domain.vercel.app (prod)

# Google OAuth — console.cloud.google.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Supabase — project settings → API
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Token encryption (AES-256) — openssl rand -hex 32
TOKEN_ENCRYPTION_KEY=

# Stripe — dashboard.stripe.com
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_FAMILY=      # price ID for Family plan
STRIPE_PRICE_FAMILY_PLUS= # price ID for Family+ plan

# Upstash Redis (rate limiting) — console.upstash.com
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Resend (email) — resend.com
RESEND_API_KEY=
EMAIL_FROM=               # e.g. Family Calendar <noreply@yourdomain.com>

# OpenWeatherMap — openweathermap.org/api (free tier)
OPENWEATHER_API_KEY=      # new keys take up to 2 hrs to activate

# App URL (used in invite links, email templates)
NEXT_PUBLIC_APP_URL=      # https://your-domain.vercel.app

# Vercel Cron auth
CRON_SECRET=              # any random string; set same value in vercel.json env
```

---

## Plans & Feature Gates

Defined in `lib/stripe.ts` and `lib/limits.ts`:

| Feature | Free | Family | Family+ |
|---|---|---|---|
| Google accounts | 1 | 3 | 5 |
| Kids | 2 | 5 | unlimited |
| Chore history | 14 days | 90 days | 90 days |
| Rewards system | ✗ | ✗ | ✓ |
| Invite members | ✗ | ✓ | ✓ |

---

## Key Design Decisions

**Config as JSONB** — All family configuration (people, chores, calendars, settings) lives in one Supabase JSONB column. No schema migrations needed when adding new config fields. Tradeoff: can't query inside the config, but nothing needs to.

**No RLS on server** — All server-side Supabase calls use `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS). Auth is verified in each API route via NextAuth session before any DB access. RLS is still enabled as a defence-in-depth backstop.

**OAuth tokens encrypted at app layer** — Google tokens are AES-256-GCM encrypted before writing to Supabase and decrypted in `lib/google-calendar.ts`. Even a DB breach doesn't expose tokens.

**Invite tokens are stateless** — No invites table. Tokens are HMAC-signed JWTs (base64url) containing `{familyId, email, exp}`. Verified via `timingSafeEqual`. 7-day TTL.

**Tailwind v4 light theme** — Light theme is implemented by overriding `--color-*` CSS custom properties under `[data-theme="light"]` in `globals.css`. The `data-theme` attribute sits on the DashboardClient and AdminPanel root divs. Note: `bg-white/N` and `border-white/N` utilities use literal `rgb(255 255 255/N%)` — not CSS vars — so they are overridden via attribute-selector CSS rules in `globals.css`.

**Clock/date are always client-side** — `now` state starts as `null` (SSR) and is set in a `useEffect`. Chore dates use a separate `todayStr` state (updates every 60s) so the 1-second clock tick does not trigger API refetches.

---

## Google OAuth Setup (required for calendar access)

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **Google Calendar API**
3. OAuth consent screen → External → add scopes:
   - `openid`, `email`, `profile`
   - `https://www.googleapis.com/auth/calendar.readonly`
4. Credentials → OAuth 2.0 Client ID → Web application
   - Authorized redirect URI: `https://your-domain.vercel.app/api/auth/callback/google`
   - Also add `http://localhost:3000/api/auth/callback/google` for local dev
5. Copy Client ID + Secret into env vars

---

## Deployment (Vercel)

Branch `main` deploys to production automatically.

```bash
# First deploy or after env var changes:
# 1. Push code to main
git push origin main

# 2. Add / update env vars in Vercel dashboard
#    Project → Settings → Environment Variables

# 3. Redeploy (if env vars changed)
#    Vercel dashboard → Deployments → Redeploy latest
```

`vercel.json` contains:
```json
{
  "framework": "nextjs",
  "crons": [{ "path": "/api/cron/weekly-summary", "schedule": "0 9 * * 0" }]
}
```

The `"framework": "nextjs"` key is required — without it Vercel treats the repo as generic Node.js and can't find an entrypoint.

---

## Known Issues / Pending Work

| Issue | Status | Notes |
|---|---|---|
| Weather not showing in production | Config needed | Add `OPENWEATHER_API_KEY` to Vercel env vars + redeploy. Also set location in Admin → Settings. New OWM keys take up to 2 hrs to activate. |
| Stripe not wired up | Incomplete | `STRIPE_PRICE_FAMILY` and `STRIPE_PRICE_FAMILY_PLUS` price IDs need to be created in Stripe dashboard and added to env. |
| `RESEND_API_KEY` not set | Incomplete | Email (welcome, invite, weekly summary) silently no-ops if missing. Add key from resend.com. |
| Upstash Redis not set | Incomplete | Rate limiter gracefully degrades (no-ops) if `UPSTASH_REDIS_REST_*` are missing. Fine for low traffic. |
| `.env.local` was previously tracked | Fixed | Removed from git history is not fully purged — old commits still contain secret values. Consider rotating all keys if this is a concern. |
| Light theme — further polish | Minor | Some edge cases in non-Settings tabs (chores/calendar) may still have low-contrast elements in light mode. |

---

## Local Development

```bash
cd saas
npm install
cp .env.example .env.local   # fill in your values
npm run dev                   # http://localhost:3000
```

Supabase: run `supabase/schema.sql` against your Supabase project once (SQL editor in Supabase dashboard).

---

## Useful Commands

```bash
npm run dev        # start dev server
npm run build      # production build (catches type errors)
npm run lint       # ESLint check
```

Git branches:
- `main` — production, auto-deploys to Vercel
- `claude/family-dashboard-vujB4` — feature branch used during Phase 3 build
