const CACHE_NAME = 'gestorescola-v3'
const STATIC_ASSETS = ['/manifest.json', '/icon.svg']
const ORIGIN = self.location.origin

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

  // Never intercept cross-origin requests (Firestore, Google Auth, fonts, etc.)
  if (url.origin !== ORIGIN) return

  // Hashed assets: always fetch from network (hash guarantees uniqueness per build)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(fetch(request))
    return
  }

  // Navigation (SPA routes): network-first, fallback to cached index.html offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    )
    return
  }

  // Same-origin static assets without hash (manifest, icons): cache-first
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  )
})
