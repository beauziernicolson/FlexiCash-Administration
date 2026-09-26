// Hydrate <i data-lucide="..."> placeholders into real Lucide SVG icons.
// window.lucide is a classic <script> global (assets/vendor/lucide/lucide.min.js),
// loaded before any module script runs — see the <script> tag added to each page's <head>.
const ICON_ATTRS = { width: 20, height: 20, "stroke-width": 1.8 };

export function refreshLucideIcons(root = document) {
  if (!window.lucide || typeof window.lucide.createIcons !== "function") return;
  window.lucide.createIcons({
    icons: window.lucide.icons,
    nameAttr: "data-lucide",
    attrs: ICON_ATTRS,
    root,
  });
}

window.refreshLucideIcons = refreshLucideIcons;

// Safety net: pages in this codebase render via direct `el.innerHTML = ...`
// in many places outside mount(). Rather than wiring a manual refresh call
// after every such call-site, watch the DOM and hydrate any [data-lucide]
// placeholder as soon as it appears.
let observing = false;
export function startLucideAutoHydration() {
  if (observing || typeof MutationObserver === "undefined") return;
  observing = true;
  const PLACEHOLDER = ":not(svg)[data-lucide]";
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        // Lucide's createIcons() replaces each placeholder with an <svg> that
        // ALSO carries data-lucide (for CSS targeting) — without the ":not(svg)"
        // exclusion, hydrating a node re-triggers this same observer forever
        // (infinite replace loop, freezes the tab).
        if (node.matches?.(PLACEHOLDER) || node.querySelector?.(PLACEHOLDER)) {
          refreshLucideIcons(node.parentNode || document);
        }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
