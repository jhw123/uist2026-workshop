// Parse the model's JSON answer. The paper's format shows updatedCode in backticks and
// unquoted keys, so we accept strict JSON first and fall back to those looser forms.

function sliceObject(t) {
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  return s >= 0 && e > s ? t.slice(s, e + 1) : t;
}

export function parseModelJson(raw) {
  let t = String(raw ?? "").trim();
  t = t.replace(/^```(?:json|javascript|js)?\s*/i, "").replace(/```\s*$/i, "");
  const obj = sliceObject(t);
  try {
    return JSON.parse(obj);
  } catch {}

  // updatedCode given as a template literal: pull it out, then parse the rest.
  const m = obj.match(/(["']?)updatedCode\1\s*:\s*`([\s\S]*?)`\s*(?=,\s*\n?\s*["']?\w+["']?\s*:|\s*})/);
  if (m) {
    const code = m[2];
    const rest = obj.replace(m[0], `"updatedCode": "__MISTY_CODE__"`);
    const parsed = tryLoose(rest);
    if (parsed) {
      parsed.updatedCode = code;
      return parsed;
    }
    // At least return the code.
    return { updatedCode: code, categorizedChanges: [] };
  }
  const loose = tryLoose(obj);
  if (loose) return loose;

  // Last resort: code block anywhere in the answer.
  const code = t.match(/```(?:jsx|tsx|js|javascript)?\s*\n([\s\S]*?)```/);
  if (code) return { updatedCode: code[1], categorizedChanges: [] };
  const arrow = t.match(/\(\s*\)\s*=>\s*\{[\s\S]*\}/);
  if (arrow) return { updatedCode: arrow[0], categorizedChanges: [] };
  throw new Error("The model's answer was not valid JSON and contained no code.");
}

function tryLoose(s) {
  // quote bare keys, drop // comments and trailing commas
  let x = s
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(x);
  } catch {
    return null;
  }
}

/** Normalise categorizedChanges into the shape the semantic diff panel uses. */
export function normaliseCategories(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((c, i) => {
      const full = String(c?.category ?? c?.name ?? `Change ${i + 1}`).trim();
      const idx = full.indexOf(":");
      const kind = idx > 0 ? full.slice(0, idx).trim() : "Change";
      const label = idx > 0 ? full.slice(idx + 1).trim() : full;
      const changes = (Array.isArray(c?.changes) ? c.changes : []).map((ch, j) => ({
        id: `${i}-${j}`,
        type: String(ch?.type ?? "style"),
        before: String(ch?.before ?? ""),
        after: String(ch?.after ?? ""),
        current: String(ch?.after ?? ""),
        on: true,
      }));
      return { id: `c${i}`, category: full, kind, label, on: true, changes, open: false };
    })
    .filter((c) => c.label);
}
