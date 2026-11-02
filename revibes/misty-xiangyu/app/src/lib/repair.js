// Heuristic repair of malformed React code with regular expressions
// (paper section 4.3). Turns whatever the model returned into a single
// component expression `() => { ... }` that React Live can render.
import { ICON_NAMES } from "./icons";

const KNOWN = new Set([...ICON_NAMES, "React", "Fragment"]);

export function repairCode(raw) {
  if (!raw) return "() => <div />";
  let code = String(raw).trim();

  // Markdown fences and stray backtick quoting
  code = code.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```\s*$/m, "");
  if (/^`[\s\S]*`$/.test(code)) code = code.slice(1, -1);

  // import / export lines, render(...) calls
  code = code.replace(/^\s*import\s[^\n]*\n?/gm, "");
  code = code.replace(/^\s*export\s+default\s+[A-Za-z_$][\w$]*\s*;?\s*$/gm, "");
  code = code.replace(/^\s*export\s+(default\s+)?/gm, "");
  code = code.replace(/^\s*render\s*\(<[\s\S]*?\/>\s*\)\s*;?\s*$/gm, "");
  code = code.trim();

  // const Name = () => {...};  ->  () => {...}
  code = code.replace(/^(const|let|var)\s+[A-Za-z_$][\w$]*\s*(:\s*[^=]+)?=\s*/, "");
  // function Name() {...}  ->  (function Name() {...})
  if (/^function\b/.test(code)) code = `(${code.replace(/;\s*$/, "")})`;
  code = code.replace(/;\s*$/, "");

  // HTML habits inside JSX
  code = code.replace(/<!--[\s\S]*?-->/g, "");
  code = code.replace(/(<[a-z][\w-]*[^>]*?\s)class=/g, "$1className=");
  code = code.replace(/(<[a-z][\w-]*[^>]*?\s)for=/g, "$1htmlFor=");
  code = code.replace(/\sstyle="[^"]*"/g, "");

  // Unknown components (icons not in our list, invented components)
  code = code.replace(/<([A-Z][\w]*)(\s[^<>]*?)?\/>/g, (m, name, rest) =>
    KNOWN.has(name) || isDeclared(code, name) ? m : `<Circle${rest || ""}/>`
  );
  code = code.replace(/<([A-Z][\w]*)(\s[^<>]*?)?>/g, (m, name, rest) =>
    KNOWN.has(name) || isDeclared(code, name) ? m : `<div${rest || ""}>`
  );
  code = code.replace(/<\/([A-Z][\w]*)>/g, (m, name) =>
    KNOWN.has(name) || isDeclared(code, name) ? m : "</div>"
  );

  // Unbalanced braces / parens at the end (truncated answers)
  code = balance(code, "(", ")");
  code = balance(code, "{", "}");

  if (!/^(\(|async\s|function|\(\)\s*=>|[a-z]\w*\s*=>)/.test(code)) code = `() => (${code})`;
  return code;
}

function isDeclared(code, name) {
  return new RegExp(`(const|let|var|function)\\s+${name}\\b`).test(code);
}

function balance(code, open, close) {
  let depth = 0;
  for (const ch of code) {
    if (ch === open) depth++;
    else if (ch === close) depth--;
  }
  return depth > 0 ? code + close.repeat(depth) : code;
}
