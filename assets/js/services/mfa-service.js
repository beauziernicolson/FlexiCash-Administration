import { getProfile, getSession, getSupabase, isConfigured } from "./supabase-client.js";
import { href } from "../components.js";

const MFA_REASON_KEY = "fx.mfa.reason";
const MFA_NEXT_KEY = "fx.mfa.next";

const reasonLabels = Object.freeze({
  admin_access: "Accès à l’administration",
  login: "Connexion protégée",
  large_transaction: "Transaction importante",
  pin_change: "Modification du PIN",
  phone_change: "Modification du numéro",
  payment_method_change: "Modification d’un moyen de paiement",
  password_change: "Modification du mot de passe",
  email_change: "Modification de l’adresse e-mail",
  revoke_other_devices: "Déconnexion des autres appareils",
  factor_removal: "Suppression d’un deuxième facteur",
  sensitive_action: "Action sensible",
});

function safeRoute(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 1000 || raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch {}
  if (decoded.includes("..") || decoded.includes("\\") || decoded.includes("\0")) return null;
  const route = decoded.replace(/^\/+/, "");
  if (!/^(app|account|admin|onboarding)\/[a-z0-9._/-]+\.html([?#][^\s]*)?$/i.test(route)) return null;
  return route;
}

function currentPrivateRoute() {
  const parts = location.pathname.split("/").filter(Boolean);
  const route = parts.slice(-2).join("/");
  return safeRoute(`${route}${location.search || ""}${location.hash || ""}`);
}

function normalizeFactors(data = {}) {
  const all = Array.isArray(data.all)
    ? data.all
    : [...(Array.isArray(data.totp) ? data.totp : []), ...(Array.isArray(data.phone) ? data.phone : [])];
  const seen = new Set();
  return all.filter((factor) => {
    if (!factor?.id || seen.has(factor.id)) return false;
    seen.add(factor.id);
    return true;
  }).map((factor) => ({
    id: factor.id,
    type: factor.factor_type || factor.factorType || factor.type || "totp",
    status: factor.status || "verified",
    friendlyName: factor.friendly_name || factor.friendlyName || "Application Authenticator",
    createdAt: factor.created_at || factor.createdAt || null,
    updatedAt: factor.updated_at || factor.updatedAt || null,
  }));
}

function errorText(error) {
  const code = String(error?.code || error?.name || "").trim().toLowerCase();
  const message = String(error?.message || error || "");
  const known = {
    mfa_required: "Une vérification à deux facteurs est requise.",
    mfa_factor_required: "Configurez une application Authenticator pour continuer.",
    admin_last_mfa_factor_required: "Un administrateur doit conserver au moins un facteur vérifié.",
    insufficient_aal: "La session doit être renforcée avec votre deuxième facteur.",
    mfa_verification_failed: "Le code ne correspond pas à ce facteur. Vérifiez l’heure automatique du téléphone et utilisez le code du dernier QR affiché.",
    mfa_challenge_expired: "Le délai de vérification a expiré. Attendez le prochain code puis réessayez.",
    mfa_factor_not_found: "Ce facteur n’existe plus. Recommencez la configuration avec un nouveau QR.",
    mfa_ip_address_mismatch: "Le réseau a changé pendant la configuration. Désactivez le VPN et recommencez sans changer de Wi‑Fi ou de connexion.",
    mfa_factor_name_conflict: "Un facteur portant ce nom existe déjà. Recommencez avec un autre nom.",
    too_many_enrolled_mfa_factors: "Le nombre maximal de facteurs est atteint.",
    mfa_totp_verify_not_enabled: "La vérification Authenticator est désactivée dans Supabase.",
    mfa_totp_enroll_not_enabled: "L’enrôlement Authenticator est désactivé dans Supabase.",
    invalid_totp: "Le code est invalide ou expiré.",
    challenge_expired: "Le défi a expiré. Saisissez un nouveau code.",
    factor_not_found: "Ce facteur d’authentification est introuvable.",
    too_many_factors: "Le nombre maximal de facteurs est atteint.",
  };
  if (known[code]) return known[code];
  const lower = message.toLowerCase();
  const key = Object.keys(known).find((item) => lower.includes(item));
  return known[key] || message || "La vérification à deux facteurs a échoué.";
}

function authErrorCode(error) {
  return String(error?.code || error?.name || "").trim().toLowerCase() || null;
}

async function rpc(name, args = {}) {
  const sb = await getSupabase();
  if (!sb) return { ok: false, error: "Connexion sécurisée indisponible." };
  const { data, error } = await sb.rpc(name, args);
  return error ? { ok: false, error: errorText(error), rawError: error } : { ok: true, data };
}

export const mfaService = {
  reasonLabels,
  errorText,
  safeRoute,
  currentPrivateRoute,

  async status() {
    if (!isConfigured()) return { ok: false, error: "backend_unavailable" };
    const sb = await getSupabase();
    if (!sb) return { ok: false, error: "Connexion sécurisée indisponible." };
    const [aalResult, factorsResult, policyResult] = await Promise.all([
      sb.auth.mfa.getAuthenticatorAssuranceLevel(),
      sb.auth.mfa.listFactors(),
      sb.rpc("get_my_mfa_policy"),
    ]);
    if (aalResult.error) return { ok: false, error: errorText(aalResult.error), rawError: aalResult.error };
    if (factorsResult.error) return { ok: false, error: errorText(factorsResult.error), rawError: factorsResult.error };
    const factors = normalizeFactors(factorsResult.data || {});
    const verified = factors.filter((factor) => factor.status === "verified");
    const unverified = factors.filter((factor) => factor.status !== "verified");
    const policy = Array.isArray(policyResult.data) ? policyResult.data[0] : (policyResult.data || {});
    return {
      ok: true,
      data: {
        currentLevel: aalResult.data?.currentLevel || aalResult.data?.current_level || policy.current_aal || "aal1",
        nextLevel: aalResult.data?.nextLevel || aalResult.data?.next_level || (verified.length ? "aal2" : "aal1"),
        factors,
        verifiedFactors: verified,
        unverifiedFactors: unverified,
        policy,
      },
    };
  },

  async needsChallenge(profile = null) {
    const status = await this.status();
    if (!status.ok) return { ok: false, error: status.error };
    const role = profile?.role || status.data.policy?.role || "client";
    const current = status.data.currentLevel;
    const hasFactor = status.data.verifiedFactors.length > 0;
    if (role === "admin" && status.data.policy?.admin_mfa_exempt === true) {
      return { ok: true, required: false, setupRequired: false, status: status.data };
    }
    return {
      ok: true,
      required: current !== "aal2" && (role === "admin" || hasFactor || status.data.nextLevel === "aal2"),
      setupRequired: current !== "aal2" && role === "admin" && !hasFactor,
      status: status.data,
    };
  },

  buildUrl({ reason = "sensitive_action", next = null, mode = null } = {}) {
    const params = new URLSearchParams();
    const safeNext = safeRoute(next || currentPrivateRoute());
    if (safeNext) params.set("next", safeNext);
    if (reason) params.set("reason", reason);
    if (mode) params.set("mode", mode);
    return `${href("auth/mfa.html")}${params.toString() ? `?${params}` : ""}`;
  },

  redirect({ reason = "sensitive_action", next = null, mode = null } = {}) {
    const safeNext = safeRoute(next || currentPrivateRoute());
    try {
      sessionStorage.setItem(MFA_REASON_KEY, reason);
      if (safeNext) sessionStorage.setItem(MFA_NEXT_KEY, safeNext);
    } catch {}
    location.assign(this.buildUrl({ reason, next: safeNext, mode }));
    return { ok: false, required: true };
  },

  async ensureAal2({ reason = "sensitive_action", next = null } = {}) {
    const status = await this.status();
    if (!status.ok) return status;
    if (status.data.policy?.admin_mfa_exempt === true) return { ok: true, data: status.data };
    if (status.data.currentLevel === "aal2") return { ok: true, data: status.data };
    return this.redirect({ reason, next });
  },

  async redirectAfterPrimaryAuth(profile = null) {
    const result = await this.needsChallenge(profile);
    if (!result.ok || !result.required) return { ok: true, required: false };
    this.redirect({ reason: profile?.role === "admin" ? "admin_access" : "login", next: null });
    return { ok: true, required: true };
  },

  async clearUnverifiedFactors() {
    const sb = await getSupabase();
    if (!sb) return { ok: false, error: "Connexion sécurisée indisponible." };
    const { data, error } = await sb.auth.mfa.listFactors();
    if (error) return { ok: false, error: errorText(error), rawError: error, errorCode: authErrorCode(error) };
    const pending = normalizeFactors(data || {}).filter((factor) => factor.status !== "verified");
    const failures = [];
    for (const factor of pending) {
      const result = await sb.auth.mfa.unenroll({ factorId: factor.id });
      if (result.error && authErrorCode(result.error) !== "mfa_factor_not_found") failures.push(result.error);
    }
    return failures.length
      ? { ok: false, error: errorText(failures[0]), rawError: failures[0], errorCode: authErrorCode(failures[0]) }
      : { ok: true, removed: pending.length };
  },

  async enrollTotp(friendlyName = "FlexiCash Authenticator") {
    const sb = await getSupabase();
    if (!sb) return { ok: false, error: "Connexion sécurisée indisponible." };
    const cleanup = await this.clearUnverifiedFactors();
    if (!cleanup.ok) return cleanup;
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: String(friendlyName || "").trim().slice(0, 120) || "FlexiCash Authenticator" });
    if (error) return { ok: false, error: errorText(error), rawError: error, errorCode: authErrorCode(error) };
    return { ok: true, data };
  },

  async verify(factorId, code) {
    const sb = await getSupabase();
    if (!sb) return { ok: false, error: "Connexion sécurisée indisponible." };
    const clean = String(code || "").replace(/[^0-9]/g, "").slice(0, 6);
    if (clean.length !== 6) return { ok: false, error: "Saisissez les six chiffres de votre application Authenticator.", errorCode: "validation_failed" };
    const challenge = await sb.auth.mfa.challenge({ factorId });
    if (challenge.error) return { ok: false, error: errorText(challenge.error), rawError: challenge.error, errorCode: authErrorCode(challenge.error) };
    const challengeId = challenge.data?.id;
    if (!challengeId) return { ok: false, error: "Impossible de créer le défi de vérification.", errorCode: "challenge_missing" };
    const { data, error } = await sb.auth.mfa.verify({ factorId, challengeId, code: clean });
    if (error) return { ok: false, error: errorText(error), rawError: error, errorCode: authErrorCode(error) };
    await sb.auth.refreshSession().catch(() => null);
    return { ok: true, data };
  },

  async discardUnverified(factorId) {
    const sb = await getSupabase();
    if (!sb) return { ok: false, error: "Connexion sécurisée indisponible." };
    const { data, error } = await sb.auth.mfa.unenroll({ factorId });
    return error ? { ok: false, error: errorText(error), rawError: error, errorCode: authErrorCode(error) } : { ok: true, data };
  },

  async unenroll(factorId) {
    const authorization = await rpc("authorize_my_sensitive_auth_change", { p_action: "factor_removal" });
    if (!authorization.ok) {
      if (String(authorization.rawError?.message || "").includes("mfa_required")) return this.redirect({ reason: "factor_removal", mode: "manage" });
      return authorization;
    }
    const sb = await getSupabase();
    const { data, error } = await sb.auth.mfa.unenroll({ factorId });
    return error ? { ok: false, error: errorText(error), rawError: error } : { ok: true, data };
  },

  async enableAdminEnforcement() {
    return rpc("enable_mfa_enforcement_after_admin_setup");
  },

  async authorizeSensitiveAuthChange(action) {
    const result = await rpc("authorize_my_sensitive_auth_change", { p_action: action });
    if (!result.ok && String(result.rawError?.message || "").includes("mfa_required")) return this.redirect({ reason: action });
    return result;
  },

  async sessionProfile() {
    const session = await getSession().catch(() => null);
    if (!session) return { ok: false, error: "authentication_required" };
    const profile = await getProfile();
    return profile.data ? { ok: true, data: profile.data } : { ok: false, error: profile.error || "profile_not_found" };
  },
};
