// LLM prompts for VideoDiff (paper §4.3 and Appendix B), sent through the workshop
// LLM bridge. Every call asks for JSON. When the bridge is unreachable and the user
// turns on the offline stub, simple heuristics stand in (clearly labelled in the UI).

import { cleanSegs, computeClips, layoutVersion, normalizeSections, searchBroll, sectionIndexOf, getVersion, roughcutOf } from "./model.js";
import { fmtTime } from "./util.js";

export const settings = { stub: false };

// ---------------- Augmentation prompts (Appendix B, Table 5) ----------------
export const AUG = {
  roughcut: {
    length: [
      { key: "short", label: "< 2 min", prompt: "Make the total duration to be less than 2 minutes." },
      { key: "medium", label: "2-4 min", prompt: "Make the total duration to be 2-4 minutes." },
      { key: "long", label: "4-5 min", prompt: "Make the total duration to be 4-5 minutes." },
    ],
    focus: [
      { key: "focused", label: "Focused", prompt: "Focus on 1-2 sections for a coherent summary, minimize additional sections." },
      { key: "balanced", label: "Balanced", prompt: "Focus on 3-4 sections, minimize additional sections." },
      { key: "diverse", label: "Diverse", prompt: "Extract short parts from many sections for diversity." },
    ],
  },
  broll: {
    media: [
      { key: "illustration", label: "Illustration", prompt: "Illustration" },
      { key: "photo", label: "Photo", prompt: "Photo" },
      { key: "video", label: "Video", prompt: "Video" },
    ],
    frequency: [
      { key: "few", label: "2-3", prompt: "Limit B-Rolls to 2-3.", min: 2, max: 3 },
      { key: "some", label: "4-5", prompt: "Limit B-Rolls to 4-5.", min: 4, max: 5 },
      { key: "many", label: "7-10", prompt: "Limit B-Rolls to 7-10.", min: 7, max: 10 },
    ],
  },
  text: {
    style: [
      { key: "lower", label: "Lower Thirds", prompt: "Lower" },
      { key: "title", label: "Title", prompt: "Title" },
      { key: "subtitle", label: "Subtitle", prompt: "Subtitle" },
    ],
    frequency: [
      { key: "few", label: "2-3", prompt: "Limit pull quote sentences to 2-3.", min: 2, max: 3 },
      { key: "some", label: "4-5", prompt: "Limit pull quote sentences to 4-5.", min: 4, max: 5 },
      { key: "many", label: "7-10", prompt: "Limit pull quote sentences to 7-10.", min: 7, max: 10 },
    ],
  },
};

// n combinations of the two attributes of a stage, cycling through the 3x3 grid.
export function augmentations(stage, n) {
  const [a, b] = Object.keys(AUG[stage]);
  const combos = [];
  for (const x of AUG[stage][a]) for (const y of AUG[stage][b]) combos.push({ [a]: x, [b]: y });
  // Shuffle deterministically-ish so the first few are already diverse.
  const order = [0, 4, 8, 2, 6, 1, 5, 7, 3];
  return Array.from({ length: n }, (_, k) => combos[order[k % 9]]);
}

// ---------------- LLM transport ----------------
export async function callLLM(system, user, { signal } = {}) {
  if (settings.stub) throw new Error("stub");
  const r = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || data.error || `LLM call failed (${r.status})`);
  const text = data.choices?.[0]?.message?.content || "";
  return parseJSON(text);
}

function parseJSON(text) {
  const t = String(text).replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("The model did not return JSON.");
  }
}

// ---------------- Prompt helpers ----------------
function transcriptLines(tr, idxs) {
  return idxs.map((i) => `[${i}] (${fmtTime(tr[i].start)}, ${(tr[i].end - tr[i].start).toFixed(1)}s) ${tr[i].text}`).join("\n");
}

function sectionList(project) {
  return project.sections.map((s) => `- "${s.title}": segments ${s.start}-${s.end}`).join("\n");
}

