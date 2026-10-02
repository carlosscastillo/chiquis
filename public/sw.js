// Guarda la app en el teléfono para que abra sin internet.
// Si cambias algún archivo, sube también este con el número de versión aumentado.
const CACHE = 'chiquis-v4';
const ARCHIVOS = [
  './', './index.html', './styles.css', './app.js', './views.js', './core.js', './ui.js', './logic.js', './store.js',
  './data.js', './sanitize.js', './icons.js', './firebase.js', './perfiles.example.js', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-maskable.png',
  './fonts/oswald-latin-600-normal.woff2', './fonts/rubik-latin-400-normal.woff2',
  './fonts/rubik-latin-500-normal.woff2', './fonts/rubik-latin-700-normal.woff2',
];

// Archivos locales que pueden no existir (no están en el repositorio)
const OPCIONALES = ['./perfiles.js', './firebase-config.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(ARCHIVOS).then(() => Promise.all(OPCIONALES.map(f => c.add(f).catch(() => {})))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero intenta internet (para recibir cambios); si no hay o tarda, usa la copia guardada.
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // Solo archivos de la app; nunca el inicio de sesión de Firebase (/__/auth/...)
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/__/')) return;
  const deRed = fetch(req).then(res => {
    if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
    return res;
  });
  const limite = new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('lento')), 3000));
  e.respondWith(
    Promise.race([deRed, limite]).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(r => r || deRed.catch(() => caches.match('./index.html')))
    )
  );
});
