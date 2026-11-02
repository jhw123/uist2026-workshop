// Calls the workshop LLM bridge through the Vite dev server's /llm proxy.
// The paper used OpenAI GPT-4o; here the bridge answers with the model of the
// coding agent the group is signed in to (Haiku by default for Claude Code).

const BASE = "/llm";

export async function bridgeHealth() {
  try {
    const r = await fetch(`${BASE}/health`, { cache: "no-store" });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json().catch(() => ({}));
    return { ok: true, ...j };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * Send one multimodal prompt. `images` are data URLs (PNG/JPEG).
 * Returns the model's text answer.
 */
export async function chat({ system, prompt, images = [], json = true, signal }) {
  const content = [{ type: "text", text: prompt }];
  for (const url of images) content.push({ type: "image_url", image_url: { url } });
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content });
  const body = { model: "gpt-4o", messages };
  if (json) body.response_format = { type: "json_object" };

  let r;
  try {
    r = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer bridge" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    throw new Error(
      "Could not reach the LLM bridge. Start it from the repository root with: python3 llm-bridge/bridge.py claude"
    );
  }
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j.error?.message || j.error || text;
    } catch {}
    if (r.status === 502 || r.status === 504 || /ECONNREFUSED/.test(msg)) {
      msg = "The LLM bridge is not running. Start it from the repository root with: python3 llm-bridge/bridge.py claude";
    }
    throw new Error(`LLM call failed (${r.status}): ${String(msg).slice(0, 400)}`);
  }
  const j = JSON.parse(text);
  return j.choices?.[0]?.message?.content ?? "";
}
