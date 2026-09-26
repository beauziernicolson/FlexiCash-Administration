// ============================================================================
// FlexiCash — Page de compatibilité de l'ancienne activation
// ----------------------------------------------------------------------------
// L'activation initiale payante n'existe plus : l'inscription ouvre directement
// un Mini Wallet gratuit et actif. Cette page ne demande donc plus aucun
// paiement et n'appelle aucune des anciennes RPC d'activation (désormais
// réservées à `service_role` côté backend).
//
// Elle sert uniquement de redirection pour les anciens liens, favoris,
// notifications et entrées du service worker :
//   * l'état du compte vient de `get_my_account_state` ;
//   * si une demande de passage au Full est ouverte, l'utilisateur est envoyé
//     vers le suivi de cette demande ;
//   * sinon il rejoint la route indiquée par le backend (dashboard).
// ============================================================================

import "../app.js";
import { href } from "../components.js";
import { getMyAccountState, redirectForAccountState } from "../services/account-state-service.js";
import { walletTierService, PROFILE_TYPES, upgradeStatusView } from "../services/wallet-tier-service.js";
import { refreshLucideIcons } from "../services/lucide-service.js";

const panel = document.getElementById("activation-compat-panel");
const messageNode = document.getElementById("activation-compat-message");
const actionsNode = document.getElementById("activation-compat-actions");

function show(message, links = []) {
  if (messageNode) messageNode.textContent = message;
  if (actionsNode) {
    actionsNode.innerHTML = links
      .map((link) => `<a class="btn ${link.primary ? "btn-primary" : "btn-ghost"}" href="${href(link.route)}">${link.label}</a>`)
      .join("");
    actionsNode.hidden = links.length === 0;
  }
  if (panel) refreshLucideIcons(panel);
}

// Première demande de passage au Full encore ouverte, tous profils confondus.
async function openUpgradeProfile() {
  for (const profileType of PROFILE_TYPES) {
    const result = await walletTierService.getFullRequest(profileType);
    const request = result.ok ? result.data : null;
    if (!request?.status) continue;
    if (!upgradeStatusView(request.status).terminal) return profileType;
  }
  return null;
}

async function route() {
  const state = await getMyAccountState();
  if (state.state !== "ok") {
    show("Impossible de vérifier l’état de votre compte pour le moment.", [
      { route: "app/dashboard.html", label: "Aller au tableau de bord", primary: true },
    ]);
    return;
  }

  if (state.data?.state !== "ready") {
    // Suspension, profil incomplet ou session administrateur : le backend sait
    // où envoyer l'utilisateur.
    await redirectForAccountState(state);
    return;
  }

  const profileType = await openUpgradeProfile();
  if (profileType) {
    location.replace(href(`app/wallet-upgrade.html?profile=${profileType}`));
    return;
  }

  await redirectForAccountState(state);
}

route().catch(() => {
  show("Votre portefeuille est déjà ouvert. Aucun paiement d’activation n’est nécessaire.", [
    { route: "app/dashboard.html", label: "Aller au tableau de bord", primary: true },
  ]);
});
