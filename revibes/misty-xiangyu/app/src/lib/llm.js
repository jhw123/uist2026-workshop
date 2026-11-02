// Model calls go through the workshop's LLM bridge (OpenAI Chat Completions
// format). The paper used GPT-4o; the bridge's model answers instead.
import { repairCode } from "./repair";

export const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || "http://localhost:8787";

const SYSTEM =
  "You are an expert UI designer and React + Tailwind CSS developer who blends reference UI designs into existing UI code. Always answer with a single JSON object.";

export async function bridgeHealth() {
  try {
    const r = await fetch(`${BRIDGE_URL}/health`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function callModel(prompt, imageDataUrl) {
  const content = imageDataUrl
    ? [
        { type: "text", text: "Reference image:" },
        { type: "image_url", image_url: { url: imageDataUrl } },
        { type: "text", text: prompt },
      ]
    : prompt;
  let r;
  try {
    r = await fetch(`${BRIDGE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch {
    throw new Error(`Cannot reach the LLM bridge at ${BRIDGE_URL}. Start it with: python3 llm-bridge/bridge.py claude`);
  }
  if (!r.ok) throw new Error(`LLM bridge error ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export function parseModelJson(text) {
  let t = String(text).trim().replace(/^```(json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {}
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch {}
  }
  // Last resort: pull updatedCode out of backticks, as the paper's format shows it.
  const m = t.match(/updatedCode"?\s*:\s*`([\s\S]*?)`\s*,?\s*\n/);
  if (m) return { updatedCode: m[1], categorizedChanges: [] };
  throw new Error("The model's answer was not valid JSON. Try Regenerate.");
}

function normalizeChanges(list) {
  if (!Array.isArray(list)) return [];
  return list.map((c, i) => ({
    id: `c${i}`,
    category: String(c.category || "Change"),
    enabled: true,
    changes: (Array.isArray(c.changes) ? c.changes : []).map((x, j) => ({
      id: `c${i}-${j}`,
      type: String(x.type || ""),
      before: String(x.before ?? ""),
      after: String(x.after ?? ""),
      enabled: true,
    })),
  }));
}

// Runs one blending call; returns { code, designExplanation, differences, categories }.
export async function runBlend(prompt, imageDataUrl) {
  const json = parseModelJson(await callModel(prompt, imageDataUrl));
  if (!json.updatedCode) throw new Error("The model returned no updatedCode. Try Regenerate.");
  return {
    code: repairCode(json.updatedCode),
    designExplanation: json.designExplanation || "",
    differences: typeof json.differences === "string" ? json.differences : JSON.stringify(json.differences || ""),
    categories: normalizeChanges(json.categorizedChanges),
  };
}

// Runs a code-only call (semantic diff update, Fix Render); returns code.
export async function runCodeUpdate(prompt) {
  const json = parseModelJson(await callModel(prompt));
  if (!json.updatedCode) throw new Error("The model returned no updatedCode.");
  return repairCode(json.updatedCode);
}
