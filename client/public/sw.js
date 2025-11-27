const CACHE_NAME = 'beybladexmeta-cache-v1';
const ASSETS = [
  '/',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Do not intercept cross-origin requests (e.g., MinIO bucket)
  if (url.origin !== self.location.origin) return;
  // Do not intercept API routes (OAuth/session-critical)
  if (url.pathname.startsWith('/api/')) return;
  // Let browser handle images to avoid interfering with buckets served on same origin
  if (req.destination === 'image') return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((res) => {
        try {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        } catch {}
        return res;
      }).catch(() => cached || Promise.reject('no-match'));
      return cached || fetchPromise;
    })
  );
});