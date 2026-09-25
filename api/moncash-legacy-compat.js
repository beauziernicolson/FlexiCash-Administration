const SUPABASE_CALLBACK =
  "https://kriljwmhofiqblerzgti.supabase.co/functions/v1/moncash-callback-v2";

function firstString(value) {
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

function queryPairs(req) {
  const url = new URL(req.url || "/", "https://www.flexicash.biz");
  return [...url.searchParams.entries()].filter(([key]) => !["mode", "legacy_path"].includes(key));
}

function isBrowserRequest(req) {
  const accept = String(req.headers?.accept || "").toLowerCase();
  return accept.includes("text/html");
}

function returnPageUrl(req) {
  const target = new URL("https://www.flexicash.biz/payments/return.html");
  target.searchParams.set("provider", "moncash");
  target.searchParams.set("result", "pending");

  const url = new URL(req.url || "/", "https://www.flexicash.biz");
  const reference =
    url.searchParams.get("reference") ||
    url.searchParams.get("orderId") ||
    url.searchParams.get("order_id") ||
    "";

  if (/^[A-Za-z0-9._:-]{6,100}$/.test(reference)) {
    target.searchParams.set("reference", reference);
  }

  return target.toString();
}

async function forwardNotification(req) {
  const incoming = new URL(req.url || "/", "https://www.flexicash.biz");
  const target = new URL(SUPABASE_CALLBACK);
  target.searchParams.set("channel", "notification");
  target.searchParams.set("environment", "production");

  for (const [key, value] of queryPairs(req)) {
    if (!["channel", "environment", "contract"].includes(key)) {
      target.searchParams.append(key, value);
    }
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (value == null) continue;
    const lower = key.toLowerCase();
    if (["host", "content-length", "connection"].includes(lower)) continue;
    headers.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }

  let body;
  if (req.method === "POST") {
    if (Buffer.isBuffer(req.body)) {
      body = req.body;
    } else if (typeof req.body === "string") {
      body = req.body;
    } else if (req.body && typeof req.body === "object") {
      body = JSON.stringify(req.body);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const mode = firstString(req.query?.mode).toLowerCase() || "auto";
  const browser = mode === "customer" || isBrowserRequest(req);

  let upstream = null;
  let upstreamError = null;

  try {
    upstream = await forwardNotification(req);
  } catch (error) {
    upstreamError = error?.name === "AbortError" ? "callback_timeout" : "callback_unavailable";
  }

  if (browser) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Referrer-Policy", "no-referrer");
    return res.redirect(303, returnPageUrl(req));
  }

  if (!upstream) {
    return res.status(503).json({ error: upstreamError || "callback_unavailable" });
  }

  const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";
  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.send(text);
}
