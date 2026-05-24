// Marketing Planner — Service Worker v2
// Caches the app shell, supports offline, and handles Web Push.

var CACHE = 'mp-v2';
var ASSETS = [
  '/MP/',
  '/MP/index.html',
  '/MP/mp_v1_FINAL.html',
  '/MP/manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      // addAll fails atomically if any one URL 404s; use individual puts.
      return Promise.all(ASSETS.map(function(url) {
        return fetch(url, { cache: 'reload' })
          .then(function(res) { if (res.ok) return cache.put(url, res); })
          .catch(function() {});
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// Network-first for navigations (so users get fresh HTML when online),
// cache-first for everything else, with a network update in the background.
self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  // Don't cache cross-origin API calls (Supabase, Calendarific, OneSignal).
  var sameOrigin = url.origin === self.location.origin;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function(res) {
        if (res && res.ok && sameOrigin) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c) { c.put(req, copy); });
        }
        return res;
      }).catch(function() {
        return caches.match(req).then(function(c) { return c || caches.match('/MP/'); });
      })
    );
    return;
  }

  if (!sameOrigin) return; // let the network handle 3rd-party requests

  e.respondWith(
    caches.match(req).then(function(cached) {
      var network = fetch(req).then(function(res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function(c) { c.put(req, copy); });
        }
        return res;
      }).catch(function() { return cached; });
      return cached || network;
    })
  );
});

// ── Web Push (works on iOS 16.4+ when installed to Home Screen) ──
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) {
    data = { title: 'Marketing Planner', body: e.data ? e.data.text() : '' };
  }
  var title = data.title || 'Marketing Planner';
  var options = {
    body: data.body || '',
    icon: data.icon || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%231A6B3C'/%3E%3Crect x='20' y='25' width='60' height='55' rx='8' fill='none' stroke='white' stroke-width='5'/%3E%3C/svg%3E",
    badge: data.badge,
    tag: data.tag || 'mp-push',
    data: { url: data.url || '/MP/' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var target = (e.notification.data && e.notification.data.url) || '/MP/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf(target) !== -1 && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

// Allow the page to ask the SW to update immediately after deploy.
self.addEventListener('message', function(e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
