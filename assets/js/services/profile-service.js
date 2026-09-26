import { getProfile, getSupabase, getUser, isConfigured } from "./supabase-client.js";
import { mfaService } from "./mfa-service.js";

function isMissingRpc(error, name) {
  const message = String(error?.message || error || "").toLowerCase();
  return error?.code === "PGRST202" || (message.includes(name.toLowerCase()) && message.includes("function"));
}

function mapProfile(row = {}) {
  return {
    id: row.id || null,
    email: row.email || "",
    fullName: row.full_name || "",
    avatarUrl: row.avatar_url || "",
    phone: row.phone || "",
    username: row.username || "",
    birthDate: row.birth_date || "",
    department: row.department || "",
    address: row.address || "",
    role: row.role || "client",
    accountStatus: row.account_status || row.status || "active",
    kycStatus: row.kyc_status || "not_started",
    kycLevel: Number(row.kyc_level || 0),
    kycSubmittedAt: row.kyc_submitted_at || null,
    kycReviewedAt: row.kyc_reviewed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function errorMessage(error) {
  const message = String(error?.message || error || "");
  const known = {
    authentication_required: "Connexion requise.",
    invalid_full_name: "Le nom complet doit contenir entre 2 et 120 caractères.",
    invalid_phone: "Le numéro de téléphone est invalide.",
    phone_taken: "Ce numéro de téléphone est déjà associé à un autre compte FlexiCash.",
    invalid_username: "Le nom d’utilisateur doit contenir 3 à 30 caractères : lettres minuscules, chiffres, point ou underscore.",
    username_taken: "Ce nom d’utilisateur est déjà utilisé.",
    invalid_birth_date: "La date de naissance est invalide.",
    department_too_long: "Le département est trop long.",
    address_too_long: "L’adresse est trop longue.",
    address_required: "L’adresse est requise.",
    underage: "Vous devez avoir au moins 16 ans pour utiliser FlexiCash.",
    profile_not_provisioned: "Votre profil n’est pas encore disponible. Reconnectez-vous.",
    profile_not_active: "Votre compte est actuellement suspendu et ne peut pas être modifié.",
    device_session_inactive: "Cet appareil a été déconnecté. Reconnectez-vous depuis votre appareil actuel.",
    account_recovery_pending: "Le profil est temporairement protégé pendant la récupération du compte.",
    mfa_required: "Une vérification à deux facteurs est requise pour modifier le numéro.",
    mfa_factor_required: "Configurez une application Authenticator pour modifier le numéro.",
  };
  const key = Object.keys(known).find((item) => message.includes(item));
  return known[key] || "Le profil n’a pas pu être enregistré.";
}

async function rpc(name, args = {}) {
  const sb = await getSupabase();
  if (!sb) return { state: "error", network: true, error: new Error("supabase_unavailable") };
  try {
    const { data, error } = await sb.rpc(name, args);
    if (error) return { state: "error", error };
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { state: "ok", data: row } : { state: "empty" };
  } catch (error) {
    return { state: "error", error, network: true };
  }
}

export const profileService = {
  async fetch() {
    if (!isConfigured()) return { state: "error", error: "backend_unavailable" };
    const result = await rpc("get_my_profile");
    if (result.state === "ok") return { state: "ok", data: mapProfile(result.data), source: "supabase" };
    // COMPATIBILITÉ RPC — pas une simulation. Si `get_my_profile` n'existe pas
    // encore, on relit le profil RÉEL par `getProfile()` (table Supabase
    // owner-scoped). Source honnêtement étiquetée "legacy", jamais "supabase".
    if (isMissingRpc(result.error, "get_my_profile")) {
      const legacy = await getProfile();
      return legacy.data ? { state: "ok", data: mapProfile(legacy.data), source: "legacy" } : { state: "error", error: legacy.error };
    }
    return result;
  },

  async update(values) {
    if (!isConfigured()) return { ok: false, error: "backend_unavailable" };
    const result = await rpc("update_my_profile", {
      p_full_name: values.fullName,
      p_phone: values.phone || null,
      p_username: values.username || null,
      p_birth_date: values.birthDate || null,
      p_department: values.department || null,
      p_address: values.address || null,
    });
    if (result.state === "ok") return { ok: true, data: mapProfile(result.data), source: "supabase" };
    const rawMessage = String(result.error?.message || result.error || "");
    if (rawMessage.includes("mfa_required") || rawMessage.includes("mfa_factor_required")) {
      mfaService.redirect({ reason: "phone_change" });
      return { ok: false, error: errorMessage(result.error), mfaRequired: true };
    }
    if (isMissingRpc(result.error, "update_my_profile")) {
      const sb = await getSupabase();
      const user = await getUser();
      if (!sb || !user) return { ok: false, error: "Connexion requise." };
      const { data, error } = await sb.from("profiles")
        .update({ full_name: values.fullName || null, phone: values.phone || null })
        .eq("id", user.id)
        .select("id,email,full_name,avatar_url,phone,role,status")
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: mapProfile(data), source: "legacy" };
    }
    return { ok: false, error: errorMessage(result.error) };
  },

  async syncVerifiedPhone() {
    if (!isConfigured()) return { ok: false, error: "backend_unavailable" };
    const result = await rpc("sync_my_verified_phone");
    if (result.state === "ok") return { ok: true, data: mapProfile(result.data), source: "supabase" };
    // No fallback: RPC must exist and succeed. Treat missing RPC as unavailable.
    if (isMissingRpc(result.error, "sync_my_verified_phone")) {
      return { ok: false, error: "rpc_unavailable" };
    }
    return { ok: false, error: errorMessage(result.error) };
  },

  async saveOnboardingProfile(values) {
    if (!isConfigured()) return { ok: false, error: "backend_unavailable" };
    const result = await rpc("save_my_onboarding_profile", {
      p_full_name: values.fullName,
      p_username: values.username || null,
      p_birth_date: values.birthDate || null,
      p_department: values.department || null,
      p_address: values.address || null,
    });
    if (result.state === "ok") return { ok: true, data: mapProfile(result.data), source: "supabase" };
    if (isMissingRpc(result.error, "save_my_onboarding_profile")) {
      const sb = await getSupabase();
      const user = await getUser();
      if (!sb || !user) return { ok: false, error: "Connexion requise." };
      const { data, error } = await sb.from("profiles")
        .update({
          full_name: values.fullName || null,
          username: values.username || null,
          birth_date: values.birthDate || null,
          department: values.department || null,
          address: values.address || null,
        })
        .eq("id", user.id)
        .select("id,email,full_name,avatar_url,phone,username,birth_date,department,address,role,status")
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: mapProfile(data), source: "legacy" };
    }
    return { ok: false, error: errorMessage(result.error) };
  },

  // Profil minimal (modèle Basic) : nom complet + téléphone uniquement.
  // Utilisé par onboarding/profile.html quand account_status='incomplete_profile'.
  // Ne remplace pas saveOnboardingProfile (édition complète username/date de
  // naissance/adresse), toujours disponible séparément pour le profil/KYC.
  async saveBasicOnboardingProfile({ fullName, phone }) {
    if (!isConfigured()) return { ok: false, error: "backend_unavailable" };
    const result = await rpc("save_my_basic_onboarding_profile", {
      p_full_name: fullName,
      p_phone: phone,
    });
    if (result.state === "ok") return { ok: true, data: mapProfile(result.data), source: "supabase" };
    return { ok: false, error: errorMessage(result.error) };
  },
};
