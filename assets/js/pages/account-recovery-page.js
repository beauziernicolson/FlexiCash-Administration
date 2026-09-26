import { mount, renderClientSidebar, renderTopbar, renderBottomNav, toast, modal } from "../components.js";
import { fmtDateTime } from "../formatters.js";
import { accountRecoveryService } from "../services/account-recovery-service.js";
import { securityService } from "../services/security-service.js";
import { getUnreadNotificationCount, prepareClientUiState, refreshNotificationBadges, refreshAccountFreezeBanner } from "../services/client-ui-service.js";
import "../app.js";

await prepareClientUiState();
mount("#sidebar-mount", renderClientSidebar("account-recovery"));
mount("#topbar-mount", renderTopbar({ unread: getUnreadNotificationCount() }));
mount("#bottomnav", renderBottomNav("profile"));
refreshNotificationBadges();
refreshAccountFreezeBanner();

const root = document.querySelector(".page");
const requestedType = new URLSearchParams(location.search).get("type");
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const statusLabels = {
  draft: "À compléter",
  submitted: "Envoyée",
  under_review: "En cours d’examen",
  second_review_required: "Deuxième vérification",
  completed: "Terminée",
  rejected: "Refusée",
  cancelled: "Annulée",
};
const typeLabels = {
  forgot_pin: "PIN oublié",
  lost_phone: "Téléphone perdu ou volé",
  change_phone_no_access: "Changer un numéro inaccessible",
  account_compromised: "Compte possiblement compromis",
  unfreeze_account: "Demander le dégel du compte",
  other: "Autre problème d’accès",
};
const evidenceLabels = {
  selfie: "Selfie récent",
  identity_document: "Pièce d’identité",
  proof_of_phone: "Preuve liée au nouveau numéro",
  other: "Autre justificatif",
};
const statusClass = (status) => status === "completed" ? "badge-success" : status === "rejected" ? "badge-danger" : status === "cancelled" ? "badge-info" : "badge-warning";

function header() {
  return `<div class="page-head"><div><h1>Récupération de compte</h1><p class="muted">Téléphone perdu, PIN oublié ou numéro inaccessible : récupérez le même compte FlexiCash sans recréer un portefeuille.</p></div><a class="btn btn-ghost" href="security.html">Retour à la sécurité</a></div>`;
}

function requestForm(previous = null) {
  return `${header()}
    ${previous ? `<div class="alert mb-16"><strong>Dernière demande : ${esc(statusLabels[previous.status] || previous.status)}</strong><p class="mt-8">Vous pouvez ouvrir une nouvelle demande si le problème n’est pas résolu.</p></div>` : ""}
    <section class="card">
      <div class="alert alert-warning mb-16"><strong>Important</strong><p class="mt-8">FlexiCash récupère votre ancien compte. Ne créez pas un deuxième compte pour relier le même MonCash, NatCash, PayPal ou compte bancaire.</p></div>
      <form id="recovery-form" class="stack" style="--gap:16px">
        <label class="field"><span>Quel est le problème ?</span>
          <select class="select" id="recovery-type" required>
            <option value="forgot_pin">J’ai oublié mon PIN</option>
            <option value="lost_phone">J’ai perdu ou changé de téléphone</option>
            <option value="change_phone_no_access">Je n’ai plus accès à mon ancien numéro</option>
            <option value="account_compromised">Je pense que mon compte a été compromis</option>
            <option value="unfreeze_account">Mon compte est gelé et je demande le dégel</option>
            <option value="other">Autre problème d’accès</option>
          </select>
        </label>
        <label class="field" id="new-phone-field" hidden><span>Nouveau numéro</span><input class="input" id="new-phone" inputmode="tel" placeholder="+509 ..."></label>
        <label class="field"><span>Expliquez brièvement la situation</span><textarea class="textarea" id="recovery-reason" rows="5" minlength="10" maxlength="1000" required placeholder="Exemple : mon ancien téléphone a été volé et je souhaite sécuriser mon compte sur ce nouvel appareil."></textarea></label>
        <div class="alert"><strong>Ce qui se passera</strong><p class="mt-8">Les opérations financières seront temporairement protégées pendant l’examen. Après validation, les anciens appareils peuvent être déconnectés et un nouveau PIN pourra être créé.</p></div>
        <button class="btn btn-primary" type="submit">Commencer la récupération</button>
      </form>
    </section>`;
}