function describeVersion(project, v) {
  const tr = project.transcript;
  if (v.stage === "roughcut") {
    const lay = layoutVersion(project, v);
    const secs = lay.runs.map((r) => `${project.sections[r.section].title} (${r.segs.length} seg)`).join(" > ");
    return `#${v.label}: ${fmtTime(lay.duration)}, segments [${v.segs.join(",")}], sections: ${secs}`;
  }
  if (v.stage === "broll") {
    return `#${v.label} (media ${v.media || "mixed"}): ` + v.items.map((it, k) => `${k + 1}) segment ${it.seg} "${it.keyword}" [${it.mediaItem ? it.mediaItem.type + ": " + it.mediaItem.title : "no match"}]`).join("; ");
  }
  return `#${v.label} (style ${v.style}): ` + v.items.map((it, k) => `${k + 1}) segment ${it.seg} "${it.text}" (${it.style || v.style})`).join("; ");
}

const EDITOR_SYSTEM =
  "You are VideoDiff, an AI video editing assistant. You edit narrative videos (vlogs, how-to, tours) using only their transcript. " +
  "Transcript segments are given as [index] (start time, duration) text. Always answer with a single JSON object and nothing else.";

// ---------------- 1) Sections and visually concrete keywords ----------------
export async function analyzeVideo(project) {
  const tr = project.transcript;
  const all = tr.map((s) => s.i);
  if (settings.stub) return stubAnalyze(project);

  const secPrompt =
    `Segment this video transcript into thematically coherent sections, in time order.\n` +
    `Rules: 4 to 8 sections; every segment belongs to exactly one section; sections are contiguous and do not overlap; ` +
    `titles are 1-3 words (e.g. "Introduction", "Garden Plans", "Preparing Meal"); give 3-5 topic keywords per section.\n` +
    `Return {"sections":[{"title":"...","start":<first segment index>,"end":<last segment index>,"keywords":["..."]}]}\n\n` +
    `Transcript (${tr.length} segments, indices 0-${tr.length - 1}):\n${transcriptLines(tr, all)}`;

  const kwPrompt =
    `Identify visually concrete keywords in each transcript segment: words or short noun phrases that name things a viewer could see ` +
    `on screen (objects, places, food, people, animals, actions with a clear visual). Skip abstract words, filler and pronouns.\n` +
    `Examples:\n` +
    `"We went to a baseball game with some friends" -> ["baseball game"]\n` +
    `"I did not want to get in bulk at Sam's club" -> ["Sam's club"]\n` +
    `"It was only 79 cents. I thought that'd be good for the pool" -> ["pool"]\n` +
    `"So I think that's going to be really fun" -> []\n` +
    `Copy each keyword exactly as it appears in the segment text. Return {"keywords":{"<segment index>":["..."]}} listing only segments with keywords.\n\n` +
    `Transcript:\n${transcriptLines(tr, all)}`;

  const [secRes, kwRes] = await Promise.all([callLLM(EDITOR_SYSTEM, secPrompt), callLLM(EDITOR_SYSTEM, kwPrompt)]);
  const sections = normalizeSections(secRes.sections, tr.length);
  const keywords = {};
  for (const [k, list] of Object.entries(kwRes.keywords || {})) {
    const i = +k;
    if (!tr[i] || !Array.isArray(list)) continue;
    const kept = list.map(String).filter((w) => w && tr[i].text.toLowerCase().includes(w.toLowerCase()));
    if (kept.length) keywords[i] = kept;
  }
  return { sections, keywords };
}

// ---------------- 2) Stage generations with augmentation prompts ----------------
export async function generateRoughCut(project, aug) {
  if (settings.stub) return stubRoughCut(project, aug);
  const tr = project.transcript;
  const total = tr.reduce((t, s) => t + (s.end - s.start), 0);
  const prompt =
    `Create a rough cut of this video by selecting transcript segments that tell a compelling story. ` +
    `Avoid cutting mid-sentence; keep the narrative coherent. Keep segments in chronological order.\n` +
    `Source duration: ${fmtTime(total)}.\n` +
    `Constraints:\n- ${aug.length.prompt}\n- ${aug.focus.prompt}\n\n` +
    `Sections:\n${sectionList(project)}\n\nTranscript:\n${transcriptLines(tr, tr.map((s) => s.i))}\n\n` +
    `Return {"segments":[<segment indices in playback order>],"summary":"<one short sentence describing this cut>"}`;
  const res = await callLLM(EDITOR_SYSTEM, prompt);
  let segs = cleanSegs(res.segments, tr.length).sort((a, b) => a - b);
  if (!segs.length) throw new Error("The model returned an empty rough cut.");
  return { segs, note: res.summary || "" };
}

