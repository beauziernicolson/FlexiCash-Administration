import { getSupabase } from "./supabase-client.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const ERROR_MESSAGES = {
  authentication_required: "Votre session a expiré. Reconnectez-vous.",
  auth_session_binding_unavailable: "Reconnectez-vous avant de lancer la récupération.",
  device_session_inactive: "Cet appareil n’est plus autorisé.",
  account_recovery_device_mismatch: "Continuez la récupération depuis le nouvel appareil utilisé pour ouvrir la demande.",
  invalid_recovery_type: "Choisissez une situation de récupération valide.",
  invalid_recovery_reason: "Expliquez la situation en au moins 10 caractères.",
  new_phone_required: "Saisissez le nouveau numéro de téléphone.",
  phone_already_used: "Ce numéro est déjà associé à un autre compte FlexiCash.",
  account_recovery_already_active: "Une demande de récupération est déjà en cours.",
  account_recovery_not_found: "Cette demande de récupération est introuvable.",
  account_recovery_not_editable: "Cette demande ne peut plus être modifiée.",
  account_recovery_not_submittable: "Cette demande ne peut pas être envoyée dans son état actuel.",
  account_recovery_evidence_required: "Ajoutez les justificatifs demandés avant l’envoi.",
  invalid_recovery_evidence_file: "Fichier invalide. Utilisez une image ou un PDF de 5 Mo maximum.",
  invalid_recovery_storage_path: "Le chemin du justificatif est invalide.",
  recovery_storage_object_not_found: "Le justificatif téléversé est introuvable.",
  recovery_storage_mime_mismatch: "Le type réel du justificatif ne correspond pas au fichier.",
  recovery_storage_size_mismatch: "La taille du justificatif ne correspond pas au fichier.",
  account_recovery_not_cancellable: "Cette demande ne peut plus être annulée.",
  idempotency_key_conflict: "Cette demande a déjà été utilisée avec d’autres informations.",
  account_not_frozen: "Ce compte n’est pas gelé.",
};

function mapError(error) {
  const raw = String(error?.message || error || "Erreur inconnue");
  const key = Object.keys(ERROR_MESSAGES).find((code) => raw.includes(code));
  return { code: key || null, message: key ? ERROR_MESSAGES[key] : raw };
}

async function rpc(name, args = {}) {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: "Connexion au service FlexiCash indisponible." };
  const { data, error } = await sb.rpc(name, args);
  if (!error) return { ok: true, data };
  const mapped = mapError(error);
  return { ok: false, error: mapped.message, errorCode: mapped.code, rawError: error };
}

function extensionFor(file) {
  const fromName = (String(file?.name || "").split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName) return fromName;
  if (file?.type === "image/png") return "png";
  if (file?.type === "image/webp") return "webp";
  if (file?.type === "application/pdf") return "pdf";
  return "jpg";
}

function validateFile(kind, file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return "Le fichier doit être inférieur à 5 Mo.";
  }
  if (!ALLOWED_TYPES.has(file.type)) return "Format non accepté. Utilisez JPG, PNG, WebP ou PDF.";
  if (kind === "selfie" && !IMAGE_TYPES.has(file.type)) return "Le selfie doit être une image.";
  return null;
}

export const accountRecoveryService = {
  async getCurrent() {
    return rpc("get_my_account_recovery");
  },

  async createDraft({ type, newPhone = null, reason, idempotencyKey }) {
    return rpc("create_my_account_recovery_draft", {
      p_request_type: type,
      p_new_phone: newPhone || null,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
  },

  async uploadEvidence({ requestId, kind, file }) {
    const invalid = validateFile(kind, file);
    if (invalid) return { ok: false, error: invalid };
    const sb = await getSupabase();
    if (!sb) return { ok: false, error: "Connexion au service FlexiCash indisponible." };
    const { data: userData, error: userError } = await sb.auth.getUser();
    const user = userData?.user;
    if (userError || !user) return { ok: false, error: "Connexion requise." };

    const path = `${user.id}/${requestId}/${kind}-${crypto.randomUUID()}.${extensionFor(file)}`;
    const upload = await sb.storage.from("account-recovery").upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: "0",
    });
    if (upload.error) return { ok: false, error: upload.error.message };

    const registration = await rpc("register_my_account_recovery_evidence", {
      p_request_id: requestId,
      p_kind: kind,
      p_storage_path: path,
      p_mime_type: file.type,
      p_size_bytes: file.size,
    });
    if (!registration.ok) {
      await sb.storage.from("account-recovery").remove([path]);
      return registration;
    }
    return { ok: true, data: registration.data, path };
  },

  async submit(requestId) {
    return rpc("submit_my_account_recovery", { p_request_id: requestId });
  },

  async cancel(requestId) {
    return rpc("cancel_my_account_recovery", { p_request_id: requestId });
  },
};
