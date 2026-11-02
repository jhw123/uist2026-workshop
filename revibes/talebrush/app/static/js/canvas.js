// The sketching canvases (Sections 3 and 4.2, Figures 1, 4 and 5).
//
// Fortune canvas: x is the sentence slot (one column per bullet point, separated by subtle
// vertical lines), y is the protagonist's fortune (higher is better). The pen draws a green,
// hatched envelope whose width follows the drawing speed: fast strokes are wide (loose control),
// slow strokes are thin (tight control). The recognized fortune of each sentence is a dot; the
// writer's sentences are grey and generated ones blue, joined by a smooth line with a gap at blank
// bullets. While the History dropdown is open, stored stories are drawn faintly as well.
//
// Surprise canvas: the same columns; the pen draws a thin green line for the desired surprise.

import { BANDS, DEFAULT_SURPRISE, ENVELOPE, ERASER_RADIUS, SAMPLES_PER_SLOT as S, halfWidthForSpeed } from "./config.js";
import { monotoneSegments } from "./geometry.js";
import { recognitionKey } from "./keys.js";
import * as Sk from "./sketch.js";
import { changed, state } from "./store.js";

const NS = "http://www.w3.org/2000/svg";
const r1 = (v) => Math.round(v * 10) / 10;
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function svgEl(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  parent?.appendChild(node);
  return node;
}

export class SketchCanvas {
  constructor({ svg, wrap, kind, onStroke, onErase }) {
    this.svg = svg;
    this.wrap = wrap;
    this.kind = kind; // "fortune" or "surprise"
    this.onStroke = onStroke;
    this.onErase = onErase;
    this.pad = { l: 1, r: 1, t: 1, b: 1 };
    this.W = 0;
    this.H = 0;
    this.drag = null;
    this.tipTimer = 0;

    const defs = svgEl("defs", {}, svg);
    const clipId = `tb-clip-${kind}`;
    this.clipRect = svgEl("rect", { rx: 12, ry: 12 }, svgEl("clipPath", { id: clipId }, defs));
    if (kind === "fortune") {
      const hatch = svgEl("pattern", {
        id: "tb-hatch",
        patternUnits: "userSpaceOnUse",
        width: 6,
        height: 6,
        patternTransform: "rotate(-50)",
      }, defs);
      svgEl("rect", { width: 6, height: 6, fill: "rgba(118, 204, 150, 0.16)" }, hatch);
      svgEl("line", { x1: 1.5, y1: 0, x2: 1.5, y2: 6, stroke: "#86d3a2", "stroke-width": 2, "stroke-opacity": 0.9 }, hatch);
    }
    const root = svgEl("g", { "clip-path": `url(#${clipId})` }, svg);
    this.layers = {};
    for (const name of ["bg", "grid", "history", "sketch", "arc"]) {
      this.layers[name] = svgEl("g", { class: `layer-${name}` }, root);
    }
    this.cursor = svgEl("circle", { class: "eraser-cursor", r: ERASER_RADIUS, visibility: "hidden" }, svg);

    this.tip = document.createElement("div");
    this.tip.className = "canvas-tip";
    this.tip.hidden = true;
    wrap.appendChild(this.tip);
    if (kind === "fortune") {
      this.hint = document.createElement("div");
      this.hint.className = "canvas-hint";
      wrap.appendChild(this.hint);
    }

    new ResizeObserver(() => {
      if (this.layout()) this.render();
    }).observe(wrap);
    svg.addEventListener("pointerdown", (e) => this.down(e));
    svg.addEventListener("pointermove", (e) => this.move(e));
    svg.addEventListener("pointerup", (e) => this.up(e));
    svg.addEventListener("pointercancel", (e) => this.up(e));
    svg.addEventListener("pointerleave", () => this.leave());
  }

  // ---------------------------------------------------------------- geometry

  layout() {
    const r = this.wrap.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    this.W = r.width;
    this.H = r.height;
    this.svg.setAttribute("viewBox", `0 0 ${this.W} ${this.H}`);
    this.clipRect.setAttribute("x", this.pad.l);
    this.clipRect.setAttribute("y", this.pad.t);
    this.clipRect.setAttribute("width", this.plotW);
    this.clipRect.setAttribute("height", this.plotH);
    return true;
  }

  get n() {
    return Math.max(1, state.sentences.length);
  }
  get plotW() {
    return this.W - this.pad.l - this.pad.r;
  }
  get plotH() {
    return this.H - this.pad.t - this.pad.b;
  }
  get slotW() {
    return this.plotW / this.n;
  }
  xOf(units) {
    return this.pad.l + units * this.slotW;
  }
  unitsOf(x) {
    return Math.min(this.n - 1e-6, Math.max(0, (x - this.pad.l) / this.slotW));
  }
  yOf(value) {
    return this.pad.t + (1 - value) * this.plotH;
  }
  valueOf(y) {
    return Math.min(1, Math.max(0, 1 - (y - this.pad.t) / this.plotH));
  }
  samples() {
    return this.kind === "fortune" ? state.sketch.fortune : state.sketch.surprise;
  }
  point(e) {
    const r = this.svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
  }
  locked() {
    return state.ui.generating || !!state.ui.previewId;
  }

