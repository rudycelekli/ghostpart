const CACHE = "ghostpart-v0.3.1-shell";
const base = new URL(self.registration.scope);
const buildAssets = /* BUILD_ASSETS */ [];
const shell = [
  "",
  "demo-workbench.svg",
  "demo-fit.svg",
  "marker-auto-40mm.svg",
  "marker-40mm.svg",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  ...buildAssets,
].map((path) => new URL(path, base).href);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(shell)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((names) =>
        Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(base.href)));
    return;
  }
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
