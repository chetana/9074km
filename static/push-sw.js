self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try { payload = event.data.json() } catch { return }

  const title = payload.title ?? 'Lys 💌'
  const options = {
    body: payload.body ?? '',
    icon: '/icons/Icon-192.png',
    badge: '/icons/Icon-192.png',
    tag: 'chat-message',
    renotify: true,
    data: { url: payload.url ?? '/chat' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/chat'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
