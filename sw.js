const CACHE_NAME = 'albayan-v7';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './garden.css',
  './app.js',
  './quranData.js',
  './surahGuide.js',
  './heartGuide.js',
  './quranLearn.js',
  './namazData.js',
  './assets/namaz/01-takbir.svg',
  './assets/namaz/02-qiyam.svg',
  './assets/namaz/03-ruku.svg',
  './assets/namaz/04-itidal.svg',
  './assets/namaz/05-sujud.svg',
  './assets/namaz/06-julus.svg',
  './assets/namaz/07-tashahhud.svg',
  './assets/namaz/08-taslim.svg',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Тексты сур кэшируются при первом открытии, чтобы читать их офлайн
  if (e.request.url.includes('/data/quran/')) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
        const copy = res.clone();
        if (res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
        return res;
      }))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return fetch(e.request).catch(() => cachedResponse);
      }
      return fetch(e.request);
    })
  );
});
