const DEFAULT_MODEL_ID = "Helsinki-NLP/opus-mt-ne-en";
const DEFAULT_ENDPOINT = `https://api-inference.huggingface.co/models/${DEFAULT_MODEL_ID}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTranslation(payload) {
  if (!payload) return null;

  if (typeof payload === "string") return payload;

  if (Array.isArray(payload) && payload.length) {
    const first = payload[0];
    if (typeof first === "string") return first;
    if (first && typeof first.translation_text === "string") return first.translation_text;
    if (first && typeof first.generated_text === "string") return first.generated_text;
    if (first && typeof first.text === "string") return first.text;
  }

  if (typeof payload === "object") {
    if (typeof payload.translation_text === "string") return payload.translation_text;
    if (typeof payload.generated_text === "string") return payload.generated_text;
    if (typeof payload.text === "string") return payload.text;
  }

  return null;
}

function jsonResponse(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json").send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  let payload = req.body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return jsonResponse(res, 400, { error: "Invalid JSON body" });
    }
  }

  const prompt = String((payload && payload.prompt) || "").trim();

  if (!prompt) {
    return jsonResponse(res, 400, { error: "Prompt is required" });
  }

  const endpoint = process.env.HAMROAI_TRANSLATION_ENDPOINT || DEFAULT_ENDPOINT;
  const hfToken = process.env.HF_INFERENCE_TOKEN || process.env.HF_TOKEN;
  const headers = {
    "Content-Type": "application/json",
  };
  if (hfToken) {
    headers.Authorization = `Bearer ${hfToken}`;
  }

  try {
    let lastDetails = "";
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ inputs: prompt }),
      });

      const respText = await resp.text();
      let parsed = null;
      try {
        parsed = respText ? JSON.parse(respText) : null;
      } catch {
        parsed = null;
      }

      if (resp.status === 503) {
        const waitSeconds = parsed && Number.isFinite(parsed.estimated_time)
          ? Math.max(1, Math.ceil(parsed.estimated_time))
          : 2;
        lastDetails = `Model loading (attempt ${attempt}/4). Waiting ${waitSeconds}s.`;
        await sleep(waitSeconds * 1000);
        continue;
      }

      if (!resp.ok) {
        const hint = resp.status === 401 || resp.status === 403
          ? "Set HF_INFERENCE_TOKEN in Vercel Environment Variables."
          : undefined;
        return jsonResponse(res, resp.status, {
          error: `Translation request failed (${resp.status})`,
          hint,
          details: (respText || "").slice(0, 500),
        });
      }

      const output = extractTranslation(parsed);
      if (!output) {
        return jsonResponse(res, 502, {
          error: "Could not parse translation output",
          details: (respText || "").slice(0, 500),
        });
      }

      return jsonResponse(res, 200, { output });
    }

    return jsonResponse(res, 504, {
      error: "Timed out while waiting for translation model",
      hint: "Model is still loading. Retry in a few seconds.",
      details: lastDetails,
    });
  } catch (error) {
    return jsonResponse(res, 500, {
      error: `Unhandled server error: ${error.message || String(error)}`,
    });
  }
}
