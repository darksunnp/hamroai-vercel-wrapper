const CHAT_COMPLETIONS_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";
const DEFAULT_CHAT_MODEL = "Qwen/Qwen2.5-7B-Instruct:fastest";
const DEFAULT_SYSTEM_PROMPT =
  "You are HamroAI, a helpful Nepali chatbot. Answer in Nepali when the user writes Nepali. Give direct, accurate answers and do not translate unless asked.";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractChatCompletion(payload) {
  if (!payload || !Array.isArray(payload.choices) || !payload.choices.length) {
    return null;
  }

  const first = payload.choices[0];
  if (!first || !first.message) {
    return null;
  }

  const content = first.message.content;
  if (typeof content === "string") {
    return content.trim() || null;
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .filter(Boolean);
    const combined = textParts.join(" ").trim();
    return combined || null;
  }

  return null;
}

function jsonResponse(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json").send(JSON.stringify(body));
}

async function requestChatCompletion(headers, prompt, maxTokens, modelName, systemPrompt) {
  let lastDetails = "";

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const resp = await fetch(CHAT_COMPLETIONS_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelName,
        temperature: 0.2,
        max_tokens: maxTokens,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
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
      return {
        ok: false,
        status: resp.status,
        hint,
        details: (respText || "").slice(0, 500),
      };
    }

    const output = extractChatCompletion(parsed);
    if (!output) {
      return {
        ok: false,
        status: 502,
        details: (respText || "").slice(0, 500),
      };
    }

    return { ok: true, output };
  }

  return {
    ok: false,
    status: 504,
    hint: "Model is still loading. Retry in a few seconds.",
    details: lastDetails,
  };
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
  const rawMaxTokens = Number(payload && payload.max_new_tokens);
  const maxTokens = Number.isFinite(rawMaxTokens)
    ? Math.max(32, Math.min(512, Math.round(rawMaxTokens)))
    : 128;

  if (!prompt) {
    return jsonResponse(res, 400, { error: "Prompt is required" });
  }

  const hfToken = process.env.HF_INFERENCE_TOKEN || process.env.HF_TOKEN;
  if (!hfToken) {
    return jsonResponse(res, 401, {
      error: "Missing Hugging Face token",
      hint: "Set HF_INFERENCE_TOKEN in Vercel Environment Variables.",
    });
  }

  const modelName = process.env.HAMROAI_CHAT_MODEL || DEFAULT_CHAT_MODEL;
  const systemPrompt = process.env.HAMROAI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${hfToken}`,
  };

  try {
    const chatResult = await requestChatCompletion(
      headers,
      prompt,
      maxTokens,
      modelName,
      systemPrompt
    );

    if (!chatResult.ok) {
      return jsonResponse(res, chatResult.status, {
        error: `Chat request failed (${chatResult.status})`,
        hint: chatResult.hint,
        details: chatResult.details,
      });
    }

    return jsonResponse(res, 200, {
      output: chatResult.output,
      mode: "chat",
      model: modelName,
    });
  } catch (error) {
    return jsonResponse(res, 500, {
      error: `Unhandled server error: ${error.message || String(error)}`,
    });
  }
}
