const CACHE_NAME = "banker-simulation-v1";
const BASE_URL = new URL("./", self.location.href);
const pageUrl = (path) => new URL(path, BASE_URL).toString();
const STATIC_ASSETS = [
  pageUrl("./"),
  pageUrl("index.html"),
  pageUrl("manifest.webmanifest"),
  pageUrl("assets/assets/coin.svg"),
  pageUrl("assets/avatars/mina-neutral.webp"),
  pageUrl("assets/board/network-grid-light.webp"),
  pageUrl("assets/composer/tray-surface.webp"),
];

async function installShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(STATIC_ASSETS);
  const response = await fetch(pageUrl("index.html"));
  const html = await response.clone().text();
  const buildAssets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((asset) => asset && !asset.startsWith("http"))
    .map((asset) => pageUrl(asset));
  await cache.put(pageUrl("index.html"), response);
  await Promise.all(buildAssets.map((asset) => cache.add(asset)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(installShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          void caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(pageUrl("index.html"), copy));
          return response;
        })
        .catch(
          async () =>
            (await caches.match(pageUrl("index.html"))) || Response.error(),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    }),
  );
});