function draftView(data) {
  const request = data.request;
  const required = Array.isArray(data.required_evidence) ? data.required_evidence : [];
  const uploaded = new Set((data.evidence || []).map((item) => item.kind));
  const fields = required.map((kind) => `<label class="field"><span>${esc(evidenceLabels[kind] || kind)} ${uploaded.has(kind) ? "✓" : ""}</span><input class="input" type="file" id="file-${esc(kind)}" accept="${kind === "selfie" ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"}" ${uploaded.has(kind) ? "" : "required"}></label>`).join("");
  return `${header()}
    <section class="card">
      <div class="row between" style="gap:12px;align-items:flex-start"><div><span class="badge ${statusClass(request.status)}">${esc(statusLabels[request.status])}</span><h2 class="mt-12">${esc(typeLabels[request.request_type] || request.request_type)}</h2><p class="muted mt-8">Créée le ${fmtDateTime(request.created_at)}</p></div><button class="btn btn-ghost sm" id="cancel-recovery">Annuler</button></div>
      <p class="mt-16">${esc(request.reason)}</p>
      ${request.new_phone ? `<div class="alert mt-16"><strong>Nouveau numéro demandé</strong><p class="mt-8 mono">${esc(request.new_phone)}</p></div>` : ""}
    </section>
    <section class="card mt-24">
      <h2>Justificatifs</h2>
      ${required.length ? `<p class="muted mt-8">Ces fichiers sont privés et visibles uniquement par l’équipe autorisée.</p><form id="evidence-form" class="stack mt-16" style="--gap:14px">${fields}<button class="btn btn-primary" type="submit">Téléverser et envoyer la demande</button></form>` : `<div class="alert mt-16"><strong>Aucun document supplémentaire requis</strong><p class="mt-8">Cet appareil est déjà reconnu. Vous pouvez transmettre la demande directement.</p></div><button class="btn btn-primary mt-16" id="submit-recovery">Envoyer la demande</button>`}
    </section>`;
}

function progressView(data) {
  const request = data.request;
  const messages = {
    submitted: "La demande attend sa prise en charge par l’assistance.",
    under_review: "Un membre de l’équipe vérifie actuellement votre dossier.",
    second_review_required: "Une deuxième personne doit confirmer la récupération pour protéger le compte.",
    completed: request.request_type === "unfreeze_account" ? "Le dégel a été validé. Le compte est de nouveau utilisable, avec une protection renforcée de 24 heures sur les grosses opérations." : request.requested_actions?.reset_pin ? "Votre identité a été validée. Créez maintenant un nouveau PIN depuis la page Sécurité." : "La récupération a été validée. Les grosses opérations restent protégées pendant 24 heures.",
    rejected: "La demande n’a pas pu être validée. Consultez la note de l’assistance ci-dessous.",
    cancelled: "Cette demande a été annulée.",
  };
  return `${header()}
    <section class="card">
      <div class="row between" style="gap:12px;align-items:flex-start"><div><span class="badge ${statusClass(request.status)}">${esc(statusLabels[request.status] || request.status)}</span><h2 class="mt-12">${esc(typeLabels[request.request_type] || request.request_type)}</h2></div><small>${fmtDateTime(request.updated_at || request.created_at)}</small></div>
      <div class="alert mt-16"><strong>${esc(messages[request.status] || "Demande enregistrée.")}</strong>${request.protection_until ? `<p class="mt-8">Protection renforcée jusqu’au ${fmtDateTime(request.protection_until)}.</p>` : ""}</div>
      ${request.review_note ? `<div class="mt-16"><strong>Note de l’assistance</strong><p class="muted mt-8">${esc(request.review_note)}</p></div>` : ""}
      <div class="row gap-8 mt-20" style="flex-wrap:wrap">
        ${request.status === "completed" ? '<a class="btn btn-primary" href="security.html">Créer ou vérifier mon PIN</a>' : ""}
        ${["submitted"].includes(request.status) ? '<button class="btn btn-ghost" id="cancel-recovery">Annuler la demande</button>' : ""}
        ${["rejected", "cancelled", "completed"].includes(request.status) ? '<button class="btn btn-ghost" id="new-recovery">Nouvelle demande</button>' : ""}
        <a class="btn btn-ghost" href="support.html">Contacter le support</a>
      </div>
    </section>`;
}

