// Data model: transcript segments, sections, and how a variation maps onto the source video.
//
// A rough-cut variation is an ordered list of transcript segment indices ("segs").
// Consecutive source segments are merged into one clip. B-roll and text-effect
// variations sit on top of a rough cut and anchor each effect to a segment.

import { SECTION_COLORS } from "./util.js";

export const STAGES = ["roughcut", "broll", "text"];
export const STAGE_LABEL = { roughcut: "Rough Cut", broll: "B-Roll", text: "Text Effects" };

export function buildTranscript(json) {
  const segs = (json.segments || [])
    .map((s) => ({
      start: +s.start,
      end: +s.end,
      text: String(s.text || "").trim(),
      words: (s.words || []).map((w) => ({ word: String(w.word || "").trim(), start: +w.start, end: +w.end })),
    }))
    .filter((s) => s.text && s.end > s.start);
  segs.forEach((s, i) => (s.i = i));
  return segs;
}

// Make LLM-proposed sections contiguous and cover every segment exactly once.
export function normalizeSections(raw, nSegs) {
  let secs = (raw || [])
    .map((s) => ({ title: String(s.title || "Section").trim(), start: Math.round(+s.start), end: Math.round(+s.end), keywords: s.keywords || [] }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end))
    .sort((a, b) => a.start - b.start);
  if (!secs.length) secs = [{ title: "Video", start: 0, end: nSegs - 1, keywords: [] }];
  secs[0].start = 0;
  for (let k = 0; k < secs.length; k++) {
    const nextStart = k + 1 < secs.length ? secs[k + 1].start : nSegs;
    secs[k].start = Math.max(0, Math.min(secs[k].start, nSegs - 1));
    secs[k].end = Math.max(secs[k].start, nextStart - 1);
  }
  secs = secs.filter((s, k) => k === 0 || s.start > secs[k - 1].start);
  secs[secs.length - 1].end = nSegs - 1;
  return secs.map((s, k) => ({ ...s, id: k, color: SECTION_COLORS[k % SECTION_COLORS.length] }));
}

export function sectionIndexOf(project, segIdx) {
  const secs = project.sections;
  for (let k = 0; k < secs.length; k++) if (segIdx >= secs[k].start && segIdx <= secs[k].end) return k;
  return secs.length - 1;
}

export function getVersion(project, id) {
  for (const st of STAGES) {
    const v = project.versions[st].find((x) => x.id === id);
    if (v) return v;
  }
  return null;
}

export function roughcutOf(project, v) {
  if (!v) return null;
  if (v.stage === "roughcut") return v;
  if (v.stage === "broll") return getVersion(project, v.rc);
  return roughcutOf(project, getVersion(project, v.br));
}

export function brollOf(project, v) {
  if (!v) return null;
  if (v.stage === "broll") return v;
  if (v.stage === "text") return getVersion(project, v.br);
  return null;
}

