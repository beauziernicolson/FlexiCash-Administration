import "../app.js";
import { toast } from "../components.js";
import { kycService } from "../services/kyc-service.js";

const icon = document.getElementById("status-icon");
const title = document.getElementById("status-title");
const message = document.getElementById("status-message");
const badge = document.getElementById("status-badge");
const actions = document.getElementById("status-actions");
const refresh = document.getElementById("refresh-status");
const submittedRow = document.getElementById("submitted-row");
const reviewedRow = document.getElementById("reviewed-row");
const submittedAt = document.getElementById("submitted-at");
const reviewedAt = document.getElementById("reviewed-at");
const reviewNote = document.getElementById("review-note");
let loading = false;
let poller = null;

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("fr-HT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "—";

const CONFIG = {
  submitted: {
    symbol: '<i data-lucide="clock" aria-hidden="true"></i>', title: "Vérification en attente", badge: "Dossier soumis",
    message: "Votre dossier a bien été enregistré. Aucune information ne vous sera redemandée pendant l’examen.",
  },
  under_review: {
    symbol: '<i data-lucide="search" aria-hidden="true"></i>', title: "Dossier en cours d’examen", badge: "En cours d’examen",
    message: "Un membre de l’équipe vérifie actuellement votre dossier. Vous pouvez vous déconnecter sans perdre votre progression.",
  },
  changes_requested: {
    symbol: '<i data-lucide="pencil" aria-hidden="true"></i>', title: "Informations à corriger", badge: "Correction demandée",
    message: "Des informations ou documents doivent être corrigés avant une nouvelle soumission.", action: ["Corriger mon dossier", "kyc.html"],
  },
  rejected: {
    symbol: '<i data-lucide="circle-x" aria-hidden="true"></i>', title: "Vérification refusée", badge: "Refusé",
    message: "Votre dossier n’a pas été accepté. Consultez le motif, corrigez les informations autorisées puis soumettez-le à nouveau.", action: ["Mettre à jour mon dossier", "kyc.html"],
  },
  expired: {
    symbol: '<i data-lucide="rotate-cw" aria-hidden="true"></i>', title: "Vérification expirée", badge: "À renouveler",
    message: "La vérification doit être renouvelée avant de continuer.", action: ["Renouveler la vérification", "kyc.html"],
  },
  approved: {
    symbol: '<i data-lucide="check" aria-hidden="true"></i>', title: "Identité vérifiée", badge: "Vérifié",
    message: "Votre identité a été vérifiée. Vos limites d’envoi, de dépôt et de retrait sont augmentées.",
  },
};

function setAction(config) {
  actions.querySelectorAll("a[data-status-action]").forEach((node) => node.remove());
  if (!config?.action) return;
  const link = document.createElement("a");
  link.dataset.statusAction = "1";
  link.className = "btn btn-primary";
  link.href = config.action[1];
  link.textContent = config.action[0];
  actions.appendChild(link);
}

function renderCase(data) {
  const config = CONFIG[data.status] || CONFIG.submitted;
  icon.innerHTML = config.symbol;
  title.textContent = config.title;
  message.textContent = config.message;
  badge.textContent = config.badge;
  setAction(config);

  submittedRow.hidden = !data.submittedAt;
  reviewedRow.hidden = !data.reviewedAt;
  submittedAt.textContent = formatDate(data.submittedAt);
  reviewedAt.textContent = formatDate(data.reviewedAt);
  const note = data.rejectionReason || data.reviewNote || "";
  reviewNote.hidden = !note;
  reviewNote.textContent = note ? `Message de l’équipe : ${note}` : "";
}

async function loadStatus({ quiet = false } = {}) {
  if (loading) return;
  loading = true;
  refresh.disabled = true;
  try {
    const result = await kycService.getMyCase();
    if (!result.ok || !result.data?.id) throw new Error(result.error || "kyc_case_unavailable");
    renderCase(result.data);
    if (!quiet) toast({ type: "success", title: "Statut actualisé", message: "Les informations affichées viennent du serveur." });
  } catch (error) {
    console.error("[FlexiCash] Statut KYC :", error);
    if (!quiet) toast({ type: "error", title: "Statut indisponible", message: "Vérifiez votre connexion et réessayez." });
  } finally {
    loading = false;
    refresh.disabled = false;
  }
}

refresh.addEventListener("click", () => loadStatus());
window.addEventListener("pagehide", () => clearInterval(poller));
loadStatus({ quiet: true });
poller = setInterval(() => loadStatus({ quiet: true }), 30000);
