// JalTaap service worker. Its only job is live-safety notifications: Android Chrome shows page
// notifications only through a service worker. No caching, no offline mode, no push.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Tapping a warning brings the open app to the front, or opens the safety page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) if ('focus' in client) return client.focus()
      return self.clients.openWindow('/me')
    }),
  )
})
