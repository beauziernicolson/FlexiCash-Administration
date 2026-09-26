import { getSupabase, isConfigured } from "./supabase-client.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

const isMissingRpc = (error, name) => {
  const message = String(error?.message || error || "").toLowerCase();
  return error?.code === "PGRST202" || message.includes(name.toLowerCase());
};

const firstRow = (data) => (Array.isArray(data) ? data[0] || null : data || null);

function normalizeMimeType(type) {
  if (type === "image/jpg") return "image/jpeg";
  return type;
}

async function rpc(name, args = {}) {
  const supabase = await getSupabase();
  if (!supabase) {
    return { ok: false, network: true, error: "Connexion Supabase indisponible." };
  }

  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    return {
      ok: false,
      error: error.message,
      rawError: error,
      migrationMissing: isMissingRpc(error, name),
    };
  }
  return { ok: true, data };
}

const mapCase = (row = {}) => ({
  id: row.case_id || null,
  status: row.status || "not_started",
  requestedLevel: Number(row.requested_level || 1),
  approvedLevel: Number(row.approved_level || 0),
  firstName: row.first_name || "",
  lastName: row.last_name || "",
  nationality: row.nationality || "",
  birthDate: row.birth_date || "",
  address: row.address || "",
  city: row.city || "",
  department: row.department || "",
  documentType: row.document_type || "",
  documentNumber: row.document_number || "",
  submittedAt: row.submitted_at || null,
  reviewedAt: row.reviewed_at || null,
  reviewedBy: row.reviewed_by || null,
  reviewStartedAt: row.review_started_at || null,
  reviewNote: row.review_note || "",
  rejectionReason: row.rejection_reason || "",
  revision: Number(row.revision || 1),
  documents: Array.isArray(row.documents) ? row.documents : [],
});

const errorMessage = (error) => {
  const raw = String(error?.message || error || "");
  const rules = {
    authentication_required: "Connexion requise.",
    profile_not_active: "Votre compte doit être actif.",
    invalid_kyc_payload: "Les informations KYC envoyées sont invalides.",
    invalid_kyc_payload_key: "Le formulaire contient un champ non autorisé.",
    invalid_birth_date: "La date de naissance est invalide. Vous devez avoir au moins 16 ans.",
    invalid_first_name: "Le prénom est invalide.",
    invalid_last_name: "Le nom est invalide.",
    invalid_nationality: "La nationalité est invalide.",
    invalid_address: "L’adresse est invalide.",
    invalid_city: "La ville est invalide.",
    invalid_department: "Le département est invalide.",
    invalid_document_type: "Le type de pièce est invalide.",
    invalid_document_number: "Le numéro de la pièce est invalide.",
    unsupported_kyc_level: "Seul le niveau KYC 1 est disponible pour le moment.",
    kyc_case_not_editable: "Ce dossier ne peut plus être modifié.",
    kyc_case_not_found: "Aucun dossier KYC n’a été trouvé.",
    kyc_case_not_submittable: "Ce dossier ne peut pas être soumis dans son état actuel.",
    kyc_profile_incomplete: "Complétez toutes les informations obligatoires.",
    kyc_documents_incomplete: "Ajoutez le recto de la pièce et le selfie.",
    kyc_document_back_required: "Le verso de la pièce est requis.",
    invalid_document_kind: "Le type de document est invalide.",
    invalid_document_file: "Fichier invalide. Formats acceptés : JPEG, PNG ou PDF, 5 Mo maximum.",
    invalid_storage_path: "Le chemin du document est invalide.",
    kyc_storage_object_not_found: "Le fichier téléversé est introuvable dans le stockage sécurisé.",
    kyc_storage_mime_mismatch: "Le type réel du fichier ne correspond pas au fichier envoyé.",
    kyc_storage_size_mismatch: "La taille réelle du fichier ne correspond pas au fichier envoyé.",
    kyc_storage_extension_mismatch: "L’extension du fichier ne correspond pas à son type.",
    duplicate_kyc_document_identity_detected: "Cette pièce d’identité est déjà associée à un autre compte.",
    kyc_document_already_used: "Cette pièce d’identité est déjà associée à un autre compte.",
    forbidden: "Action réservée à un administrateur actif.",
    review_note_required: "Un motif d’au moins 5 caractères est requis.",
    kyc_case_claimed_by_another_admin: "Ce dossier est déjà pris en charge par un autre administrateur.",
    kyc_case_not_reviewable: "Ce dossier ne peut pas être examiné dans son état actuel.",
    invalid_kyc_decision: "La décision KYC est invalide.",
    invalid_kyc_status_filter: "Le filtre de statut est invalide.",
    search_too_long: "La recherche est trop longue.",
  };

  const match = Object.entries(rules).find(([key]) => raw.includes(key));
  return match?.[1] || "Opération KYC indisponible.";
};

function validateFile(kind, file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return "Fichier invalide ou supérieur à 5 Mo.";
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return "Format non autorisé. Utilisez JPEG, PNG ou PDF.";
  }
  if (kind === "selfie" && !IMAGE_MIME_TYPES.has(file.type)) {
    return "Le selfie doit être une image JPEG ou PNG.";
  }

  const extension = (file.name.split(".").pop() || "").toLowerCase();
  const extensionMatches =
    (file.type === "image/jpeg" && ["jpg", "jpeg"].includes(extension)) ||
    (file.type === "image/png" && extension === "png") ||
    (file.type === "application/pdf" && extension === "pdf");
  return extensionMatches ? null : "L’extension du fichier ne correspond pas à son format.";
}

