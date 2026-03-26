const promptEl = document.getElementById("prompt");
const tokenEl = document.getElementById("max_new_tokens");
const tokenValueEl = document.getElementById("token_value");
const outputEl = document.getElementById("output");
const statusEl = document.getElementById("status");
const btnEl = document.getElementById("generate_btn");

tokenEl.addEventListener("input", () => {
  tokenValueEl.textContent = tokenEl.value;
});

function setStatus(kind, text) {
  statusEl.className = `status ${kind}`;
  statusEl.textContent = text;
}

btnEl.addEventListener("click", async () => {
  const prompt = promptEl.value.trim();
  if (!prompt) {
    setStatus("error", "Missing prompt");
    outputEl.textContent = "Please enter a prompt.";
    return;
  }

  btnEl.disabled = true;
  setStatus("loading", "Generating...");
  outputEl.textContent = "Waiting for model output...";

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        max_new_tokens: Number(tokenEl.value),
      }),
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {
        error: "Server returned non-JSON response",
        details: text.slice(0, 500),
      };
    }

    if (!response.ok) {
      let message = data.error || "Request failed";
      if (data.hint) {
        message += `\n\nHint: ${data.hint}`;
      }
      if (data.details) {
        message += `\n\nDetails: ${data.details}`;
      }
      throw new Error(message);
    }

    outputEl.textContent = data.output || "(Empty output)";
    setStatus("done", "Done");
  } catch (error) {
    outputEl.textContent = String(error.message || error);
    setStatus("error", "Error");
  } finally {
    btnEl.disabled = false;
  }
});