  // ---------------------------------------------------------------- drawing and erasing

  down(e) {
    if (e.button !== 0 || this.locked()) return;
    e.preventDefault();
    try {
      this.svg.setPointerCapture(e.pointerId);
    } catch {
      /* not supported: drawing still works inside the canvas */
    }
    const p = this.point(e);
    this.drag = {
      tool: state.tool,
      last: p,
      speed: (ENVELOPE.slowSpeed + ENVELOPE.fastSpeed) / 2,
      touched: new Set(),
      erased: false,
    };
    clearTimeout(this.tipTimer);
    this.hideTip();
    if (state.ui.linkSlot !== null) {
      state.ui.linkSlot = null; // the hover highlight would otherwise stay on the slot where the stroke began
      changed({ persist: false });
    }
    this.apply(p, p);
    this.renderSketch();
    this.renderCursor(p);
  }

  move(e) {
    const p = this.point(e);
    if (!this.drag) {
      this.hover(p);
      this.renderCursor(p);
      return;
    }
    const coalesced = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    for (const ce of coalesced.length ? coalesced : [e]) {
      const q = this.point(ce);
      const dt = q.t - this.drag.last.t;
      if (this.drag.tool === "pen" && dt > 0) {
        const speed = Math.hypot(q.x - this.drag.last.x, q.y - this.drag.last.y) / dt; // px per ms
        this.drag.speed = this.drag.speed * 0.8 + speed * 0.2;
      }
      this.apply(this.drag.last, q);
      this.drag.last = q;
    }
    this.renderSketch();
    this.renderCursor(p);
  }

  up(e) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    try {
      this.svg.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    changed();
    if (drag.tool === "pen") this.onStroke?.(this.kind, Sk.touchedSlots(drag.touched, state.sentences.length));
    else this.onErase?.(this.kind, drag.erased);
  }

  leave() {
    if (this.drag) return;
    clearTimeout(this.tipTimer);
    this.renderCursor(null);
    this.hideTip();
    if (state.ui.linkSlot !== null) {
      state.ui.linkSlot = null;
      changed({ persist: false });
    }
  }

  apply(a, b) {
    if (this.drag.tool === "pen") {
      const ua = this.unitsOf(a.x);
      const ub = this.unitsOf(b.x);
      const va = this.valueOf(a.y);
      const vb = this.valueOf(b.y);
      if (this.kind === "fortune") {
        Sk.writeFortune(state.sketch.fortune, ua, va, ub, vb, halfWidthForSpeed(this.drag.speed), this.drag.touched);
      } else {
        Sk.writeSurprise(state.sketch.surprise, ua, va, ub, vb, this.drag.touched);
      }
      return;
    }
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
    for (let k = 0; k <= steps; k++) this.eraseAt(a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps);
  }

  eraseAt(px, py) {
    const arr = this.samples();
    const r = ERASER_RADIUS;
    const j0 = Math.max(0, Math.floor(((px - r - this.pad.l) / this.slotW) * S));
    const j1 = Math.min(arr.length - 1, Math.ceil(((px + r - this.pad.l) / this.slotW) * S));
    for (let j = j0; j <= j1; j++) {
      const v = arr[j];
      if (v === null || v === undefined) continue;
      if (Math.abs(this.xOf((j + 0.5) / S) - px) > r) continue;
      if (this.kind === "fortune") {
        const top = this.yOf(Math.min(1, v[0] + v[1]));
        const bottom = this.yOf(Math.max(0, v[0] - v[1]));
        if (py + r < top || py - r > bottom) continue;
      } else if (Math.abs(this.yOf(v) - py) > r) {
        continue;
      }
      arr[j] = null;
      this.drag.erased = true;
    }
  }

  // ---------------------------------------------------------------- hover details

  hover(p) {
    const inside = p.x >= this.pad.l && p.x <= this.W - this.pad.r && p.y >= this.pad.t && p.y <= this.H - this.pad.b;
    const slot = inside ? Math.floor(this.unitsOf(p.x)) : null;
    if (state.ui.linkSlot !== slot) {
      state.ui.linkSlot = slot;
      changed({ persist: false });
    }
    clearTimeout(this.tipTimer);
    this.hideTip();
    if (slot !== null) this.tipTimer = setTimeout(() => this.showTip(slot, p), 450);
  }

