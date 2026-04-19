/**
 * Web push glue. Thin wrapper around the web-push library so callers
 * don't have to know about VAPID setup.
 *
 * Required env vars:
 *   VAPID_PUBLIC_KEY   — urlsafe-base64 (shared with client at subscribe time)
 *   VAPID_PRIVATE_KEY  — urlsafe-base64 (server-only, never exposed)
 *   VAPID_SUBJECT      — mailto: or https: URL (contact for push services)
 */

import webpush from 'web-push'
import type { PushSubscriptionRecord } from '@/lib/supabase/types'

let configured = false

function ensureConfigured(): boolean {
  if (configured) return true
  const pub  = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const sub  = process.env.VAPID_SUBJECT
  if (!pub || !priv || !sub) return false
  webpush.setVapidDetails(sub, pub, priv)
  configured = true
  return true
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null
}

export interface PushPayload {
  title: string
  body:  string
  url?:  string
  tag?:  string
}

export interface PushResult {
  ok:       boolean
  /** If the endpoint is dead (404/410), the caller should purge it. */
  gone:     boolean
  error?:   string
}

export async function sendPushNotification(
  sub: PushSubscriptionRecord,
  payload: PushPayload,
): Promise<PushResult> {
  if (!ensureConfigured()) return { ok: false, gone: false, error: 'vapid not configured' }

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 30 }   // drop after 30 min if the browser is offline
    )
    return { ok: true, gone: false }
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    const gone   = status === 404 || status === 410
    return { ok: false, gone, error: String(err) }
  }
}
