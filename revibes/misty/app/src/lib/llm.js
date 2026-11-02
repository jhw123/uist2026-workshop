import { parseJsonReply, repairCode, formatJsx } from './repair.js';

// All model calls go to the LLM bridge (llm-bridge/bridge.py) through the Vite
// dev server's /llm proxy, in the OpenAI Chat Completions format.
const BASE = '/llm';

const SYSTEM = 'You are Misty, an expert UI designer and React + Tailwind CSS developer who performs conceptual blending of UI examples into work-in-progress UI code. Always answer with a single JSON object.';

export async function bridgeHealth() {
  try {
    const r = await fetch(`${BASE}/health`);
    if (!r.ok) return { ok: false };
    return { ok: true, ...(await r.json()) };
  } catch {
    return { ok: false };
  }
}

export async function callModel(prompt, imageDataUrl) {
  const content = imageDataUrl
    ? [
        { type: 'text', text: 'Reference image:' },
        { type: 'image_url', image_url: { url: imageDataUrl } },
        { type: 'text', text: prompt },
      ]
    : prompt;
  let r;
  try {
    r = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content },
        ],
        response_format: { type: 'json_object' },
      }),
    });
  } catch (e) {
    throw new Error('Cannot reach the LLM bridge. Start it with: python3 llm-bridge/bridge.py claude');
  }
  if (!r.ok) {
    const t = await r.text();
    throw new Error(r.status === 502 || r.status === 504
      ? 'Cannot reach the LLM bridge. Start it with: python3 llm-bridge/bridge.py claude'
      : `Bridge error ${r.status}: ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  const json = parseJsonReply(text);
  if (json.updatedCode) json.updatedCode = formatJsx(repairCode(json.updatedCode));
  if (!json.updatedCode) throw new Error('The model reply had no updatedCode.');
  json.categorizedChanges = Array.isArray(json.categorizedChanges) ? json.categorizedChanges : [];
  return json;
}
