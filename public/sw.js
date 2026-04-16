const CACHE_NAME = 'gestorescola-v2'
const STATIC_ASSETS = ['/manifest.json', '/icon.svg']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Hashed assets (/assets/*.js, /assets/*.css): always network — never serve stale JS
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(fetch(request))
    return
  }

  // Navigation requests: network-first, fallback to cached index.html for offline SPA
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    )
    return
  }

  // Static assets without hash (manifest, icons): cache-first
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  )
})
