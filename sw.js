// Service worker de "Trabajos y Servicios — Paraje Las Golondrinas"
// Objetivo: que la página abra aunque no haya señal, mostrando la última
// version guardada (tanto de la pagina en si como de los datos de la planilla).

const CACHE_APP = "golondrinas-app-v2";
const CACHE_DATOS = "golondrinas-datos-v1";

const ARCHIVOS_APP = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./logo-junta-vecinal.jpg",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_APP).then((cache) => cache.addAll(ARCHIVOS_APP))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((n) => n !== CACHE_APP && n !== CACHE_DATOS)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // datos de la planilla (Google Sheets publicado como CSV): red primero,
  // y si no hay conexion, se sirve la ultima copia guardada
  if (url.includes("docs.google.com/spreadsheets")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE_DATOS).then((cache) => cache.put("ultima-planilla", copia));
          return res;
        })
        .catch(() => caches.open(CACHE_DATOS).then((cache) => cache.match("ultima-planilla")))
    );
    return;
  }

  // el resto de la pagina (html, css, js, imagenes): cache primero, mas rapido,
  // y en segundo plano intenta actualizar la copia guardada para la proxima
  if (event.request.method === "GET" && url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(event.request).then((cacheada) => {
        const redFetch = fetch(event.request)
          .then((res) => {
            if (res && res.status === 200) {
              const copia = res.clone();
              caches.open(CACHE_APP).then((cache) => cache.put(event.request, copia));
            }
            return res;
          })
          .catch(() => cacheada);
        return cacheada || redFetch;
      })
    );
  }
});
