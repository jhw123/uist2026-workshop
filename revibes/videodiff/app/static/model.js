// Pure helpers over the transcript and a version.
// A version keeps a list of source sentence indices ("keep"). Its edited video is
// the contiguous runs of kept sentences played one after another.

export const SECTION_COLORS = [
  '#f3e9a6', '#86cdb8', '#b8b2dc', '#7fa9d4', '#f4b26a', '#a8d672',
  '#f2b7d2', '#c9c9c9', '#9ed3e6', '#e6a39b', '#d4c08a', '#b6dcb0',
];

export function fmt(t) {
  t = Math.max(0, Math.round(t || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export class Model {
  constructor(project, analysis) {
    this.segs = project.segments;
    this.sections = analysis.sections;
    this.keywords = analysis.keywords || [];
    this.secOf = new Array(this.segs.length).fill(0);
    this.sections.forEach((s, k) => {
      s.color = SECTION_COLORS[k % SECTION_COLORS.length];
      for (let i = s.start; i <= s.end; i++) this.secOf[i] = k;
    });
    this.duration = project.duration || (this.segs.length ? this.segs[this.segs.length - 1].end + 1 : 0);
    this._cache = new Map();
  }

  // contiguous runs with their source and edited times
  runs(keep) {
    const key = keep.join(',');
    if (this._cache.has(key)) return this._cache.get(key);
    const sorted = [...new Set(keep)].filter(i => i >= 0 && i < this.segs.length).sort((a, b) => a - b);
    const runs = [];
    for (const i of sorted) {
      const r = runs[runs.length - 1];
      if (r && i === r.b + 1) r.b = i; else runs.push({ a: i, b: i });
    }
    let ed = 0;
    for (const r of runs) {
      r.s = this.segs[r.a].start; r.e = this.segs[r.b].end;
      r.ed = ed; ed += r.e - r.s; r.edEnd = ed;
    }
    runs.total = ed;
    this._cache.set(key, runs);
    return runs;
  }

  editedDuration(keep) { return this.runs(keep).total; }

  sectionsIn(keep) { return [...new Set(keep.map(i => this.secOf[i]))].sort((a, b) => a - b); }

  srcToEd(keep, t) {
    for (const r of this.runs(keep)) if (t >= r.s - 0.01 && t <= r.e + 0.01) return r.ed + Math.min(Math.max(t - r.s, 0), r.e - r.s);
    return null;
  }

  // edited time of the first kept moment at or after source time t
  srcToEdNext(keep, t) {
    const runs = this.runs(keep);
    for (const r of runs) {
      if (t <= r.e) return r.ed + Math.max(0, t - r.s);
    }
    return runs.length ? runs.total : 0;
  }

  edToSrc(keep, et) {
    const runs = this.runs(keep);
    for (const r of runs) if (et < r.edEnd) return r.s + Math.max(0, et - r.ed);
    const last = runs[runs.length - 1];
    return last ? last.e : 0;
  }

  // Pieces of the edited timeline split by section: [{sec, s, e, ed, edEnd, a, b}]
  editedPieces(keep) {
    const out = [];
    for (const r of this.runs(keep)) {
      let i = r.a;
      while (i <= r.b) {
        const k = this.secOf[i];
        let j = i;
        while (j + 1 <= r.b && this.secOf[j + 1] === k) j++;
        const s = i === r.a ? r.s : this.segs[i].start;
        const e = j === r.b ? r.e : this.segs[j + 1].start;
        out.push({ sec: k, a: i, b: j, s, e, ed: r.ed + (s - r.s), edEnd: r.ed + (e - r.s), cutBefore: i === r.a && r.a !== this.runs(keep)[0].a });
        i = j + 1;
      }
    }
    return out;
  }

  // Source span of a section (from its first sentence to the next section's first sentence)
  sectionSpan(k) {
    const s = this.sections[k];
    const start = this.segs[s.start].start;
    const end = k + 1 < this.sections.length ? this.segs[this.sections[k + 1].start].start : Math.max(this.duration, this.segs[s.end].end);
    return { s: start, e: end };
  }

  // timing of an effect attached to a sentence; text effects start at their phrase
  sentenceSpan(i) { const g = this.segs[i]; return { s: g.start, e: g.end }; }

  phraseStart(i, phrase) {
    const g = this.segs[i];
    if (!g.words || !g.words.length || !phrase) return g.start;
    const norm = w => w.toLowerCase().replace(/[^a-z0-9']/g, '');
    const target = phrase.split(/\s+/).map(norm).filter(Boolean);
    if (!target.length) return g.start;
    const ws = g.words.map(w => norm(w.w));
    for (let k = 0; k < ws.length; k++) if (ws[k] === target[0]) return g.words[k].s;
    return g.start;
  }

  keywordRegex() {
    if (this._kwre !== undefined) return this._kwre;
    const kws = this.keywords.filter(k => k.length > 1).sort((a, b) => b.length - a.length)
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    this._kwre = kws.length ? new RegExp(`\\b(${kws.join('|')})\\b`, 'gi') : null;
    return this._kwre;
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
