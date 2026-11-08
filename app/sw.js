/* Service worker: l'app si apre anche senza rete.
   - data.json: prima la rete, se manca l'ultima copia salvata;
   - tutto il resto (pagina, stile, loghi): prima la copia salvata, poi la rete.
   Cambiare VERSIONE a ogni modifica di index.html / app.js / style.css. */
const VERSIONE = "v1";
const GUSCIO = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest",
  "icone/icona-192.png", "icone/icona-512.png", "icone/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(GUSCIO)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((chiavi) => Promise.all(chiavi.filter((k) => k !== VERSIONE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  if (url.pathname.endsWith("/data.json")) {
    e.respondWith(
      fetch(e.request, { cache: "no-cache" })
        .then((r) => {
          const copia = r.clone();
          caches.open(VERSIONE).then((c) => c.put("data.json", copia));
          return r;
        })
        .catch(() => caches.match("data.json"))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((salvata) =>
      salvata ||
      fetch(e.request).then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSIONE).then((c) => c.put(e.request, copia)); }
        return r;
      }).catch(() => (e.request.mode === "navigate" ? caches.match("index.html") : undefined))
    )
  );
});
