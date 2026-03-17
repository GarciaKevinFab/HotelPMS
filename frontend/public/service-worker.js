// Confort Inn - Service Worker
const CACHE_NAME = 'confort-inn-v1';

// Install event
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
});

// Fetch event - network only, no cache fallback for now
// This avoids "Failed to convert value to Response" errors
self.addEventListener('fetch', (event) => {
  // Skip third-party requests (posthog, analytics, etc.)
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) {
    return; // Let the browser handle third-party requests normally
  }

  // For same-origin requests: network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          // Return cached response or a proper fallback
          return cached || new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' }),
          });
        });
      })
  );
});
