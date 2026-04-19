/**
 * Browser-side helpers for push subscription lifecycle.
 * Server-only logic lives in lib/push.ts — this file runs in the browser.
 */

export type PushStatus =
  | 'unsupported'     // Notification / Service Worker API missing
  | 'denied'          // User refused permission
  | 'unconfigured'    // Server has no VAPID keys — feature off globally
  | 'off'             // Everything ready, user hasn't enabled it
  | 'on'              // Active subscription registered

/**
 * Determine what state the browser is in. Does not prompt the user.
 */
export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === 'undefined') return 'unsupported'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'

  try {
    const res = await fetch('/api/push/vapid-public-key')
    if (!res.ok) return 'unconfigured'
  } catch {
    return 'unconfigured'
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = await reg?.pushManager.getSubscription()
    return sub ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

/**
 * Register the service worker (if needed), ask the user for
 * permission (if needed), subscribe, and POST the subscription to
 * our server. Safe to call multiple times.
 */
export async function ensurePushSubscription(): Promise<PushStatus> {
  if (typeof window === 'undefined') return 'unsupported'
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'

  const { key: publicKey } = await (await fetch('/api/push/vapid-public-key')).json().catch(() => ({ key: null }))
  if (!publicKey) return 'unconfigured'

  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'

  let sub = await registration.pushManager.getSubscription()
  if (!sub) {
    // applicationServerKey needs an ArrayBuffer, not a Uint8Array view.
    const keyBuffer = urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBuffer,
    })
  }

  const json = sub.toJSON()
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    }),
  })
  return 'on'
}

export async function disablePush(): Promise<PushStatus> {
  if (typeof window === 'undefined') return 'unsupported'
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      const { endpoint } = sub.toJSON()
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })
      await sub.unsubscribe()
    } else {
      await fetch('/api/push/unsubscribe', { method: 'POST' })
    }
  } catch {
    // Best-effort — even if the local unsubscribe fails, the server
    // side is authoritative for reminder delivery.
  }
  return 'off'
}

// VAPID public keys are urlsafe base64. PushManager.subscribe wants
// a raw Uint8Array.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const safe    = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = typeof window !== 'undefined' && window.atob
    ? window.atob(safe)
    : Buffer.from(safe, 'base64').toString('binary')
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