async function load() {
  root.innerHTML = `${header()}<section class="card"><p class="muted">Chargement de votre situation…</p></section>`;
  const registration = await securityService.registerCurrent();
  if (!registration.ok || registration.revoked) {
    root.innerHTML = `${header()}<section class="card"><div class="alert alert-danger"><strong>Appareil non autorisé</strong><p class="mt-8">Reconnectez-vous pour lancer une récupération depuis cet appareil.</p></div></section>`;
    return;
  }
  const result = await accountRecoveryService.getCurrent();
  if (!result.ok) {
    root.innerHTML = `${header()}<section class="card"><div class="alert alert-danger"><strong>Service indisponible</strong><p class="mt-8">${esc(result.error)}</p></div></section>`;
    return;
  }
  const data = result.data || {};
  const request = data.request;
  if (!request) root.innerHTML = requestForm();
  else if (request.status === "draft") root.innerHTML = draftView(data);
  else root.innerHTML = progressView(data);
  bind(data);
}

function bind(data) {
  const type = root.querySelector("#recovery-type");
  const phoneField = root.querySelector("#new-phone-field");
  const updatePhoneField = () => { if (phoneField) phoneField.hidden = type?.value !== "change_phone_no_access"; };
  if (type && requestedType && [...type.options].some((option) => option.value === requestedType)) type.value = requestedType;
  type?.addEventListener("change", updatePhoneField);
  updatePhoneField();

  root.querySelector("#recovery-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    if (button) button.disabled = true;
    const result = await accountRecoveryService.createDraft({
      type: type.value,
      newPhone: root.querySelector("#new-phone")?.value.trim() || null,
      reason: root.querySelector("#recovery-reason")?.value.trim(),
      idempotencyKey: crypto.randomUUID(),
    });
    if (button) button.disabled = false;
    if (!result.ok) return toast({ type: "error", title: "Demande impossible", message: result.error });
    toast({ type: "success", title: "Demande préparée", message: "Ajoutez maintenant les justificatifs demandés." });
    await load();
  });

  root.querySelector("#evidence-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const request = data.request;
    const required = Array.isArray(data.required_evidence) ? data.required_evidence : [];
    const already = new Set((data.evidence || []).map((item) => item.kind));
    const button = event.submitter;
    if (button) button.disabled = true;
    for (const kind of required) {
      const file = root.querySelector(`#file-${kind}`)?.files?.[0];
      if (!file && !already.has(kind)) {
        if (button) button.disabled = false;
        return toast({ type: "error", title: "Justificatif requis", message: `Ajoutez : ${evidenceLabels[kind] || kind}.` });
      }
      if (file) {
        const upload = await accountRecoveryService.uploadEvidence({ requestId: request.id, kind, file });
        if (!upload.ok) {
          if (button) button.disabled = false;
          return toast({ type: "error", title: "Téléversement impossible", message: upload.error });
        }
      }
    }
    const submitted = await accountRecoveryService.submit(request.id);
    if (button) button.disabled = false;
    if (!submitted.ok) return toast({ type: "error", title: "Envoi impossible", message: submitted.error });
    toast({ type: "success", title: "Demande envoyée", message: "Les opérations sont protégées pendant la vérification." });
    await load();
  });

  root.querySelector("#submit-recovery")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    const submitted = await accountRecoveryService.submit(data.request.id);
    event.currentTarget.disabled = false;
    if (!submitted.ok) return toast({ type: "error", title: "Envoi impossible", message: submitted.error });
    toast({ type: "success", title: "Demande envoyée" });
    await load();
  });

  root.querySelector("#cancel-recovery")?.addEventListener("click", () => modal({
    title: "Annuler la demande ?",
    body: "La protection temporaire sera retirée. Les appareils déjà déconnectés ne seront pas automatiquement reconnectés.",
    confirm: "Annuler la demande",
    onConfirm: async () => {
      const output = await accountRecoveryService.cancel(data.request.id);
      if (!output.ok) {
        toast({ type: "error", title: "Annulation impossible", message: output.error });
        return false;
      }
      await load();
      return true;
    },
  }));

  root.querySelector("#new-recovery")?.addEventListener("click", () => {
    root.innerHTML = requestForm(data.request);
    bind({ request: null });
  });
}

load();
