/* ═══════════════════════════════════════════════════════════════════════
   RHOBEAR Hub — service worker.
   Purpose: PWA installability + a SAFE offline shell. Supersedes the old
   "self-destruct" SW. Deliberately NETWORK-FIRST for the app shell so a
   deployed fix is never masked by a stale cached copy (the exact trap the
   self-destruct SW was cleaning up after). Only versioned icons/manifest are
   cache-first. API + cross-origin requests are never touched.
   Bump CACHE to force a clean re-cache.
   ═══════════════════════════════════════════════════════════════════════ */
var CACHE = 'hub-shell-v1';
var PRECACHE = ['/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(PRECACHE).catch(function () { /* best-effort */ });
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try {
      var ks = await caches.keys();
      await Promise.all(ks.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    } catch (x) { /* ignore */ }
    try { await self.clients.claim(); } catch (x) { /* ignore */ }
  })());
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (x) { return; }
  if (url.origin !== self.location.origin) return;      // never touch API/cross-origin
  if (url.pathname.indexOf('/api/') === 0) return;       // same-origin API: straight to network
  if (url.pathname.indexOf('/v1/') === 0) return;

  // App shell / navigations: NETWORK-FIRST. Always fresh online; cache the last
  // good shell so an installed app still opens offline. Never serve stale online.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        try { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put('/index.html', copy); }); } catch (x) {}
        return res;
      }).catch(function () {
        return caches.match('/index.html').then(function (r) { return r || Response.error(); });
      })
    );
    return;
  }

  // Versioned static icons + manifest: cache-first.
  if (PRECACHE.indexOf(url.pathname) >= 0) {
    e.respondWith(caches.match(req).then(function (r) { return r || fetch(req); }));
    return;
  }
  // Everything else (styles.css, app.js, screens/*, fonts): pass through to network.
});
