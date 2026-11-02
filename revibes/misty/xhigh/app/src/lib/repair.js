// Heuristic, regular-expression repairs for malformed React code from the model
// (paper §4.3). They run on every generated result and again on "Fix Render".
import { KNOWN_NAMES } from "./scope.js";

export const STOCK = {
  landscape: [0, 1, 2, 3, 4, 5].map((i) => `/stock/landscape${i}.jpg`),
  portrait: [0, 1, 2, 3, 4, 5].map((i) => `/stock/portrait${i}.jpg`),
};

// Apply fn to the token list of every static className string.
function mapClassNames(code, fn) {
  const rewrite = (cls) => fn(cls.split(/\s+/).filter(Boolean)).join(" ");
  return code
    .replace(/className=(["'])([^"'\n]*)\1/g, (m, q, cls) => `className=${q}${rewrite(cls)}${q}`)
    .replace(/className=\{`([^`$]*)`\}/g, (m, cls) => `className={\`${rewrite(cls)}\`}`);
}

const SCREEN_CLASSES = {
  fixed: "absolute", // the paper's prompt: "use absolute bottom-0 instead of fixed bottom-0"
  "h-screen": "h-full",
  "min-h-screen": "min-h-full",
  "max-h-screen": "max-h-full",
  "w-screen": "w-full",
};

function fixImages(code) {
  let n = 0;
  return code.replace(/(<img\b[^>]*?\bsrc=)(["'])([^"']*)\2/g, (m, head, q, url) => {
    const s = url.match(/stock\/(landscape|portrait)(\d+)\.jpg$/);
    if (s) return `${head}${q}/stock/${s[1]}${Number(s[2]) % 6}.jpg${q}`;
    const kind = /rounded-full|avatar|profile/i.test(m) ? "portrait" : "landscape";
    return `${head}${q}${STOCK[kind][n++ % 6]}${q}`;
  });
}

// Replace components that are neither defined in the code nor in scope
// (e.g. FaHeart, HeartIcon, a lucide icon that does not exist) with a lucide icon.
function fixUnknownComponents(code) {
  const defined = new Set();
  for (const m of code.matchAll(/(?:const|let|var|function|class)\s+([A-Z][\w$]*)/g)) defined.add(m[1]);
  const used = new Set();
  for (const m of code.matchAll(/<\/?([A-Z][\w$]*)[\s/>]/g)) used.add(m[1]);
  for (const m of code.matchAll(/(?:icon|Icon)\s*[:=]\s*\{?\s*([A-Z][\w$]*)/g)) used.add(m[1]);
  for (const name of used) {
    if (defined.has(name) || KNOWN_NAMES.has(name)) continue;
    const base = name
      .replace(/^Lucide/, "")
      .replace(/Icon$/, "")
      .replace(/^(Fa|Fi|Md|Hi|Io|Ai|Bi|Bs|Ri|Tb|Lu)(Outline|Solid)?/, "")
      .replace(/(Outline|Solid|Fill)$/, "");
    const alias = { Home: "House", Edit3: "Pencil", Trash: "Trash2", Share: "Share2", Close: "X", Times: "X" }[base] || base;
    const to = KNOWN_NAMES.has(alias) ? alias : "Circle";
    const re = new RegExp(`(<\\/?|[:=]\\s*\\{?\\s*)${name}\\b`, "g");
    code = code.replace(re, `$1${to}`);
  }
  return code;
}

// react-live style rendering needs one expression; turn declarations into one.
function toExpression(code) {
  code = code.trim().replace(/;+\s*$/, "");
  if (/^(\(\s*\)|\(\s*\{?[^)]*\}?\s*\)|[a-z_$][\w$]*)\s*=>/.test(code) || /^function\s*\(/.test(code) || /^</.test(code)) {
    return code;
  }
  // helper declarations followed by the anonymous main component
  const anon = [...code.matchAll(/^\(\s*\)\s*=>/gm)].pop();
  if (anon && anon.index > 0) {
    return `(() => {\n${code.slice(0, anon.index)}\nreturn (${code.slice(anon.index).replace(/;+\s*$/, "")});\n})()`;
  }
  const names = [...code.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Z][\w$]*)\s*=|(?:^|\n)\s*function\s+([A-Z][\w$]*)\s*\(/g)].map((m) => m[1] || m[2]);
  const main = names.includes("App") ? "App" : names.pop();
  if (main) return `(() => {\n${code}\nreturn ${main};\n})()`;
  return code;
}

export function repairCode(raw) {
  let code = String(raw ?? "").trim();
  const fence = code.match(/```[a-zA-Z]*\s*\n([\s\S]*?)```/);
  if (fence) code = fence[1].trim();
  // a JSON-escaped string slipped through
  if (/^"[\s\S]*"$/.test(code)) {
    try { code = JSON.parse(code); } catch { /* keep as is */ }
  }
  const exported = code.match(/export\s+default\s+(?:function\s+)?([A-Z][\w$]*)/);
  code = code
    .replace(/^\s*import\s[\s\S]*?from\s*['"][^'"]+['"];?\s*$/gm, "")
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, "")
    .replace(/^\s*export\s+default\s+[A-Za-z_$][\w$]*\s*;?\s*$/gm, "")
    .replace(/^(\s*)export\s+(default\s+)?/gm, "$1")
    .replace(/^\s*render\s*\(\s*<[\s\S]*?\/>\s*\)\s*;?\s*$/gm, "")
    .replace(/^\s*ReactDOM\.[\s\S]*?;\s*$/gm, "")
    .replace(/<!--([\s\S]*?)-->/g, "{/*$1*/}")
    .replace(/(<[a-zA-Z][^<>]*?\s)class=(["'{])/g, "$1className=$2")
    .replace(/(<label\b[^<>]*?\s)for=/g, "$1htmlFor=")
    .replace(/\sstyle="[^"]*"/g, "");
  code = code.trim().replace(/;+\s*$/, "");
  code = exported && !/^\(\s*\)\s*=>/.test(code)
    ? `(() => {\n${code}\nreturn ${exported[1]};\n})()`
    : toExpression(code);
  code = mapClassNames(code, (tokens) => tokens.map((t) => SCREEN_CLASSES[t] || t));
  code = fixImages(code);
  code = fixUnknownComponents(code);
  return code.trim();
}

// --- fine-grained semantic-diff edits: swap Tailwind classes in place ---------

// Swap the classes of a semantic-diff change from `before` to `after`. The model's
// class lists are approximate, so if no className holds the whole list, swap
// only the tokens that changed (e.g. one color). Returns { code, count }.
export function swapChangeClasses(code, before, after) {
  const whole = replaceClasses(code, before, after);
  if (whole.count > 0) return whole;
  const from = before.split(/\s+/).filter(Boolean);
  const to = after.split(/\s+/).filter(Boolean);
  if (from.length !== to.length) return whole;
  let count = 0;
  from.forEach((t, i) => {
    if (t === to[i]) return;
    const r = replaceClasses(code, t, to[i]);
    code = r.code;
    count += r.count;
  });
  return { code, count };
}

// Replace the classes in `before` (a space-separated list) with `after` in every
// className that contains all of them. Returns { code, count }.
export function replaceClasses(code, before, after) {
  const from = before.split(/\s+/).filter(Boolean);
  const to = after.split(/\s+/).filter(Boolean);
  if (!from.length) return { code, count: 0 };
  let count = 0;
  const next = mapClassNames(code, (tokens) => {
    if (!from.every((t) => tokens.includes(t))) return tokens;
    count++;
    const at = tokens.indexOf(from[0]);
    const kept = tokens.filter((t) => !from.includes(t));
    kept.splice(Math.min(at, kept.length), 0, ...to);
    return kept;
  });
  return { code: next, count };
}
