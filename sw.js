self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Hábitos', body: 'Tienes un hábito pendiente.' };
  if (event.data) {
    try { payload = event.data.json(); } catch (e) { payload.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Hábitos', {
      body: payload.body || '',
      icon: 'assets/icon-192.png',
      badge: 'assets/icon-192.png',
      data: { url: payload.url || './' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
