// Minimal service worker: caches the app shell so the icon opens instantly.
// Your data always comes live from the app, never from this cache.
// Pages and the manifest always skip the browser cache, so a new look shows up on the next open.
const CACHE = 'grid-shell-v6';
const SHELL = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  e.respondWith((e.request.mode === 'navigate' || /\.(webmanifest|html)$|\/$/.test(u.pathname) ? fetch(u.href, { cache: 'no-store' }) : fetch(e.request)).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
