export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const started = Date.now();

  try {
    const response = await fetch("https://moncashbutton.digicelgroup.com/Api/oauth/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: "Basic ZmxleGljYXNoLW5ldHdvcmstdGVzdDppbnZhbGlk",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "scope=read,write&grant_type=client_credentials",
      signal: controller.signal,
    });

    const body = await response.text().catch(() => "");
    const result = {
      ok: true,
      reachable: true,
      upstream_status: response.status,
      elapsed_ms: Date.now() - started,
      body_kind: body ? "response_received" : "empty_response",
    };
    console.log("MONCASH_NETWORK_PROBE", JSON.stringify(result));
    res.status(200).json(result);
  } catch (error) {
    const result = {
      ok: false,
      reachable: false,
      elapsed_ms: Date.now() - started,
      error: error?.name === "AbortError" ? "timeout" : "network_error",
    };
    console.log("MONCASH_NETWORK_PROBE", JSON.stringify(result));
    res.status(200).json(result);
  } finally {
    clearTimeout(timeout);
  }
}
