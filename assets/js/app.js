// FlexiCash Web — initialisation navigateur uniquement.
// Aucun pont Capacitor, plugin natif, push natif, biométrie ou lifecycle mobile.
export function refreshIcons(root = document) {
  try { window.lucide?.createIcons?.({ root, nameAttr: 'data-lucide' }); } catch {}
}

document.addEventListener('DOMContentLoaded', () => {
  refreshIcons();
  document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('revealed'));
});

// Même politique que le Web FlexiCash principal : Service Worker actif en
// HTTPS et en développement local, jamais via file://. updateViaCache:none
// garantit que le navigateur vérifie toujours la dernière version de sw.js.
const serviceWorkerAllowed = location.protocol === 'https:'
  || ['localhost', '127.0.0.1'].includes(location.hostname);

if ('serviceWorker' in navigator && serviceWorkerAllowed) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('../../sw.js', import.meta.url), { scope: '/', updateViaCache: 'none' })
      .then((registration) => registration.update().catch(() => null))
      .catch((error) => console.warn('[FlexiCash] Service Worker non enregistré :', error));
  }, { once: true });
}