function libraryKeywords(library) {
  const set = new Set();
  for (const it of library) for (const k of it.keywords || []) set.add(k);
  return [...set];
}

export async function generateBroll(project, rc, aug, seed) {
  if (settings.stub) return stubBroll(project, rc, aug, seed);
  const tr = project.transcript;
  const kws = libraryKeywords(project.library);
  const prompt =
    `Suggest B-roll for this rough cut: pick transcript segments where showing an image or clip would illustrate what is being said, ` +
    `and give a short search keyword for the stock media search.\n` +
    `Media type: ${aug.media.prompt}. ${aug.frequency.prompt}\n` +
    (kws.length ? `The stock library can find these keywords (prefer them): ${kws.join(", ")}\n` : "") +
    `Spread B-rolls across the video; at most one per segment.\n\nRough cut transcript:\n${transcriptLines(tr, rc.segs)}\n\n` +
    `Return {"brolls":[{"segment":<index>,"keyword":"..."}]}`;
  const res = await callLLM(EDITOR_SYSTEM, prompt);
  const items = resolveBrollItems(project, rc, res.brolls, aug.media.key, seed);
  return { items: limitItems(items, aug.frequency.max) };
}

export async function generateText(project, br, aug) {
  if (settings.stub) return stubText(project, br, aug);
  const tr = project.transcript;
  const rc = roughcutOf(project, br);
  const prompt =
    `Suggest text effects (pull quotes) for this video: pick narration sentences worth emphasising and, for each, a short phrase ` +
    `of 1-4 words copied exactly from that segment to show on screen (e.g. "Almost $400", "Really good", "Sam's Club").\n` +
    `Text style: ${aug.style.prompt}. ${aug.frequency.prompt}\nSpread them across the video; at most one per segment.\n\n` +
    `Rough cut transcript:\n${transcriptLines(tr, rc.segs)}\n\nReturn {"effects":[{"segment":<index>,"text":"..."}]}`;
  const res = await callLLM(EDITOR_SYSTEM, prompt);
  const items = resolveTextItems(project, rc, res.effects, aug.style.key);
  return { items: limitItems(items, aug.frequency.max) };
}

function limitItems(items, max) {
  return items.slice(0, max);
}

// Turn {segment, keyword, from?, media?} suggestions into items with a chosen library item.
export function resolveBrollItems(project, rc, raw, mediaPref, seed = 0) {
  const inCut = new Set(rc.segs);
  const used = new Set();
  const out = [];
  for (const b of raw || []) {
    const seg = Math.round(+b.segment);
    if (!inCut.has(seg) || out.some((o) => o.seg === seg)) continue;
    // Recombination: copy the B-roll exactly from another version when asked.
    if (b.from) {
      const src = findByLabel(project, "broll", b.from);
      const copy = src && (src.items.find((it) => it.seg === seg) || src.items.find((it) => it.keyword === b.keyword));
      if (copy) {
        out.push({ ...copy, seg });
        continue;
      }
    }
    const keyword = String(b.keyword || "").trim();
    const want = b.media || mediaPref;
    const matches = searchBroll(project.library, keyword, want);
    const typed = matches.filter((m) => !want || m.type === want);
    const pool = (typed.length ? typed : matches).filter((m) => !used.has(m.file));
    const pick = pool.length ? pool[seed % pool.length] : matches[0] || null;
    if (pick) used.add(pick.file);
    out.push({ seg, keyword: keyword || "b-roll", mediaItem: pick || null });
  }
  return out.sort((a, b) => rc.segs.indexOf(a.seg) - rc.segs.indexOf(b.seg));
}

export function resolveTextItems(project, rc, raw, style) {
  const inCut = new Set(rc.segs);
  const out = [];
  for (const e of raw || []) {
    const seg = Math.round(+e.segment);
    if (!inCut.has(seg) || out.some((o) => o.seg === seg)) continue;
    const text = String(e.text || "").trim();
    if (!text) continue;
    out.push({ seg, text, style: e.style && e.style !== style ? e.style : undefined });
  }
  return out.sort((a, b) => rc.segs.indexOf(a.seg) - rc.segs.indexOf(b.seg));
}

