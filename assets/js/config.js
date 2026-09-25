// Configuration Web neutralisée pour l'édition administrative publique.
// Fournir ces valeurs au runtime via window.__FLEXICASH_CONFIG__ ; ne jamais
// versionner de secret serveur ou de clé service_role.
export const config = Object.freeze({
  supabaseUrl: window.__FLEXICASH_CONFIG__?.supabaseUrl || "",
  supabaseAnonKey: window.__FLEXICASH_CONFIG__?.supabaseAnonKey || "",
});
