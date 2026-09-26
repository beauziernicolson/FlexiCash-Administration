import { getSupabase, isConfigured } from "./supabase-client.js";
import { href } from "../components.js";

export async function getMyAccountState() {
  if (!isConfigured()) return { state: "error", error: "backend_unavailable" };
  const sb = await getSupabase();
  if (!sb) return { state: "error", error: "supabase_unavailable" };
  try {
    const { data, error } = await sb.rpc("get_my_account_state");
    if (error) return { state: "rpc_unavailable", error };
    const row = Array.isArray(data) ? data[0] : data;
    return { state: "ok", data: row || {} };
  } catch (error) {
    return { state: "error", error, network: true };
  }
}

// Wallet Option B : l'inscription ouvre directement un Mini Wallet gratuit et
// actif. Il n'existe plus d'étape d'activation payante entre le profil minimal
// et le dashboard, et l'état `activation_required` n'est plus renvoyé par
// get_my_account_state(). Les états réels du backend sont : profile_required,
// ready, admin, wallet_unavailable, suspended, disabled.
//
// Ce switch n'est qu'un filet de secours ; le serveur fournit toujours
// next_route directement (voir redirectForAccountState ci-dessous).
export function routeForAccountState(state) {
  switch (state) {
    case "profile_required": return "onboarding/profile.html";
    case "ready": return "app/dashboard.html";
    case "admin": return "admin/dashboard.html";
    case "wallet_unavailable":
    case "suspended":
    case "disabled": return "access-denied.html";
    default: return null;
  }
}

function normalizedRoute(value) {
  const clean = String(value || "").split(/[?#]/)[0].replace(/^\/+/, "");
  const parts = clean.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}

function safeRememberedRoute(value, state) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 1000 || raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch {}
  if (decoded.includes("..") || decoded.includes("\\") || decoded.includes("\0")) return null;
  const route = decoded.replace(/^\/+/, "");
  const pathname = route.split(/[?#]/)[0];
  // Autoriser un compte donner/refuser son consentement OAuth (VinHT, etc.)
  // quel que soit son rôle (client ou admin) — un admin FlexiCash a un usage
  // légitime de ce parcours, distinct de son tableau de bord d'administration.
  if (pathname === "oauth/consent" && /^authorization_id=[a-z0-9._-]+$/i.test(route.split(/[?#]/)[1] || "")) return route;
  // Idem pour le retour Google du lien "Connecter mon compte FlexiCash"
  // (plateformes Platform API type VinHT) : après auth/callback.html, la
  // session doit revenir sur cette page pour finaliser
  // accept_platform_seller_invite_v1, pas sur le dashboard admin/client.
  if (pathname === "platform-connect-login.html" && /^token=fc_connect_[0-9a-f]{64}(&|$)/i.test(route.split(/[?#]/)[1] || "")) return route;
  if (state === "ready" && !/^(app|account)\/[a-z0-9._/-]+$/i.test(pathname)) return null;
  if (state === "admin" && !/^admin\/[a-z0-9._/-]+$/i.test(pathname)) return null;
  return route;
}

function rememberedNext(state) {
  if (!['ready','admin'].includes(state)) return null;
  try {
    const value = safeRememberedRoute(sessionStorage.getItem("fx.next"), state);
    if (value) sessionStorage.removeItem("fx.next");
    return value;
  } catch {
    return null;
  }
}

async function isCorporateTreasuryAccount() {
  if (!isConfigured()) return false;
  const sb = await getSupabase();
  if (!sb) return false;
  try {
    const { data, error } = await sb.rpc("is_corporate_treasury_member_v1");
    if (error) return false;
    const value = Array.isArray(data) ? data[0] : data;
    return value === true;
  } catch {
    return false;
  }
}

export async function redirectForAccountState(stateResult = null) {
  const result = stateResult || await getMyAccountState();
  if (result.state !== "ok") return { ok: false, error: result.error || result };

  const accountState = result.data?.state;

  // Corporate Treasury is a financial account experience, not a profile role.
  // A ready treasury controller lands in the dedicated workspace instead of the
  // consumer wallet dashboard. Explicit account/security destinations remain
  // possible through direct navigation from the Treasury workspace.
  let next = null;
  if (accountState === "ready" && await isCorporateTreasuryAccount()) {
    const remembered = rememberedNext(accountState);
    const rememberedPath = normalizedRoute(remembered || "");
    next = rememberedPath === "app/treasury.html" || rememberedPath.startsWith("account/") || rememberedPath === "oauth/consent" || rememberedPath === "platform-connect-login.html"
      ? remembered
      : "app/treasury.html";
  } else {
    next = rememberedNext(accountState) || result.data?.next_route || routeForAccountState(accountState);
  }

  if (!next) return { ok: false, error: "no_route" };

  const current = normalizedRoute(location.pathname);
  const target = normalizedRoute(next);
  if (current && current === target && !String(next).includes("?") && !String(next).includes("#")) {
    return { ok: true, stayed: true, route: target };
  }

  location.replace(href(next));
  return { ok: true, route: target };
}