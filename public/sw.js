/**
 * Agency OS service worker — web push only (UPGRADE_SPEC §8).
 * Deliberately no offline caching in v2: keep it tiny and safe.
 *
 * Push payload shape (sent by the worker dispatcher): {title, body, url}.
 */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Non-JSON payload — fall back to defaults below.
  }
  const title = typeof payload.title === 'string' ? payload.title : 'Agency OS';
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: typeof payload.url === 'string' ? payload.url : '/dashboard' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        for (const client of windows) {
          if ('focus' in client) {
            // Reuse an open app window: navigate it, then focus.
            if ('navigate' in client) client.navigate(url).catch(() => {});
            return client.focus();
          }
        }
        return clients.openWindow(url);
      }),
  );
});