  showTip(slot, p) {
    if (this.drag || slot >= state.sentences.length) return;
    this.tip.innerHTML = this.tipHtml(slot);
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    let x = p.x + 14;
    let y = p.y + 14;
    if (x + tw > this.W - 4) x = p.x - tw - 14;
    if (y + th > this.H - 4) y = p.y - th - 14;
    this.tip.style.left = `${Math.max(4, x)}px`;
    this.tip.style.top = `${Math.max(4, y)}px`;
  }

  hideTip() {
    this.tip.hidden = true;
  }

  tipHtml(slot) {
    const s = state.sentences[slot];
    const n = state.sentences.length;
    const lines = [`<b>Sentence ${slot + 1}</b>`];
    if (!s.text.trim()) {
      lines.push("Blank bullet");
    } else {
      const who = s.source === "generated" ? "Written by TaleBrush" : "Written by you";
      lines.push(s.fortune !== null ? `${who} · recognized fortune ${s.fortune.toFixed(2)}` : who);
      if (s.source === "generated" && s.gen?.tries > 1) lines.push(`Best of ${s.gen.tries} tries`);
    }
    if (this.kind === "fortune") {
      const slots = Sk.fortuneSlots(state.sketch.fortune, n);
      const f = slots[slot];
      const extent = Sk.extentOf(slots);
      if (f.sketched) {
        const speed = f.maxRegen === 2 ? "drawn slowly: up to 2 retries" : "drawn fast: up to 1 retry";
        lines.push(`Sketched fortune ${f.fortune.toFixed(2)} ± ${f.halfWidth.toFixed(2)} (${speed})`);
      } else if (extent && slot > extent[0] && slot < extent[1]) {
        lines.push("Line erased here: written without a fortune target");
      } else {
        lines.push("Not sketched");
      }
    } else {
      const v = Sk.surpriseSlots(state.sketch.surprise, n)[slot];
      lines.push(v !== null ? `Sketched surprise ${v.toFixed(2)}` : `No surprise line: default ${DEFAULT_SURPRISE.toFixed(2)}`);
    }
    return lines.join("<br>");
  }

  // ---------------------------------------------------------------- rendering

  render() {
    if (!this.W && !this.layout()) return;
    this.renderBackground();
    this.renderGrid();
    if (this.kind === "fortune") {
      this.renderHistory();
      this.renderArc();
    }
    this.renderSketch();
    this.wrap.classList.toggle("busy", state.ui.generating);
    this.wrap.classList.toggle("erasing", state.tool === "eraser");
    this.wrap.classList.toggle("locked", !!state.ui.previewId);
    if (this.hint) {
      const name = escapeHtml(state.protagonist.trim() || "the protagonist");
      this.hint.hidden = Sk.hasSamples(state.sketch.fortune) || state.ui.generating;
      this.hint.innerHTML =
        `Sketch how ${name}'s fortune changes over the story. Higher is better.<br>` +
        "Draw slowly where the sentences should follow your line closely.";
    }
  }

  renderBackground() {
    const { l, t } = this.pad;
    const w = this.plotW;
    let html = "";
    if (this.kind === "fortune") {
      for (const b of BANDS) {
        const y0 = this.yOf(b.to);
        const y1 = this.yOf(b.from);
        html += `<rect x="${l}" y="${r1(y0)}" width="${r1(w)}" height="${r1(y1 - y0)}" fill="${b.canvas}"/>`;
      }
    } else {
      html += `<rect x="${l}" y="${t}" width="${r1(w)}" height="${r1(this.plotH)}" fill="#ffffff"/>`;
    }
    const ym = r1(this.yOf(0.5));
    html += `<line class="mid-line" x1="${l}" x2="${r1(l + w)}" y1="${ym}" y2="${ym}"/>`;
    if (this.kind === "surprise") {
      html += `<text class="surprise-label high" transform="translate(${l + 13} ${r1(this.yOf(0.75))}) rotate(-90)">High Surprise</text>`;
      html += `<text class="surprise-label low" transform="translate(${l + 13} ${r1(this.yOf(0.25))}) rotate(-90)">Low Surprise</text>`;
    }
    this.layers.bg.innerHTML = html;
  }

  renderGrid() {
    const n = state.sentences.length;
    const { t } = this.pad;
    const h = r1(this.plotH);
    const sw = r1(this.slotW);
    let html = "";
    if (state.ui.generating) {
      for (const i of state.ui.targets) html += `<rect class="target-col" x="${r1(this.xOf(i))}" y="${t}" width="${sw}" height="${h}"/>`;
    }
    const link = state.ui.linkSlot ?? state.ui.focusSlot;
    if (link !== null && link < n) {
      html += `<rect class="link-col" x="${r1(this.xOf(link))}" y="${t}" width="${sw}" height="${h}"/>`;
    }
    for (let i = 1; i < n; i++) {
      const x = r1(this.xOf(i));
      html += `<line class="slot-line" x1="${x}" x2="${x}" y1="${t}" y2="${r1(t + this.plotH)}"/>`;
    }
    this.layers.grid.innerHTML = html;
  }

