// The city's service worker: shows an alert (src/push.js sends it) and opens that card when you tap it. Nothing else:
// no caching, so the home screen is always the live one.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('push', function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || 'Your City', { body: d.body || '', tag: d.tag || 'city', icon: '/icon.svg', badge: '/icon.svg', data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if ('focus' in list[i]) { list[i].postMessage({ go: url }); return list[i].focus(); }
    return self.clients.openWindow(url);
  }));
});
