// Heuristic, regex-based repair of malformed React code (paper §4.3).
// The model is asked for a bare component `() => { ... }` with no imports or
// exports; these rules coerce the most common deviations into that shape.

export function repairCode(input) {
  if (!input) return '';
  let code = String(input);

  // Markdown fences around the code.
  const fence = code.match(/```(?:jsx|tsx|javascript|js|react)?\s*\n([\s\S]*?)```/);
  if (fence) code = fence[1];

  // The paper's prompt shows the code wrapped in backticks/quotes.
  code = code.trim().replace(/^[`'‘’]+|[`'‘’]+$/g, '').trim();

  // Escaped newlines left over from double-encoded JSON.
  if (!code.includes('\n') && code.includes('\\n')) {
    code = code.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\t/g, '  ');
  }

  // Import lines and `render(...)` calls.
  code = code.replace(/^\s*import\s[^;\n]*;?\s*$/gm, '');
  code = code.replace(/^\s*render\s*\(.*\);?\s*$/gm, '');

  // `export default X;` at the end.
  code = code.replace(/^\s*export\s+default\s+[A-Za-z_$][\w$]*\s*;?\s*$/gm, '');
  code = code.replace(/\bexport\s+default\s+/g, '').replace(/\bexport\s+(?=(const|function|let)\b)/g, '');

  code = code.trim();

  // Top-level declarations (lines starting at column 0).
  const topDecls = [...code.matchAll(/^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)];

  // Exactly one `const Name = () => {...}` -> `() => {...}`
  const named = code.match(/^(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::[^=]+)?=\s*(?=\(|function|async)/);
  if (named && topDecls.length === 1) {
    code = code.slice(named[0].length);
  } else if (topDecls.length > 0 && !/^\s*(\(|function\s*\()/.test(code)) {
    // Several declarations: wrap them and return the last capitalised one.
    const caps = topDecls.map((m) => m[1]).filter((n) => /^[A-Z]/.test(n));
    const last = caps.length ? caps[caps.length - 1] : topDecls[topDecls.length - 1][1];
    code = `() => {\n${code}\nreturn <${last} />;\n}`;
  }

  // Trailing semicolon after the component.
  code = code.replace(/;\s*$/, '');

  // Common JSX attribute slips.
  code = code.replace(/\sclass=(["{])/g, ' className=$1');
  code = code.replace(/\sfor=(["{])/g, ' htmlFor=$1');
  code = code.replace(/<(img|input|br|hr)(\s[^<>{}]*?)?(?<!\/)>/g, (m, tag, attrs = '') => `<${tag}${attrs} />`);

  // HTML comments are not valid JSX.
  code = code.replace(/<!--([\s\S]*?)-->/g, '{/*$1*/}');

  return code.trim();
}

// Extract a JSON object from a model reply (fences, prose around it, etc.).
export function parseJsonReply(text) {
  if (typeof text !== 'string') return text;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch (_) {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const slice = t.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch (_) {
        // Code given as a template literal (as in the paper's prompt).
        const fixed = slice.replace(/("?updatedCode"?\s*:\s*)`([\s\S]*?)`(\s*[,}])/, (m, k, body, tail) =>
          `"updatedCode": ${JSON.stringify(body)}${tail}`).replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":');
        return JSON.parse(fixed);
      }
    }
    throw new Error('The model did not return JSON.');
  }
}

// The model sometimes returns the whole component on one line. Break it at
// tag boundaries and indent by nesting depth so it reads well in the editor.
export function formatJsx(code) {
  const lines = code.split('\n');
  if (lines.length > code.length / 160) return code;
  const broken = code
    .replace(/([^=\s])\s*>\s*</g, '$1>\n<')
    .replace(/\breturn\s*\(\s*</, 'return (\n<')
    .replace(/>\s*\)\s*;?\s*\}\s*$/, '>\n);\n}')
    .replace(/^\(\)\s*=>\s*\{\s*/, '() => {\n');
  let depth = 0;
  return broken.split('\n').map((raw) => {
    const line = raw.trim();
    if (/^<\//.test(line) || /^\)/.test(line) || line === '}') depth = Math.max(0, depth - 1);
    const out = '  '.repeat(depth) + line;
    const opens = /^<[A-Za-z]/.test(line) && !/\/>$/.test(line) && !/<\/[\w.]*>$/.test(line);
    if (opens || /\($/.test(line) || /\{$/.test(line)) depth++;
    return out;
  }).join('\n');
}
