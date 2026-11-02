// Fine-grained semantic diff control: swap Tailwind classes in className strings directly,
// without a model call. Returns null when the swap cannot be done safely (then the caller
// asks the model instead).

const CLASSNAME_RE = /className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/g;

const toks = (s) => String(s || "").trim().split(/\s+/).filter(Boolean);

export function swapClasses(code, fromStr, toStr) {
  const from = toks(fromStr);
  const to = toks(toStr);
  if (from.length === 0) return null; // pure addition: we do not know where to add
  let found = 0;
  const out = code.replace(CLASSNAME_RE, (m, a, b, c, d, e) => {
    const s = a ?? b ?? c ?? d ?? e ?? "";
    const list = s.split(/\s+/).filter(Boolean);
    if (!from.every((t) => list.includes(t))) return m;
    found++;
    const at = list.indexOf(from[0]);
    const kept = list.filter((t) => !from.includes(t));
    const insertAt = Math.min(at, kept.length);
    const next = [...kept.slice(0, insertAt), ...to.filter((t) => !kept.includes(t)), ...kept.slice(insertAt)].join(" ");
    return m.replace(s, next);
  });
  return found ? out : null;
}