export function cleanSegs(segs, nSegs) {
  const seen = new Set();
  const out = [];
  for (const raw of segs || []) {
    const i = Math.round(+raw);
    if (Number.isFinite(i) && i >= 0 && i < nSegs && !seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
  }
  return out;
}

// Ordered clips for a list of segment indices.
export function computeClips(transcript, segs) {
  const clips = [];
  let t = 0;
  for (const i of segs) {
    const s = transcript[i];
    const last = clips[clips.length - 1];
    if (last && last.segs[last.segs.length - 1] === i - 1) {
      t -= last.srcEnd - last.srcStart;
      last.srcEnd = s.end;
      last.segs.push(i);
      t += last.srcEnd - last.srcStart;
    } else {
      clips.push({ srcStart: s.start, srcEnd: s.end, editStart: t, segs: [i] });
      t += s.end - s.start;
    }
  }
  clips.forEach((c) => (c.editEnd = c.editStart + (c.srcEnd - c.srcStart)));
  return { clips, duration: t };
}

export function editToSource(clips, et) {
  for (let k = 0; k < clips.length; k++) {
    const c = clips[k];
    if (et < c.editEnd || k === clips.length - 1) return { clip: k, src: Math.min(c.srcEnd, c.srcStart + Math.max(0, et - c.editStart)) };
  }
  return { clip: 0, src: 0 };
}

// Source time -> edited time. If the source time is not included, returns the next included moment.
export function sourceToEdit(clips, st) {
  for (const c of clips) if (st >= c.srcStart && st <= c.srcEnd) return { edit: c.editStart + (st - c.srcStart), included: true };
  let best = null;
  for (const c of clips) if (c.srcStart >= st && (!best || c.srcStart < best.srcStart)) best = c;
  return { edit: best ? best.editStart : 0, included: false };
}

function phraseTiming(seg, phrase) {
  if (!phrase || !seg.words || !seg.words.length) return null;
  const norm = (w) => w.toLowerCase().replace(/[^a-z0-9$']/g, "");
  const target = phrase.split(/\s+/).map(norm).filter(Boolean);
  if (!target.length) return null;
  const words = seg.words.map((w) => norm(w.word));
  for (let k = 0; k + target.length <= words.length; k++) {
    if (target.every((t, j) => words[k + j] === t)) return { start: seg.words[k].start, end: seg.words[k + target.length - 1].end };
  }
  const k = words.indexOf(target[0]);
  return k >= 0 ? { start: seg.words[k].start, end: seg.words[k].end } : null;
}

// Everything the views and player need about a variation, in edited and source time.
export function layoutVersion(project, v) {
  const tr = project.transcript;
  const rc = roughcutOf(project, v);
  const segs = rc ? rc.segs : [];
  const { clips, duration } = computeClips(tr, segs);
  const segEdit = new Map();
  for (const c of clips) for (const i of c.segs) segEdit.set(i, c.editStart + (tr[i].start - c.srcStart));

  // Runs of consecutive segments that share a section (in edited order).
  const runs = [];
  for (const i of segs) {
    const sec = sectionIndexOf(project, i);
    const last = runs[runs.length - 1];
    const s = tr[i];
    const e0 = segEdit.get(i);
    if (last && last.section === sec && last.segs[last.segs.length - 1] === i - 1) {
      last.segs.push(i);
      last.editEnd = e0 + (s.end - s.start);
      last.srcEnd = s.end;
    } else if (last && last.section === sec) {
      last.segs.push(i);
      last.editEnd = e0 + (s.end - s.start);
      last.srcParts.push([s.start, s.end]);
    } else {
      runs.push({ section: sec, segs: [i], editStart: e0, editEnd: e0 + (s.end - s.start), srcStart: s.start, srcEnd: s.end, srcParts: [] });
    }
  }
  for (const r of runs) r.srcParts.unshift([r.srcStart, r.srcEnd]);

  const br = brollOf(project, v);
  const brolls = (br ? br.items : [])
    .filter((it) => segEdit.has(it.seg))
    .map((it) => {
      const s = tr[it.seg];
      const len = Math.min(Math.max(s.end - s.start, 2), 6);
      return { ...it, srcStart: s.start, srcEnd: s.start + len, editStart: segEdit.get(it.seg), editEnd: segEdit.get(it.seg) + len };
    })
    .sort((a, b) => a.editStart - b.editStart);

  const texts = (v.stage === "text" ? v.items : [])
    .filter((it) => segEdit.has(it.seg))
    .map((it) => {
      const s = tr[it.seg];
      const pt = phraseTiming(s, it.text);
      const start = pt ? pt.start : s.start;
      const end = Math.min(Math.max(start + 2.5, s.end), start + 5);
      const e0 = segEdit.get(it.seg) + (start - s.start);
      return { ...it, style: it.style || v.style, srcStart: start, srcEnd: end, editStart: e0, editEnd: e0 + (end - start) };
    })
    .sort((a, b) => a.editStart - b.editStart);

  const sectionsIncluded = new Set(runs.map((r) => r.section)).size;
  return { rc, segs, segSet: new Set(segs), clips, duration, runs, brolls, texts, sectionsIncluded, segEdit };
}

export function headerText(project, v, lay) {
  const id = "#" + v.label;
  if (v.stage === "roughcut") return `${id} | ${fmt(lay.duration)} | ${lay.sectionsIncluded} Sections`;
  if (v.stage === "broll") return `${id} | Count: ${v.items.length} | Media: ${cap(v.media || "mixed")}`;
  return `${id} | Count: ${v.items.length} | Style: ${styleLabel(v.style)}`;
}

export function styleLabel(s) {
  return { title: "Title", subtitle: "Subtitle", lower: "Lower Thirds" }[s] || cap(s || "mixed");
}

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
function fmt(sec) {
  sec = Math.round(sec);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

// --- B-roll library search (stand-in for a stock media API) ---
export function searchBroll(library, keyword, type) {
  const q = String(keyword || "").toLowerCase().trim();
  if (!q) return [];
  const qWords = q.split(/\W+/).filter((w) => w.length > 2);
  const scored = [];
  for (const item of library) {
    let score = 0;
    for (const k of item.keywords || []) {
      const kk = k.toLowerCase();
      if (kk === q) score = Math.max(score, 10);
      else if (kk.includes(q) || q.includes(kk)) score = Math.max(score, 6);
      else {
        const kw = kk.split(/\W+/);
        const overlap = qWords.filter((w) => kw.some((x) => x === w || x.startsWith(w) || w.startsWith(x))).length;
        if (overlap) score = Math.max(score, 2 + overlap);
      }
    }
    if (score > 0) scored.push({ item, score: score + (type && item.type === type ? 3 : 0) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