  renderSketch() {
    const arr = this.samples();
    const X = (j) => r1(this.xOf((j + 0.5) / S));
    let html = "";
    for (const [a, b] of Sk.runsOf(arr)) {
      if (this.kind === "fortune") {
        const f = Sk.smoothRun(arr, a, b, 1, (v) => v[0]);
        const hw = Sk.smoothRun(arr, a, b, 5, (v) => v[1]); // the width changes gradually on screen
        const xs = [];
        for (let j = a; j <= b; j++) xs.push(X(j));
        const upper = xs.map((x, k) => `${x},${r1(this.yOf(Math.min(1, f[k] + hw[k])))}`);
        const lower = xs.map((x, k) => `${x},${r1(this.yOf(Math.max(0, f[k] - hw[k])))}`).reverse();
        html += `<path class="envelope" d="M${upper.join("L")}L${lower.join("L")}Z"/>`;
        html += `<path class="envelope-center" d="M${xs.map((x, k) => `${x},${r1(this.yOf(f[k]))}`).join("L")}"/>`;
      } else {
        const v = Sk.smoothRun(arr, a, b, 1, (x) => x);
        html +=
          a === b
            ? `<circle class="surprise-dot" cx="${X(a)}" cy="${r1(this.yOf(v[0]))}" r="2"/>`
            : `<path class="surprise-line" d="M${v.map((y, k) => `${X(a + k)},${r1(this.yOf(y))}`).join("L")}"/>`;
      }
    }
    this.layers.sketch.innerHTML = html;
  }

  /** Dots and lines for a list of {x, y} points (null = gap). */
  arcHtml(points, segClass, dotClass, radius) {
    let html = "";
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const pieces = run;
        monotoneSegments(pieces).forEach((d, k) => {
          html += `<path class="${segClass(pieces[k + 1])}" d="${d}"/>`;
        });
      }
      run = [];
    };
    points.forEach((p) => (p ? run.push(p) : flush()));
    flush();
    points.forEach((p) => {
      if (p) html += `<circle class="${dotClass(p)}" cx="${r1(p.x)}" cy="${r1(p.y)}" r="${radius}"/>`;
    });
    return html;
  }

  renderArc() {
    const targets = new Set(state.ui.generating ? state.ui.targets : []);
    const points = state.sentences.map((s, i) => {
      if (!s.text.trim() || s.fortune === null) return null;
      const stale = !s.draft && !targets.has(i) && s.fortuneKey !== recognitionKey(state.protagonist, state.sentences, i);
      return { x: this.xOf(i + 0.5), y: this.yOf(s.fortune), gen: s.source === "generated", draft: s.draft, stale };
    });
    let html = this.arcHtml(
      points,
      (p) => `arc-seg ${p.gen ? "gen" : "user"}`,
      (p) => `dot ${p.gen ? "gen" : "user"}${p.draft ? " draft" : ""}${p.stale ? " stale" : ""}`,
      4.2,
    );
    state.sentences.forEach((s, i) => {
      if (s.text.trim() && s.fortune === null && s.pending) {
        html += `<circle class="dot waiting" cx="${r1(this.xOf(i + 0.5))}" cy="${r1(this.yOf(0.5))}" r="4.2"/>`;
      }
    });
    this.layers.arc.innerHTML = html;
    this.layers.arc.classList.toggle("dimmed", !!state.ui.previewId);
  }

  renderHistory() {
    if (!state.ui.historyOpen || !state.history.length) {
      this.layers.history.innerHTML = "";
      return;
    }
    let html = "";
    let hot = "";
    for (const h of state.history) {
      const n = h.sentences.length;
      if (!n) continue;
      const isHot = h.id === state.ui.previewId;
      const points = h.sentences.map((s, i) =>
        s.text.trim() && s.fortune !== null ? { x: this.pad.l + ((i + 0.5) * this.plotW) / n, y: this.yOf(s.fortune) } : null,
      );
      const part = this.arcHtml(
        points,
        () => `hist-arc${isHot ? " hot" : ""}`,
        () => `hist-dot${isHot ? " hot" : ""}`,
        isHot ? 3.8 : 2.6,
      );
      if (isHot) hot = part;
      else html += part;
    }
    this.layers.history.innerHTML = html + hot;
  }

  renderCursor(p) {
    const show = !!p && state.tool === "eraser" && !this.locked();
    this.cursor.setAttribute("visibility", show ? "visible" : "hidden");
    if (show) {
      this.cursor.setAttribute("cx", r1(p.x));
      this.cursor.setAttribute("cy", r1(p.y));
    }
  }
}
