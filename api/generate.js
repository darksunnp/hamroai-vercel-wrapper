const DEFAULT_SPACE_BASE_URL = "https://darksunnp-hamroai.hf.space";
const DEFAULT_API_NAME = "/generate";

function normalizeApiName(name) {
  if (!name) return DEFAULT_API_NAME;
  return String(name).startsWith("/") ? String(name) : DEFAULT_API_NAME;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractOutput(payload) {
  if (payload == null) return null;

  if (typeof payload === "string") return payload;

  if (Array.isArray(payload)) {
    return payload.length ? String(payload[0]) : null;
  }

  if (typeof payload === "object") {
    if (typeof payload.output === "string") return payload.output;

    if (payload.output && Array.isArray(payload.output.data) && payload.output.data.length) {
      return String(payload.output.data[0]);
    }

    if (Array.isArray(payload.data) && payload.data.length) {
      return String(payload.data[0]);
    }
  }

  return null;
}

function parseSseForOutput(sseText) {
  const dataLines = [];
  for (const line of sseText.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  for (let i = dataLines.length - 1; i >= 0; i -= 1) {
    const chunk = dataLines[i];
    if (!chunk || chunk === "[DONE]") continue;

    try {
      const parsed = JSON.parse(chunk);
      const output = extractOutput(parsed);
      if (output) return output;
    } catch {
      // Ignore malformed chunk and continue.
    }
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
  const maxNewTokensRaw = payload && payload.max_new_tokens;

  if (!prompt) {
    return jsonResponse(res, 400, { error: "Prompt is required" });
  }

  let maxNewTokens = Number(maxNewTokensRaw || 80);
  if (!Number.isFinite(maxNewTokens)) maxNewTokens = 80;
  maxNewTokens = Math.max(8, Math.min(256, Math.floor(maxNewTokens)));

  const spaceBaseUrl = process.env.HAMROAI_SPACE_BASE_URL || DEFAULT_SPACE_BASE_URL;
  const apiName = normalizeApiName(process.env.HAMROAI_API_NAME || DEFAULT_API_NAME);
  const callUrl = `${spaceBaseUrl}/gradio_api/call${apiName}`;

  try {
    const startResp = await fetch(callUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [prompt, maxNewTokens] }),
    });

    const startText = await startResp.text();
    if (!startResp.ok) {
      return jsonResponse(res, startResp.status, {
        error: `Queue start failed (${startResp.status})`,
        details: startText.slice(0, 500),
      });
    }

    let startPayload = {};
    try {
      startPayload = startText ? JSON.parse(startText) : {};
    } catch {
      return jsonResponse(res, 502, {
        error: "Failed to parse queue start response",
        details: startText.slice(0, 500),
      });
    }

    const directOutput = extractOutput(startPayload);
    if (directOutput) {
      return jsonResponse(res, 200, { output: directOutput });
    }

    const eventId = startPayload.event_id;
    if (!eventId) {
      return jsonResponse(res, 502, {
        error: "Queue start response missing event_id",
        details: JSON.stringify(startPayload).slice(0, 500),
      });
    }

    const resultUrl = `${callUrl}/${eventId}`;
    const startedAt = Date.now();

    while (Date.now() - startedAt < 210000) {
      const resultResp = await fetch(resultUrl, {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });

      const resultText = await resultResp.text();
      if (!resultResp.ok) {
        await sleep(1200);
        continue;
      }

      const output = parseSseForOutput(resultText);
      if (output) {
        return jsonResponse(res, 200, { output });
      }

      await sleep(1200);
    }

    return jsonResponse(res, 504, {
      error: "Timed out waiting for generation result",
      hint: "The Space may be cold-starting or overloaded. Please retry.",
    });
  } catch (error) {
    return jsonResponse(res, 500, {
      error: `Unhandled server error: ${error.message || error}`,
    });
  }
}
