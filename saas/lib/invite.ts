import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = () => {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('NEXTAUTH_SECRET is not set')
  return s
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ── Token shape ────────────────────────────────────────────────

interface InvitePayload {
  familyId: string
  email:    string   // invited email (may be empty = open invite)
  exp:      number   // unix ms timestamp
}

// ── Generate ───────────────────────────────────────────────────

export function createInviteToken(familyId: string, email: string): string {
  const payload: InvitePayload = {
    familyId,
    email: email.toLowerCase().trim(),
    exp: Date.now() + TTL_MS,
  }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig  = sign(data)
  return `${data}.${sig}`
}

// ── Verify ─────────────────────────────────────────────────────

export function verifyInviteToken(token: string): InvitePayload | null {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null
    const data = token.slice(0, dot)
    const sig  = token.slice(dot + 1)

    // Timing-safe comparison
    const expected = sign(data)
    const expBuf   = Buffer.from(expected, 'hex')
    const gotBuf   = Buffer.from(sig,      'hex')
    if (expBuf.length !== gotBuf.length) return null
    if (!timingSafeEqual(expBuf, gotBuf)) return null

    const payload: InvitePayload = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf8')
    )
    if (Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

// ── HMAC helper ────────────────────────────────────────────────

function sign(data: string): string {
  return createHmac('sha256', SECRET()).update(data).digest('hex')
}
