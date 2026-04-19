// FamilyDash service worker — registered by MeClient on first load.
//
// Scope: push notifications only. We intentionally do NOT cache app
// assets here (Next.js handles its own offline story). Keeping this
// worker small limits the blast radius of cached-serviceworker bugs.

self.addEventListener('install', () => {
  // Activate immediately so subscription can be arranged on first visit.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Payload shape sent from lib/reminders.ts:
//   { title, body, url, tag }
self.addEventListener('push', (event) => {
  let data = { title: 'FamilyDash', body: '', url: '/me', tag: undefined }
  try { if (event.data) data = { ...data, ...event.data.json() } } catch { /* keep defaults */ }

  const options = {
    body: data.body,
    icon: '/window.svg',
    badge: '/window.svg',
    data: { url: data.url },
    tag:  data.tag,         // same tag → replaces the prior notification
    renotify: false,
  }

  event.waitUntil(self.registration.showNotification(data.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/me'

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // Prefer focusing an already-open tab on our origin.
    for (const c of allClients) {
      try {
        const url = new URL(c.url)
        if (url.origin === self.location.origin) {
          await c.focus()
          if ('navigate' in c) await c.navigate(targetUrl)
          return
        }
      } catch { /* ignore */ }
    }
    await self.clients.openWindow(targetUrl)
  })())
})
