// Model calls go through the workshop's LLM bridge (OpenAI Chat Completions
// format), proxied by Vite at /llm. The paper used GPT-4o; the bridge answers
// with the model of the coding agent it runs on (see the README).

export async function bridgeHealth() {
  try {
    const r = await fetch("/llm/health", { cache: "no-store" });
    if (!r.ok) return { ok: false };
    return await r.json();
  } catch {
    return { ok: false };
  }
}

export async function chat({ system, text, images = [], json = true }) {
  const content = [{ type: "text", text }];
  for (const url of images) content.push({ type: "image_url", image_url: { url } });
  const body = {
    model: "gpt-4o",
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
  };
  if (json) body.response_format = { type: "json_object" };
  let r;
  try {
    r = await fetch("/llm/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error("Cannot reach the LLM bridge. Is it running? (python3 llm-bridge/bridge.py claude)");
  }
  if (!r.ok) {
    let msg = await r.text();
    try { msg = JSON.parse(msg).error?.message || msg; } catch { /* plain text */ }
    if (r.status === 502 || r.status === 504 || /ECONNREFUSED/.test(msg)) {
      msg = `LLM bridge unavailable (${r.status}). ${msg}`.slice(0, 400);
    }
    throw new Error(msg.slice(0, 400));
  }
  const data = await r.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// The paper's prompt asks for "json" in a loose, commented format; accept strict
// JSON first, then progressively looser readings of the answer.
export function parseJsonLoose(text) {
  let s = String(text || "").trim();
  const fence = s.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const attempts = [s];
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) attempts.push(s.slice(a, b + 1));
  for (const t of attempts) {
    try { return JSON.parse(t); } catch { /* next */ }
  }
  // updatedCode given as a template literal: `() => {...}`
  let t = attempts[attempts.length - 1].replace(
    /("?updatedCode"?\s*:\s*)[`'‘]([\s\S]*?)[`'’]\s*(,\s*\n?\s*(?:\/\/[^\n]*\n\s*)*"?categorizedChanges|\s*\}$)/,
    (m, k, code, rest) => `${k}${JSON.stringify(code)}${rest}`
  );
  t = t
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/([{,]\s*)([A-Za-z_]\w*)(\s*:)/g, '$1"$2"$3')
    .replace(/,\s*([}\]])/g, "$1");
  try { return JSON.parse(t); } catch { /* fall through */ }
  // last resort: pull the code out on its own
  const code = s.match(/"updatedCode"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (code) {
    try { return { updatedCode: JSON.parse(`"${code[1]}"`), categorizedChanges: [] }; } catch { /* no */ }
  }
  throw new Error("The model's answer was not valid JSON.");
}
