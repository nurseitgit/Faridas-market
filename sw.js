const CACHE = 'baby-atelier-v20';
const FILES = ['./', './index.html', './styles.css?v=20', './app.js?v=20', './manifest.webmanifest?v=8', './icon.svg?v=8'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Сначала сеть, чтобы обновления приходили сразу; кэш — только без интернета.
self.addEventListener('fetch', e => {
	if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
	e.respondWith(fetch(e.request).then(response => {
		const copy = response.clone();
		caches.open(CACHE).then(c => c.put(e.request, copy));
		return response;
	}).catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html'))));
});
