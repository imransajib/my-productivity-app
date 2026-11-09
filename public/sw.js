// Apex Planner service worker
// - Pages: network-first (3 s timeout) so reopening the app always loads the newest release,
//   falling back to the cached page when offline.
// - /_next/static: cache-first (file names are content-hashed, so they never go stale).
// - API + auth: never cached.
const SHELL = 'apex-shell-v3';
const STATIC = 'apex-static-v1';
const PRECACHE = ['/', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // always network

  if (req.mode === 'navigate') {
    event.respondWith(
      Promise.race([fetch(req), timeout(3000)])
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || fetch(req)))
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(STATIC).then((c) => c.put(req, copy));
          }
          return res;
        })
      )
    );
    return;
  }

  // Icons, manifest etc.: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// ---------- Reminders (Web Push) ----------
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Apex Planner', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Reminder';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin)) {
          w.focus();
          w.postMessage({ type: 'open', url: target });
          return;
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
