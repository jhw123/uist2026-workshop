// Fine-grained semantic-diff edits: swap Tailwind class strings in code
// directly (no model call).

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function pattern(from) {
  const parts = from.trim().split(/\s+/).map(esc).join('\\s+');
  return new RegExp(`(^|[\\s"'\`{])${parts}(?=$|[\\s"'\`}])`, 'g');
}

export function hasClasses(code, cls) {
  if (!cls || !cls.trim()) return false;
  return pattern(cls).test(code);
}

export function replaceClasses(code, from, to) {
  if (!from || !from.trim()) return code;
  return code.replace(pattern(from), (m, pre) => pre + (to || '').trim()).replace(/className="\s+/g, 'className="');
}
