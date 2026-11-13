/* Servicio en segundo plano de la versión publicada.
   Permite abrir la aplicación sin conexión. Siempre intenta primero la red,
   para que las mejoras lleguen solas; si no hay red, usa la copia guardada.
   Nunca toca las peticiones a GitHub (los datos). */
const COPIA = 'aprendizaje-v2';
const ARCHIVOS = ['./', 'index.html', 'estilos.css', 'app.js', 'almacen.js', 'graficos.js', 'icono.svg', 'icono-192.png', 'app.webmanifest'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(COPIA).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== COPIA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (evento) => {
  const direccion = new URL(evento.request.url);
  if (evento.request.method !== 'GET' || direccion.origin !== self.location.origin) return;
  evento.respondWith(
    fetch(evento.request)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(COPIA).then((c) => c.put(evento.request, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(evento.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
