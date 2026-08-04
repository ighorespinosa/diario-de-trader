'use strict';

const CACHE = 'diario-de-trade-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icon.svg',
  './js/storage.js',
  './js/state.js',
  './js/data.js',
  './js/killzone.js',
  './js/calculations.js',
  './js/filters.js',
  './js/render.js',
  './js/chart.js',
  './js/capital-panel.js',
  './js/form.js',
  './js/print.js',
  './js/init.js',
  './js/register-sw.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Cache-first com atualização em segundo plano (stale-while-revalidate):
// serve do cache imediatamente quando existe, e atualiza o cache com a
// resposta de rede mais recente para a próxima vez.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
