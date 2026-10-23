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
 *
 * Alerts (M61, D53): a push carries nothing. When one arrives, this asks
 * Wagbook, signed in, for the newest alerts (/api/alerts) and shows each,
 * once; tapping one opens its page.
 */
const VERSION = "wb-3";
const ALERTS_SEEN = "wb-alerts-seen";
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
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION) && k !== ALERTS_SEEN).map((k) => caches.delete(k))))
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
      .catch(async () => {
        const cache = await caches.open(PAGES);
        const hit = kept ? await cache.match(url.pathname) : undefined;
        return hit || (await cache.match("/offline.html")) || Response.error();
      }),
  );
});

// The newest alert shown, kept as one small entry so an alert is never shown twice.
async function lastSeen() {
  const hit = await (await caches.open(ALERTS_SEEN)).match("/last");
  return hit ? hit.text() : "";
}

async function showAlerts() {
  const after = await lastSeen();
  let alerts = [];
  try {
    const res = await fetch(`/api/alerts${after ? `?after=${encodeURIComponent(after)}` : ""}`, { credentials: "same-origin", cache: "no-store" });
    if (res.ok) alerts = (await res.json()).alerts || [];
  } catch {
    alerts = [];
  }
  if (alerts.length === 0) {
    // A push must show something; this says only to look, in the words the
    // alerts page left here in the person's language.
    const words = await (await caches.open(ALERTS_SEEN)).match("/words");
    const w = words ? await words.json() : { title: "Wagbook", body: "Something new at the kennel." };
    return self.registration.showNotification(w.title, { body: w.body, tag: "wagbook", data: { url: "/app" } });
  }
  await (await caches.open(ALERTS_SEEN)).put("/last", new Response(alerts[0].at));
  await Promise.all(alerts.map((a) => self.registration.showNotification(a.title, { body: a.body, tag: a.id, data: { url: a.url } })));
}

self.addEventListener("push", (event) => {
  event.waitUntil(showAlerts());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/app", self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === url.origin);
      return open ? open.navigate(url.href).then((w) => (w || open).focus()) : self.clients.openWindow(url.href);
    }),
  );
});
