/*
 * Wagbook's service worker (roadmap M8, decision D22).
 *
 * It keeps the last copy of two pages, Today (/app) and Care (/app/care), so
 * a phone that loses its connection can still open them, and keeps the app's
 * own scripts and styles so those copies work. Ticks made offline are saved by
 * the page itself (src/lib/offline-ticks.ts), not here. Nothing else is kept:
 * every other page, and every request to Supabase, goes to the network as
 * usual. The copies are thrown away when someone signs out (the sign-in page
 * asks for that) and when this file changes.
 */
const VERSION = "wb-1";
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const KEPT = ["/app", "/app/care"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((cache) => cache.add("/offline.html")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "forget-pages") event.waitUntil(caches.delete(PAGES).then(() => caches.open(PAGES)).then((c) => c.add("/offline.html")));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The app's own files have their content hash in the name: keep them.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode !== "navigate") return;
  const kept = KEPT.includes(url.pathname);
  event.respondWith(
    fetch(request)
      .then((res) => {
        // Keep the newest copy of Today and Care, signed in and complete.
        if (kept && res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(PAGES).then((c) => c.put(url.pathname, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .open(PAGES)
          .then((c) => (kept ? c.match(url.pathname) : undefined).then((hit) => hit || c.match("/offline.html"))),
      ),
  );
});
