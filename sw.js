self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = new URL('/', self.location).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    for (let i = 0; i < windowClients.length; i++) {
      const client = windowClients[i];
      if (client.url === urlToOpen || client.url === location.origin + '/') {
        return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow('/');
  }));
});

self.addEventListener('push', function(event) {
  let data = {};
  try { data = event.data.json(); } catch (e) { try { data = { body: event.data.text() }; } catch (e2) { data = {}; } }
  const title = data.title || 'Tutor Manager';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon.svg',
    badge: data.badge || '/icons/icon.svg',
    data: data,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
