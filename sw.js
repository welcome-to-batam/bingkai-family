/* ==========================================================
   BINGKAI FAMILY - SERVICE WORKER
   ----------------------------------------------------------
   Wajib untuk PWA install prompt. Cache static assets
   supaya app bisa jalan offline & memenuhi syarat install.

   Strategi:
   - Static assets (HTML, CSS, JS, icons) → cache-first
   - Firebase API (gstatic, firebaseio, googleapis) → network-only
   - Foto base64 di RTDB → tidak di-cache (dynamic)
   ========================================================== */

const CACHE_NAME = "bingkai-family-v20";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./admin.html",
  "./generasi.html",
  "./pohon.html",
  "./anggota.html",
  "./album.html",
  "./kalender.html",
  "./sejarah.html",
  "./privasi.html",
  "./style.css",
  "./admin.css",
  "./generasi.css",
  "./features.css",
  "./script.js",
  "./login.js",
  "./admin.js",
  "./album.js",
  "./tree.js",
  "./generasi.js",
  "./pohon.js",
  "./anggota.js",
  "./kalender.js",
  "./sejarah.js",
  "./firebase-config.js",
  "./manifest.json",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

// Install: cache semua static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll gagal kalau salah satu file 404 — kita toleransi
      return Promise.allSettled(
        STATIC_ASSETS.map((url) => cache.add(url))
      );
    })
  );
  self.skipWaiting();
  console.log("[SW] Installed & cached static assets");
});

// Activate: hapus cache lama
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
  console.log("[SW] Activated");
});

// Fetch: serve dari cache untuk static, network untuk Firebase
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Hanya handle GET
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // SKIP Firebase & CDN requests — selalu ke network
  if (
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebase.com") ||
    url.hostname.includes("google.com")
  ) {
    return; // Biarkan browser handle normally (network)
  }

  // Untuk same-origin requests: cache-first, fallback network
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Update cache di background (stale-while-revalidate)
          fetch(request)
            .then((response) => {
              if (response && response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, clone);
                });
              }
            })
            .catch(() => {});
          return cached;
        }

        // Tidak ada di cache → fetch dari network
        return fetch(request)
          .then((response) => {
            if (response && response.ok && response.type === "basic") {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, clone);
              });
            }
            return response;
          })
          .catch(() => {
            // Offline fallback — kalau ada cached index, return itu
            return caches.match("./index.html");
          });
      })
    );
  }
});
