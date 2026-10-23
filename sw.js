// Сгенерировано scripts/build-sw.js — не редактировать вручную.
const VERSION = 'brawl-arena-b49a663ca1';
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./src/main.js",
  "./src/game.js",
  "./src/ai.js",
  "./src/render.js",
  "./src/ui.js",
  "./src/input.js",
  "./src/audio.js",
  "./src/maps.js",
  "./src/config.js",
  "./src/utils.js",
  "./src/pathfinding.js",
  "./src/updater.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-64.png"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // кэшируем по отдельности: один недоступный файл не ломает установку
      await Promise.all(
        CORE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Навигация: сначала сеть, потом офлайн-копия
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(VERSION);
          cache.put('./index.html', fresh.clone()).catch(() => {});
          return fresh;
        } catch (e) {
          const cache = await caches.open(VERSION);
          return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
        }
      })()
    );
    return;
  }

  // Остальное: сначала кэш, потом сеть (с докладыванием в кэш)
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(req, { ignoreSearch: false });
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch (e) {
        return cached || Response.error();
      }
    })()
  );
});
