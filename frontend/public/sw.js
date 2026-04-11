self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Listener minimo para manter a aplicacao instalavel no Chromium.
self.addEventListener('fetch', () => {});
