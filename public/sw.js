const CACHE_NAME = 'gestorescola-v1'
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg'
]

// install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache)
    })
  )
  self.skipWaiting()
})

// fetch event (cache-first strategy)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Return from cache if found
      if (response) {
        return response
      }

      // Otherwise, fetch from network
      return fetch(event.request).catch(() => {
        // Fallback for offline: return index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html')
        }
      })
    })
  )
})

// activate event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  self.clients.claim()
})
