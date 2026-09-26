// ============================================================================
// FlexiCash — Bandeau d'état de la connexion
// ----------------------------------------------------------------------------
// Jusqu'ici, perdre le réseau ne se voyait nulle part : les pages restaient
// affichées avec des montants figés, et l'utilisateur ne découvrait le
// problème qu'en appuyant sur un bouton qui échouait. Sur une application
// financière, voir un solde sans savoir qu'il n'est plus à jour est
// trompeur — c'est le genre de détail qui fait douter de l'application
// entière.
//
// Le bandeau dit d'abord CE QUI SE PASSE, puis ce que ça implique. La
// confirmation verte « Connexion rétablie » ne s'affiche QUE si on avait
// réellement signalé une coupure, puis disparaît d'elle-même : on la glisse
// hors écran et on la retire ensuite du DOM, pour qu'un événement `online`
// répété (fréquent sur mobile : changement wifi/cellulaire, retour de
// veille) ne puisse jamais la laisser coincée à l'écran.
// ============================================================================

const ID = "fx-connection-banner";
const DUREE_GLISSADE = 300; // ms — doit couvrir la transition CSS (.25s)
let masquageTimer = null;
let retraitTimer = null;
let horsLigneActif = false; // le bandeau « hors ligne » est-il en cours d'affichage ?

function creer() {
  let el = document.getElementById(ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = ID;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.style.cssText = [
    "position:fixed",
    "left:0", "right:0", "top:0",
    "z-index:99990",
    "padding:calc(10px + env(safe-area-inset-top)) 16px 10px",
    "font:600 .85rem/1.35 var(--font-sans, system-ui, sans-serif)",
    "text-align:center",
    "color:#fff",
    "transform:translateY(-100%)",
    "transition:transform .25s ease",
    "pointer-events:none",
  ].join(";");
  (document.body || document.documentElement).appendChild(el);
  return el;
}

function afficher(html, couleur) {
  clearTimeout(retraitTimer);
  const el = creer();
  el.hidden = false;
  el.innerHTML = html;
  el.style.background = couleur;
  requestAnimationFrame(() => { el.style.transform = "translateY(0)"; });
}

// Glisse le bandeau hors écran puis le neutralise complètement : sans ce
// second temps, un transform résiduel (réappliqué par un rendu concurrent)
// pourrait le laisser visible.
function masquer(delai = 0) {
  clearTimeout(masquageTimer);
  clearTimeout(retraitTimer);
  masquageTimer = setTimeout(() => {
    const el = document.getElementById(ID);
    if (!el) return;
    el.style.transform = "translateY(-100%)";
    retraitTimer = setTimeout(() => {
      const n = document.getElementById(ID);
      if (n) { n.hidden = true; n.innerHTML = ""; }
    }, DUREE_GLISSADE);
  }, delai);
}

function horsLigne() {
  clearTimeout(masquageTimer);
  clearTimeout(retraitTimer);
  horsLigneActif = true;
  afficher(
    "Vous êtes hors ligne — les montants affichés ne sont plus à jour",
    "#D83A3A",
  );
}

function enLigne() {
  // Rien à confirmer si on n'a jamais signalé de coupure : un événement
  // `online` isolé (ou répété) ne doit pas faire surgir de bandeau.
  if (!horsLigneActif) return;
  horsLigneActif = false;
  afficher("Connexion rétablie", "#0D9250");
  masquer(2600);
}

export function startConnectionBanner() {
  if (typeof window === "undefined") return;
  const init = () => { if (navigator.onLine === false) horsLigne(); };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
  window.addEventListener("offline", horsLigne);
  window.addEventListener("online", enLigne);
}