export const kycService = {
  async getMyCase() {
    if (!isConfigured()) {
      return { ok: false, migrationMissing: true, error: "Supabase non configuré." };
    }
    const result = await rpc("get_my_kyc_case");
    return result.ok
      ? { ok: true, data: mapCase(firstRow(result.data) || {}) }
      : { ...result, error: errorMessage(result.rawError || result.error) };
  },

  async saveDraft(payload) {
    const result = await rpc("save_my_kyc_draft", { p_payload: payload });
    return result.ok
      ? { ok: true, data: firstRow(result.data) }
      : { ...result, error: errorMessage(result.rawError || result.error) };
  },

  async uploadDocument({ caseId, kind, file }) {
    const validationError = validateFile(kind, file);
    if (validationError) return { ok: false, error: validationError };

    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: "Connexion indisponible." };

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData?.user;
    if (userError || !user) return { ok: false, error: "Connexion requise." };
    if (!caseId) return { ok: false, error: "Enregistrez d’abord le dossier KYC." };

    const rateCheck = await rpc("check_my_kyc_upload_rate_limit");
    if (!rateCheck.ok) return { ...rateCheck, error: errorMessage(rateCheck.rawError || rateCheck.error) };
    const rateRow = Array.isArray(rateCheck.data) ? rateCheck.data[0] : rateCheck.data;
    if (!rateRow?.allowed) {
      return { ok: false, error: "Trop de tentatives d’envoi. Réessayez dans quelques minutes." };
    }

    const extension = (file.name.split(".").pop() || "jpg")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const path = `${user.id}/${caseId}/${kind}-${crypto.randomUUID()}.${extension}`;

    const contentType = normalizeMimeType(file.type);
    const upload = await supabase.storage
      .from("kyc-documents")
      .upload(path, file, { upsert: false, contentType, cacheControl: "3600" });
    if (upload.error) return { ok: false, error: upload.error.message };

    const registration = await rpc("register_my_kyc_document", {
      p_case_id: caseId,
      p_kind: kind,
      p_storage_path: path,
      p_mime_type: file.type,
      p_size_bytes: file.size,
    });

    if (!registration.ok) {
      await supabase.storage.from("kyc-documents").remove([path]);
      return { ...registration, error: errorMessage(registration.rawError || registration.error) };
    }

    return { ok: true, data: firstRow(registration.data), path };
  },

  async submit() {
    const result = await rpc("submit_my_kyc");
    return result.ok
      ? { ok: true, data: firstRow(result.data) }
      : { ...result, error: errorMessage(result.rawError || result.error) };
  },

  async adminList({ status = null, search = null, limit = 50, offset = 0, missingDocument = null, documentType = null } = {}) {
    const result = await rpc("admin_get_kyc_cases_v4", {
      p_status: status,
      p_search: search,
      p_level: null,
      p_submitted_from: null,
      p_submitted_to: null,
      p_assignment: null,
      p_document_type: documentType,
      p_missing_document: missingDocument,
      p_limit: limit,
      p_offset: offset,
    });
    return result.ok
      ? { ok: true, data: result.data || [] }
      : { ...result, error: errorMessage(result.rawError || result.error) };
  },

  async adminGet(id) {
    if (!id) return { ok: false, error: "Identifiant de dossier manquant." };
    const result = await rpc("admin_get_kyc_case", { p_case_id: id });
    return result.ok
      ? { ok: true, data: firstRow(result.data) }
      : { ...result, error: errorMessage(result.rawError || result.error) };
  },

  async adminStartReview(id) {
    const result = await rpc("admin_start_kyc_review", { p_case_id: id });
    return result.ok
      ? { ok: true, data: firstRow(result.data) }
      : { ...result, error: errorMessage(result.rawError || result.error) };
  },

  async adminReview(id, decision, note = "", level = 1) {
    const result = await rpc("admin_review_kyc_case", {
      p_case_id: id,
      p_decision: decision,
      p_note: note || null,
      p_approved_level: Number(level),
    });
    if (result.ok) {
      try {
        const supabase = await getSupabase();
        if (supabase) {
          const { error } = await supabase.functions.invoke("flexicash-kyc-email-dispatch", { body: { limit: 10 } });
          if (error) console.warn("[FlexiCash] E-mail KYC en attente :", error.message || error);
        }
      } catch (error) {
        console.warn("[FlexiCash] E-mail KYC en attente :", error);
      }
      return { ok: true, data: firstRow(result.data) };
    }
    return { ...result, error: errorMessage(result.rawError || result.error) };
  },

  async signedDocumentUrl(path, expires = 180) {
    if (!path) return { ok: false, error: "Chemin du document manquant." };
    const supabase = await getSupabase();
    if (!supabase) return { ok: false, error: "Connexion indisponible." };
    const safeExpiry = Math.max(60, Math.min(Number(expires) || 180, 300));
    const { data, error } = await supabase.storage
      .from("kyc-documents")
      .createSignedUrl(path, safeExpiry);
    return error ? { ok: false, error: error.message } : { ok: true, url: data.signedUrl };
  },
};
