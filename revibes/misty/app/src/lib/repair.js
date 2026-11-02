// "To detect and repair malformed React syntax, Misty employs heuristic rules implemented
// using regular expressions." (Section 4.3). These are our rules; the paper does not list its own.
import { ICON_SCOPE } from "./icons.js";
import { ALL_STOCK, STOCK } from "./stock.js";

const SCOPE_NAMES = new Set([
  ...Object.keys(ICON_SCOPE),
  "React",
  "Fragment",
]);

export function repairCode(input) {
  let code = String(input ?? "");
  const notes = [];

  // 1. Markdown fences and stray prose around the code.
  const fence = code.match(/```(?:jsx|tsx|javascript|js|react)?\s*\n([\s\S]*?)```/i);
  if (fence) {
    code = fence[1];
    notes.push("removed markdown fences");
  }

  // 2. import / export statements are not allowed.
  const before = code;
  code = code.replace(/^\s*import\s[^;\n]*(?:;|\n)/gm, "");
  code = code.replace(/^\s*export\s+default\s+(?=function|\(|async)/gm, "");
  code = code.replace(/^\s*export\s+default\s+[A-Za-z_$][\w$]*\s*;?\s*$/gm, "");
  code = code.replace(/^\s*export\s+(?=const|function|let)/gm, "");
  code = code.replace(/^\s*render\(\s*<[^>]*\/>\s*\)\s*;?\s*$/gm, "");
  if (code !== before) notes.push("removed import/export statements");

  code = code.trim();

  // 3. Make it a single component expression: () => { ... }
  if (!/^\(\s*\)\s*=>/.test(code) && !/^\(\s*\{?[^)]*\}?\s*\)\s*=>/.test(code)) {
    const named = code.match(/^(?:const|let|var)\s+([A-Z][\w$]*)\s*=\s*(\([^)]*\)\s*=>[\s\S]*)$/);
    const fn = code.match(/^function\s+([A-Z][\w$]*)\s*\(/);
    if (named && !/\n(?:const|let|var|function)\s+[A-Z]/.test(named[2])) {
      code = named[2];
      notes.push("unwrapped named component");
    } else if (fn || /(?:const|let|var|function)\s+[A-Z][\w$]*/.test(code)) {
      // several definitions: render the last capitalised one
      const names = [...code.matchAll(/(?:^|\n)\s*(?:const|let|var|function)\s+([A-Z][\w$]*)/g)].map((m) => m[1]);
      const main = names[names.length - 1];
      code = `() => {\n${code}\nreturn <${main} />;\n}`;
      notes.push(`wrapped component ${main}`);
    } else if (/^</.test(code)) {
      code = `() => (\n${code}\n)`;
      notes.push("wrapped bare JSX");
    }
  }
  code = code.replace(/;\s*$/, "");

  // 4. HTML attributes in JSX.
  if (/\sclass=["{]/.test(code)) {
    code = code.replace(/(<[a-zA-Z][^>]*?\s)class=(["{])/g, "$1className=$2");
    notes.push("class → className");
  }
  code = code.replace(/(<[a-zA-Z][^>]*?\s)for=(["{])/g, "$1htmlFor=$2");

  // 5. Images: only the stock photos exist.
  let stockI = 0;
  const pick = (hint) => {
    const h = hint.toLowerCase();
    const list = /avatar|profile|user|person|portrait|face/.test(h)
      ? STOCK.square
      : /portrait|tall|poster|cover/.test(h)
      ? STOCK.portrait
      : STOCK.landscape;
    return list[stockI++ % list.length];
  };
  code = code.replace(/(src=\{?["'`])([^"'`]*)(["'`])/g, (m, a, url, c) => {
    if (ALL_STOCK.includes(url) || url.startsWith("data:")) return m;
    if (/^\/?stock\//.test(url)) {
      const clean = "/" + url.replace(/^\//, "");
      if (ALL_STOCK.includes(clean)) return a + clean + c;
    }
    notes.push("replaced image path");
    return a + pick(url) + c;
  });
  code = code.replace(/url\((['"]?)(https?:[^)'"]+|\/?(?:images?|img|assets)\/[^)'"]+)\1\)/g, (m, q, url) => {
    notes.push("replaced background image");
    return `url(${q}${pick(url)}${q})`;
  });

  // 6. Unknown components (e.g. icons that do not exist in lucide) → Circle.
  const defined = new Set([...code.matchAll(/(?:const|let|var|function)\s+([A-Z][\w$]*)/g)].map((m) => m[1]));
  const used = new Set([...code.matchAll(/<\/?([A-Z][\w$]*)[\s/>]/g)].map((m) => m[1]));
  for (const name of used) {
    if (defined.has(name) || SCOPE_NAMES.has(name)) continue;
    const re = new RegExp(`(<\\/?)${name}(?=[\\s/>])`, "g");
    code = code.replace(re, "$1Circle");
    notes.push(`unknown component ${name} → Circle`);
  }
  // React.Fragment shorthand is fine; <Fragment> works through scope.

  return { code, notes };
}

/** True if the code looks like a renderable component at all. */
export function looksLikeComponent(code) {
  return /=>/.test(code) && /</.test(code);
}
