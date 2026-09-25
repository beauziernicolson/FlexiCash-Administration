// FlexiCash Web — Service Worker
// Politique alignée sur le Web principal (baseline 2d60e810...).
// Cette édition est strictement Web : aucun chemin Android/iOS/Capacitor.

const CACHE_NAME = "flexicash-runtime-v140-hosted-return-bfcache";

const QR_LIBRARIES = new Set([
  "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js",
]);

// Socle réellement présent dans l'édition Web publique. Promise.allSettled
// garantit qu'un asset momentanément indisponible ne bloque jamais
// l'installation complète du Service Worker.
const CORE = [
  "/offline.html",
  "/index.html",
  "/404.html",
  "/manifest.webmanifest",
  "/assets/vendor/lucide/lucide-subset.js",
  "/assets/css/reset.css",
  "/assets/css/variables.css",
  "/assets/css/global.css",
  "/assets/css/components.css",
  "/assets/css/public.css",
  "/assets/css/auth.css",
  "/assets/css/client.css",
  "/assets/css/responsive.css",
  "/assets/css/brand-green.css",
  "/assets/css/ux-polish.css",
  "/assets/js/app.js",
  "/assets/js/components.js",
  "/assets/js/config.js",
  "/assets/js/services/supabase-client.js",
  "/assets/js/services/auth-service.js",
  "/assets/js/services/turnstile-service.js",
  "/auth/login.html",
  "/auth/register.html",
  "/auth/callback.html",
  "/auth/forgot-password.html",
  "/auth/recover-access.html",
  "/auth/reset-password.html",
  "/auth/mfa.html",
  "/app/dashboard.html",
  "/app/send.html",
  "/app/receive.html",
  "/app/deposit.html",
  "/app/withdraw.html",
  "/app/transactions.html",
  "/app/scan.html",
  "/app/savings.html",
  "/app/profile.html",
  "/app/security.html",
  "/app/settings.html",
  "/app/support.html",
  "/account/status.html",
  "/admin/index.html",
  "/payments/return.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(CORE.map((url) => cache.add(url)));
    await Promise.allSettled([...QR_LIBRARIES].map(async (url) => {
      const response = await fetch(url, { mode: "cors", credentials: "omit" });
      if (response.ok) await cache.put(url, response.clone());
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("flexicash-runtime-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isQrLibrary = QR_LIBRARIES.has(url.href);
  const isAuthCallback = url.origin === self.location.origin && url.pathname === "/auth/callback.html";
  const isLocalStatic = url.origin === self.location.origin
    && /\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?|html|webmanifest)$/i.test(url.pathname);

  if (!isQrLibrary && !isLocalStatic) return;

  // Le callback OAuth peut contenir un code temporaire à usage unique :
  // il doit toujours venir du réseau et ne doit jamais être écrit en cache.
  if (isAuthCallback) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request, { ignoreSearch: false });

    // Même principe que le Web principal : toute navigation et tout fichier
    // d'authentification/runtime sensible est servi network-first afin de ne
    // jamais bloquer un correctif de connexion ou d'état financier derrière
    // une ancienne version du cache.
    const authCritical = event.request.mode === "navigate" || [
      "/auth/mfa.html",
      "/auth/login.html",
      "/auth/callback.html",
      "/auth/forgot-password.html",
      "/auth/recover-access.html",
      "/auth/reset-password.html",
      "/assets/js/services/supabase-client.js",
      "/assets/js/services/auth-service.js",
      "/assets/js/services/turnstile-service.js",
      "/assets/js/app.js",
      "/payments/return.html",
    ].includes(url.pathname);

    if (authCritical) {
      try {
        const response = await fetch(event.request, { cache: "no-store" });
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch (error) {
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          return (await cache.match("/offline.html")) || Response.error();
        }
        throw error;
      }
    }

    // Assets statiques : cache-first, puis mise en cache à la première lecture.
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok || response.type === "opaque") {
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      throw error;
    }
  })());
});
