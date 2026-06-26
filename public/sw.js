// DEADRECKON land-nav service worker.
// Offline-first runtime caching so the app keeps working in the backcountry
// once it has been opened with signal. Map images live in localStorage, not
// here. Static-export asset URLs are content-hashed, so a simple
// stale-while-revalidate runtime cache is safe.

const CACHE = "deadreckon-v3";
const APP_SHELL = [
  "/",
  "/map",
  "/navigate",
  "/compass",
  "/coordinates",
  "/guide",
  "/manifest.webmanifest",
  "/deadreckon-icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Best-effort: don't fail the whole install if one URL 404s.
      Promise.allSettled(APP_SHELL.map((u) => cache.add(u))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations and the app's own JS/CSS: NETWORK-FIRST so you always get
  // the latest deploy when online, with cache fallback when offline. (Static
  // export asset URLs are content-hashed, so this is safe.) Everything else
  // stays stale-while-revalidate.
  const isAppShell =
    req.mode === "navigate" ||
    /\.(?:js|css|webmanifest)$/.test(url.pathname);

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const fromNetwork = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (isAppShell) {
        const net = await fromNetwork;
        if (net) return net;
        const cached = await cache.match(req);
        return cached || (req.mode === "navigate" ? cache.match("/") : undefined);
      }

      // Stale-while-revalidate for other GETs.
      const cached = await cache.match(req);
      return cached || (await fromNetwork) || undefined;
    }),
  );
});
