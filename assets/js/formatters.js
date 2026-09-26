import { CONFIG } from "./config.js";

export function fmtHTG(n, opts = {}) {
  const value = Number(n || 0);
  const s = new Intl.NumberFormat("fr-HT", {
    minimumFractionDigits: opts.decimals ?? 2,
    maximumFractionDigits: opts.decimals ?? 2,
  }).format(value);
  return `${s} HTG`;
}

// Formateur multidevise unique : HTG s'affiche "12 500 HTG" (suffixe), USD
// s'affiche "$125.50" (symbole préfixé). N'invente jamais de devise : seules
// HTG et USD, telles que renvoyées par le backend, sont acceptées.
export function fmtMoney(n, currency = "HTG", opts = {}) {
  const value = Number(n || 0);
  const code = String(currency || "HTG").toUpperCase();
  if (code === "USD") {
    const s = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: opts.decimals ?? 2,
      maximumFractionDigits: opts.decimals ?? 2,
    }).format(value);
    return `$${s}`;
  }
  return fmtHTG(value, opts);
}
export function fmtNumber(n) { return new Intl.NumberFormat("fr-HT").format(Number(n||0)); }
export function fmtDate(d, opts = { dateStyle: "medium" }) {
  return new Intl.DateTimeFormat("fr-HT", opts).format(d instanceof Date ? d : new Date(d));
}
export function fmtDateTime(d) {
  return new Intl.DateTimeFormat("fr-HT", { dateStyle: "medium", timeStyle: "short" }).format(d instanceof Date ? d : new Date(d));
}
export function relTime(d) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (abs < 60) return rtf.format(-Math.round(diff), "second");
  if (abs < 3600) return rtf.format(-Math.round(diff/60), "minute");
  if (abs < 86400) return rtf.format(-Math.round(diff/3600), "hour");
  return rtf.format(-Math.round(diff/86400), "day");
}
export function maskFlexi(id) { return id ? id.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3") : ""; }
export function initials(name) { return (name||"?").split(" ").map(x=>x[0]).filter(Boolean).slice(0,2).join("").toUpperCase(); }
