import { isKnownIcon } from './icons.js';

// Section 4.3: heuristic rules, implemented with regular expressions, that detect
// and repair malformed React. Returns the code unchanged when nothing applies.
export function repairCode(input) {
  let code = String(input ?? '').trim();

  const fence = code.match(/```(?:[a-z]+)?\s*\n([\s\S]*?)```/i);
  if (fence) code = fence[1].trim();
  if (/^`[\s\S]*`$/.test(code)) code = code.slice(1, -1).trim();

  code = code
    .replace(/^\s*import\s[^\n]*\n?/gm, '')
    .replace(/^\s*export\s+default\s+[A-Z]\w*;?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^\s*export\s+/gm, '')
    .replace(/^\s*render\(<[^\n]*\);?\s*$/gm, '')
    .trim();

  code = code
    .replace(/^(?:const|let|var)\s+[A-Z]\w*\s*(?::[^=]+)?=\s*/, '')
    .replace(/^function(?:\s+\w+)?\s*\(([^)]*)\)\s*\{/, '($1) => {')
    .replace(/;\s*$/, '')
    .trim();

  code = code
    .replace(/\bclass=(["{])/g, 'className=$1')
    .replace(/\bfor=(["{])/g, 'htmlFor=$1')
    .replace(/\bfixed bottom-0\b/g, 'absolute bottom-0')
    .replace(/\bmin-h-screen\b/g, 'min-h-full')
    .replace(/\bh-screen\b/g, 'h-full')
    .replace(/\bw-screen\b/g, 'w-full')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Images must come from /stock/.
  code = code.replace(/src=(["'])(?!\/stock\/)[^"']*\1/g, 'src="/stock/landscape0.jpg"');

  // Unknown capitalised JSX tags would throw at render: swap them for a neutral icon.
  code = code.replace(/<(\/?)([A-Z][A-Za-z0-9]*)(?![.\w])/g, (match, slash, name) => {
    if (name === 'React' || isKnownIcon(name) || declared(code, name)) return match;
    return `<${slash}Circle`;
  });

  return code;
}

function declared(code, name) {
  return new RegExp(`(?:const|let|var|function)\\s+${name}\\b`).test(code);
}
