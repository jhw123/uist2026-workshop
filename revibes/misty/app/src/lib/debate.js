// Remix: "the inputs argue". Before a blend, the reference example and the user's UI debate
// what the blend should take from the example. The user sides with or against each
// proposal, and the blend prompt then follows those rulings.

export const SPEAKERS = {
  example: { name: 'Example', pitch: 245, timbre: 'sawtooth' },
  ui: { name: 'Your UI', pitch: 165, timbre: 'square' },
};

const MOODS = new Set(['insist', 'question', 'agree', 'joke']);

export function debatePrompt({ code, kind, aspects = [], custom = '', targetHtml = '' }) {
  const scope =
    kind === 'global'
      ? 'The user wants to blend the whole reference screenshot into the whole UI.'
      : `The user dropped a section of the reference onto this part of the UI: ${String(targetHtml).slice(0, 1200)}
They asked to blend: ${[...aspects.filter((a) => a !== 'Customize'), custom].filter(Boolean).join(', ') || 'anything useful'}.`;
  return `Two designs are about to be blended (conceptual blending of UIs). Write a short, lively debate between them.

- "example" is the reference image attached. It is proud of its visual style and wants its ideas adopted.
- "ui" is the work-in-progress React + Tailwind UI below. It protects its content, purpose and users.

${scope}

The UI's code:
${String(code).slice(0, 6000)}

Rules:
- 6 turns, alternating, starting with "example". Each line at most 18 words, in plain, playful language, like characters in a life-simulation game.
- Every turn proposes or opposes ONE concrete, visible design change (colors, layout, spacing, type, imagery, an element to add or keep).
- Refer to what is really in the image and in the code. Never copy the example's text content into the UI.
- mood is one of: insist, question, agree, joke.
- End with a fair compromise in one sentence.

Return JSON only:
{"turns":[{"speaker":"example","line":"...","mood":"insist","proposal":"short imperative change, e.g. 'Use a dark background'"}],"compromise":"..."}`;
}

export function normalizeDebate(raw) {
  const turns = (Array.isArray(raw?.turns) ? raw.turns : [])
    .map((t, i) => ({
      id: `t${i}`,
      speaker: t?.speaker === 'ui' ? 'ui' : 'example',
      line: String(t?.line ?? '').trim(),
      mood: MOODS.has(t?.mood) ? t.mood : 'insist',
      proposal: String(t?.proposal ?? '').trim(),
      ruling: null, // 'keep' | 'reject' | null
    }))
    .filter((t) => t.line)
    .slice(0, 8);
  if (!turns.length) throw new Error('The debate came back empty.');
  return { turns, compromise: String(raw?.compromise ?? '').trim() };
}

/** Text appended to the blend prompt, so the blend follows the user's rulings. */
export function rulingsForPrompt(debate) {
  if (!debate) return '';
  const keep = debate.turns.filter((t) => t.ruling === 'keep' && t.proposal);
  const reject = debate.turns.filter((t) => t.ruling === 'reject' && t.proposal);
  const open = debate.turns.filter((t) => !t.ruling && t.proposal);
  const list = (ts) => ts.map((t) => `  - ${t.proposal} (${SPEAKERS[t.speaker].name.toLowerCase()})`).join('\n');
  let s = `

Before this blend, the reference and the current UI debated, and the user ruled on their proposals.`;
  if (keep.length) s += `\nThe user AGREED with these, so apply them:\n${list(keep)}`;
  if (reject.length) s += `\nThe user DISAGREED with these points, so go against them (do not add what they propose, and feel free to change what they want to keep):\n${list(reject)}`;
  if (open.length) s += `\nThe user did not rule on these; use your judgment:\n${list(open)}`;
  if (debate.compromise) s += `\nThe proposed compromise was: ${debate.compromise}`;
  if (debate.note?.trim()) s += `\nThe user added: "${debate.note.trim()}". Follow it.`;
  s += `\nMention the agreed proposals in categorizedChanges.`;
  return s;
}

/** The example character wears the example's average color (lightened). */
export async function averageColor(src) {
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = src;
    });
    const c = document.createElement('canvas');
    c.width = 24;
    c.height = 24;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 24, 24);
    const d = g.getImageData(0, 0, 24, 24).data;
    // Average the colorful pixels only, so a mostly white screenshot still gets its accent color.
    const sum = (keep) => {
      let r = 0;
      let gr = 0;
      let b = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [R, G, B] = [d[i], d[i + 1], d[i + 2]];
        if (!keep(R, G, B)) continue;
        r += R;
        gr += G;
        b += B;
        n++;
      }
      return n ? [r / n, gr / n, b / n, n] : null;
    };
    const colorful = sum((R, G, B) => Math.max(R, G, B) - Math.min(R, G, B) > 40);
    const avg = colorful && colorful[3] >= 12 ? colorful : sum(() => true);
    const mix = (v) => Math.round(v * 0.8 + 255 * 0.2);
    return `rgb(${mix(avg[0])}, ${mix(avg[1])}, ${mix(avg[2])})`;
  } catch {
    return '#9DB0E0';
  }
}
