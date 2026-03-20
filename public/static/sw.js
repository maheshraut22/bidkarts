// BidKarts Service Worker - PWA Support for Android & iOS
const CACHE_NAME = 'bidkarts-v5';
const STATIC_CACHE = 'bidkarts-static-v5';

// Assets to cache for offline support
const STATIC_ASSETS = [
  '/',
  '/static/app.js',
  '/static/styles.css',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Silently fail if some assets aren't available
      });
    })
  );
  self.skipWaiting();
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // API calls - always network first, no caching
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() => {
      return new Response(JSON.stringify({ error: 'Offline - No network connection' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }));
    return;
  }
  
  // Static assets - cache first
  if (url.pathname.startsWith('/static/') || url.pathname === '/') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }
  
  // All other requests - network first
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match('/') || new Response('Offline', { status: 503 });
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncOfflineMessages());
  }
});

async function syncOfflineMessages() {
  // Sync any offline messages when connection is restored
  const offlineData = await getOfflineData();
  if (offlineData && offlineData.length > 0) {
    for (const item of offlineData) {
      try {
        await fetch(item.url, { method: item.method, body: item.body });
      } catch {}
    }
  }
}

async function getOfflineData() {
  return [];
}

// Push notifications support
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body || 'You have a new notification from BidKarts',
    icon: '/static/icon-192.png',
    badge: '/static/icon-72.png',
    tag: data.tag || 'bidkarts-notification',
    data: { url: data.url || '/' },
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'BidKarts', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'view' || !event.action) {
    const url = event.notification.data?.url || '/';
    event.waitUntil(
      clients.openWindow(url)
    );
  }
});