export function findByLabel(project, stage, ref) {
  const label = String(ref).replace(/^#/, "").trim();
  return project.versions[stage].find((v) => v.label === label || String(v.num) === label);
}

// ---------------- 3) Prompted generation, refinement and recombination ----------------
// mode: "new" (generate new / recombine), "surprise", "edit" (refine target version)
export async function promptGenerate(project, stage, { mode, prompt, target, base }) {
  if (settings.stub) return stubPrompt(project, stage, { mode, prompt, target, base });
  const tr = project.transcript;
  const others = project.versions[stage].filter((v) => !v.archived);
  const existing = others.map((v) => describeVersion(project, v)).join("\n");

  let task;
  if (mode === "edit") task = `Edit version #${target.label} following the user's instruction: "${prompt}". Change only what the instruction asks.\nVersion to edit: ${describeVersion(project, target)}`;
  else if (mode === "surprise") task = `Create one new alternative that is clearly different from all existing variations (e.g. different length, sections, placement, style or count).`;
  else task = `Create one new variation following the user's instruction: "${prompt}". If the instruction refers to versions by ID (e.g. #3), use and combine their content as asked.`;

  let context, schema;
  if (stage === "roughcut") {
    context = `Sections:\n${sectionList(project)}\n\nFull source transcript:\n${transcriptLines(tr, tr.map((s) => s.i))}`;
    schema = `{"segments":[<segment indices in playback order>],"summary":"<one sentence describing the specific changes made${mode === "edit" ? " compared to the original" : ""}>"}`;
  } else if (stage === "broll") {
    const rc = base;
    const kws = libraryKeywords(project.library);
    context =
      `Rough cut #${rc.label} transcript (B-roll can only be placed on these segments):\n${transcriptLines(tr, rc.segs)}\n` +
      (kws.length ? `Stock library keywords (prefer them): ${kws.join(", ")}\n` : "") +
      `Media types: photo, illustration, video.`;
    schema = `{"brolls":[{"segment":<index>,"keyword":"...","media":"photo|illustration|video","from":"<optional version id like #3 to reuse that version's exact B-roll at this segment>"}],"summary":"<one sentence describing the specific changes>"}`;
  } else {
    const rc = roughcutOf(project, base);
    context = `Rough cut transcript (text effects can only be placed on these segments):\n${transcriptLines(tr, rc.segs)}\nStyles: title, subtitle, lower (lower thirds).`;
    schema = `{"style":"title|subtitle|lower","effects":[{"segment":<index>,"text":"<1-4 words copied from the segment>","style":"<optional per-effect style>"}],"summary":"<one sentence describing the specific changes>"}`;
  }

  const user = `${task}\n\nExisting ${stage === "roughcut" ? "rough cut" : stage === "broll" ? "B-roll" : "text effect"} variations:\n${existing || "(none)"}\n\n${context}\n\nReturn ${schema}`;
  const res = await callLLM(EDITOR_SYSTEM, user);

  if (stage === "roughcut") {
    const segs = cleanSegs(res.segments, tr.length);
    if (!segs.length) throw new Error("The model returned an empty rough cut.");
    return { segs, summary: res.summary || "" };
  }
  if (stage === "broll") {
    const items = resolveBrollItems(project, base, res.brolls, target?.media, (project.counters.broll || 0) + 1);
    const types = new Set(items.map((i) => i.mediaItem?.type).filter(Boolean));
    return { items, media: types.size === 1 ? [...types][0] : "mixed", summary: res.summary || "" };
  }
  const style = ["title", "subtitle", "lower"].includes(res.style) ? res.style : target?.style || "title";
  const items = resolveTextItems(project, roughcutOf(project, base), res.effects, style);
  return { items, style, summary: res.summary || "" };
}

// ---------------- Offline stub (no LLM) ----------------
const STOP = new Set("the a an and or but so to of in on at for with this that it is was we i you he she they my our your just like um uh yeah really very going get got have has be been are were do did not no yes there here what when then than them its it's i'm we're you're that's don't".split(" "));

function stubAnalyze(project) {
  const tr = project.transcript;
  const n = tr.length;
  const k = Math.max(3, Math.min(7, Math.round(n / 10)));
  const libKw = libraryKeywords(project.library).map((w) => w.toLowerCase());
  const keywords = {};
  tr.forEach((s) => {
    const found = libKw.filter((w) => s.text.toLowerCase().includes(w));
    if (found.length) keywords[s.i] = found.map((w) => s.text.match(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))[0]);
  });
  const raw = Array.from({ length: k }, (_, j) => {
    const start = Math.floor((j * n) / k);
    const end = Math.floor(((j + 1) * n) / k) - 1;
    const words = {};
    for (let i = start; i <= end; i++)
      for (const w of tr[i].text.toLowerCase().match(/[a-z']+/g) || []) if (w.length > 3 && !STOP.has(w)) words[w] = (words[w] || 0) + 1;
    const top = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 4).map((e) => e[0]);
    const title = j === 0 ? "Introduction" : top[0] ? top[0][0].toUpperCase() + top[0].slice(1) : `Part ${j + 1}`;
    return { title, start, end, keywords: top };
  });
  return { sections: normalizeSections(raw, n), keywords };
}

function stubRoughCut(project, aug) {
  const tr = project.transcript;
  const target = { short: 90, medium: 180, long: 270 }[aug.length.key];
  const nSec = { focused: 2, balanced: 4, diverse: project.sections.length }[aug.focus.key];
  const r = Math.random;
  const chosen = [...project.sections].sort(() => r() - 0.5).slice(0, nSec);
  const perSec = target / chosen.length;
  const segs = [];
  for (const s of chosen) {
    let t = 0;
    const startAt = s.start + Math.floor(r() * Math.max(1, (s.end - s.start) / 3));
    for (let i = startAt; i <= s.end && t < perSec; i++) {
      segs.push(i);
      t += tr[i].end - tr[i].start;
    }
  }
  return { segs: segs.sort((a, b) => a - b), note: "(offline stub)" };
}

function stubBroll(project, rc, aug, seed) {
  const cand = rc.segs.filter((i) => project.keywords[i]);
  const n = aug.frequency.min + Math.floor(Math.random() * (aug.frequency.max - aug.frequency.min + 1));
  const step = Math.max(1, Math.floor(cand.length / n));
  const raw = cand.filter((_, k) => k % step === seed % step).slice(0, n).map((i) => ({ segment: i, keyword: project.keywords[i][0] }));
  return { items: resolveBrollItems(project, rc, raw, aug.media.key, seed) };
}

function stubText(project, br, aug) {
  const rc = roughcutOf(project, br);
  const cand = rc.segs.filter((i) => project.keywords[i]);
  const n = aug.frequency.min + Math.floor(Math.random() * (aug.frequency.max - aug.frequency.min + 1));
  const picked = [...cand].sort(() => Math.random() - 0.5).slice(0, n).map((i) => ({ segment: i, text: project.keywords[i][0] }));
  return { items: resolveTextItems(project, rc, picked, aug.style.key) };
}

function stubPrompt(project, stage, { mode, target, base }) {
  const note = mode === "edit" ? "Offline stub: the prompt was not interpreted; made a random variation of the original." : "Offline stub: generated a random new variation.";
  if (stage === "roughcut") {
    const src = target ? target.segs : project.transcript.map((s) => s.i);
    const segs = src.filter(() => Math.random() > 0.25);
    return { segs: segs.length ? segs : src, summary: note };
  }
  if (stage === "broll") {
    const aug = { media: AUG.broll.media[Math.floor(Math.random() * 3)], frequency: AUG.broll.frequency[1] };
    return { ...stubBroll(project, base, aug, Math.floor(Math.random() * 5)), media: aug.media.key, summary: note };
  }
  const aug = { style: AUG.text.style[Math.floor(Math.random() * 3)], frequency: AUG.text.frequency[1] };
  return { ...stubText(project, base, aug), style: aug.style.key, summary: note };
}

export { computeClips, sectionIndexOf, getVersion };
