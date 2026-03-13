// AlbaConnect Service Worker — Web Push notification handler
// Must be at the root scope (/sw.js) for full push notification access.
// All event listeners are registered synchronously (no top-level await).

self.addEventListener('install', (event) => {
  // Skip waiting so the new service worker activates immediately
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  // Take control of all clients without requiring a page reload
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: '새 알바 제안', body: event.data ? event.data.text() : '' }
  }

  const title = '🔔 새 알바 제안'
  const options = {
    body: data.title
      ? `${data.title} | ${data.hourlyRate ? data.hourlyRate.toLocaleString() + '원/시간' : ''} | ${data.distanceKm ? data.distanceKm.toFixed(1) + 'km' : ''}`
      : '새로운 알바 제안이 도착했습니다.',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    tag: 'job-offer',
    renotify: true,
    requireInteraction: true,
    data: {
      jobId: data.jobId,
      url: '/worker/jobs',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/worker/jobs'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if already open
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && 'focus' in client) {
            return client.focus()
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl)
        }
      })
  )
})
