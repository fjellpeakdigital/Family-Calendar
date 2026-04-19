import { Resend } from 'resend'

let _resend: Resend | null = null

function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

const FROM = process.env.EMAIL_FROM ?? 'FamilyDash <noreply@familydash.app>'

// ── Shared HTML shell ──────────────────────────────────────────

function emailShell(body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  body { background:#0D1117; color:#F0F6FC; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; margin:0; padding:0; }
  .wrap { max-width:520px; margin:0 auto; padding:40px 24px; }
  .logo { font-size:28px; font-weight:800; letter-spacing:-1px; margin-bottom:32px; }
  .logo span { color:#58A6FF; }
  h1 { font-size:22px; font-weight:700; margin:0 0 12px; }
  p { font-size:15px; line-height:1.6; color:#8B949E; margin:0 0 16px; }
  .btn { display:inline-block; background:#3B82F6; color:#fff!important; text-decoration:none; font-size:15px; font-weight:700; padding:14px 28px; border-radius:12px; margin:8px 0 24px; }
  .card { background:#161B22; border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:20px 24px; margin:20px 0; }
  .row { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); }
  .row:last-child { border-bottom:none; }
  .label { font-size:14px; color:#8B949E; }
  .val { font-size:14px; font-weight:600; color:#F0F6FC; }
  .badge { display:inline-block; background:rgba(210,153,34,0.15); color:#D29922; border-radius:999px; padding:2px 10px; font-size:12px; font-weight:700; }
  .footer { margin-top:40px; font-size:12px; color:#484F58; }
  .footer a { color:#484F58; }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">🏠 Family<span>Dash</span></div>
  ${body}
  <div class="footer">
    <p>You're receiving this because you signed up for FamilyDash.<br/>
    <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://familydash.app'}/dashboard">Open dashboard</a>
    &nbsp;·&nbsp;
    <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://familydash.app'}/billing">Manage billing</a></p>
  </div>
</div>
</body>
</html>`
}

// ── Welcome email ──────────────────────────────────────────────

export async function sendWelcomeEmail(to: string, name: string | null) {
  if (!process.env.RESEND_API_KEY) return // silently skip if not configured

  const displayName = name ?? to.split('@')[0]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://familydash.app'

  const html = emailShell(`
    <h1>Welcome to FamilyDash, ${displayName}! 🎉</h1>
    <p>Your family dashboard is ready. Here's a quick overview of what you can do:</p>
    <div class="card">
      <div class="row"><span class="label">📅 Calendars</span><span class="val">Connect Google accounts</span></div>
      <div class="row"><span class="label">✅ Chores</span><span class="val">Set up daily tasks for kids</span></div>
      <div class="row"><span class="label">⭐ Rewards</span><span class="val">Let kids earn &amp; redeem points</span></div>
      <div class="row"><span class="label">🌤 Weather</span><span class="val">Live conditions for your city</span></div>
    </div>
    <p>Mount it on a tablet in your kitchen or hallway and your whole family stays in sync.</p>
    <a href="${appUrl}/dashboard" class="btn">Open your dashboard →</a>
    <p style="font-size:13px;">Questions? Just reply to this email — we read every one.</p>
  `)

  await getResend().emails.send({
    from:    FROM,
    to,
    subject: 'Welcome to FamilyDash 🏠',
    html,
  })
}

// ── Invite email ───────────────────────────────────────────────

export async function sendInviteEmail(to: string, inviterName: string, token: string) {
  if (!process.env.RESEND_API_KEY) return

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://familydash.app'
  const inviteUrl = `${appUrl}/invite/${token}`

  const html = emailShell(`
    <h1>You're invited to a family dashboard</h1>
    <p><strong>${inviterName}</strong> has invited you to join their FamilyDash —
    a shared wall display with the family calendar, chore charts, weather, and more.</p>
    <a href="${inviteUrl}" class="btn">Accept invitation →</a>
    <p style="font-size:13px;color:#484F58;">This link expires in 7 days. If you weren't expecting this, you can ignore it.</p>
  `)

  await getResend().emails.send({
    from:    FROM,
    to,
    subject: `${inviterName} invited you to FamilyDash`,
    html,
  })
}

// ── Weekly chore summary ───────────────────────────────────────

interface KidSummary {
  name:      string
  color:     string
  completed: number
  total:     number
  points:    number
}

// ── Event reminder ─────────────────────────────────────────────

export interface EventReminderPayload {
  to:         string
  recipientName: string | null
  title:      string
  location:   string | null
  startAt:    string   // ISO
  use24h:     boolean
}

/**
 * Low-detail reminder — keeps the email body minimal so sensitive
 * schedule metadata stays behind the login-gated dashboard, not in
 * the user's inbox.
 */
export async function sendEventReminderEmail(p: EventReminderPayload) {
  if (!process.env.RESEND_API_KEY) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://familydash.app'
  const when   = formatWhen(p.startAt, p.use24h)
  const greeting = p.recipientName ? `Hey ${p.recipientName},` : 'Hey,'

  const html = emailShell(`
    <h1>You're up: ${escapeHtml(p.title)}</h1>
    <p>${greeting} you're listed as responsible for this event.</p>
    <div class="card">
      <div class="row"><span class="label">Event</span><span class="val">${escapeHtml(p.title)}</span></div>
      <div class="row"><span class="label">When</span><span class="val">${when}</span></div>
      ${p.location ? `<div class="row"><span class="label">Where</span><span class="val">${escapeHtml(p.location)}</span></div>` : ''}
    </div>
    <a href="${appUrl}/dashboard" class="btn">Open dashboard →</a>
    <p style="font-size:13px;color:#484F58;">Reassign, reschedule, or mute reminders from your FamilyDash.</p>
  `)

  await getResend().emails.send({
    from:    FROM,
    to:      p.to,
    subject: `Reminder: ${p.title}`,
    html,
  })
}

function formatWhen(iso: string, use24h: boolean): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const time = use24h
    ? `${String(h).padStart(2, '0')}:${m}`
    : `${(h % 12) || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`
  return `${date} · ${time}`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' :
    c === '"' ? '&quot;' : '&#39;')
}

export async function sendWeeklySummaryEmail(to: string, kids: KidSummary[]) {
  if (!process.env.RESEND_API_KEY) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://familydash.app'

  const rows = kids.map(k => {
    const pct = k.total > 0 ? Math.round((k.completed / k.total) * 100) : 0
    return `
      <div class="row">
        <span class="label">${k.name}</span>
        <span class="val">${k.completed}/${k.total} chores &nbsp;<span class="badge">⭐ ${k.points} pts</span></span>
      </div>`
  }).join('')

  const html = emailShell(`
    <h1>Weekly chore summary 📋</h1>
    <p>Here's how your kids did with their chores this past week:</p>
    <div class="card">${rows}</div>
    <a href="${appUrl}/dashboard" class="btn">Open dashboard →</a>
  `)

  await getResend().emails.send({
    from:    FROM,
    to,
    subject: 'FamilyDash: your weekly chore summary',
    html,
  })
}
