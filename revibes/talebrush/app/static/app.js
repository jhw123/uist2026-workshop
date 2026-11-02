// TaleBrush front end (revibe). Vanilla JS, no build step.
//
// Data model
//   rows[i]        one bullet point = one sequence step (sentence) = slot i on the canvas x axis
//   points         the fortune sketch, in data units: x in slots (slot i at x = i), y fortune 0-1,
//                  w the half-width of the envelope in fortune units (from sketching speed)
//   sketched[i]    true once a pen stroke has covered slot i; if its points are later erased,
//                  the slot is generated without a fortune target
//   surprisePts    the surprise sketch (x in slots, y 0-1)
//   history        stored stories (Figure 5)

const SVGNS = "http://www.w3.org/2000/svg";
const DEFAULT_ROWS = 8;
const DEFAULT_SURPRISE = 0.3;          // used where no surprise is sketched
const SLOW_HALF_WIDTH = 0.06;          // envelope half-width (fortune units) below which a slot gets 2 regenerations
const ERASER_RADIUS = 16;              // viewBox px

const FORTUNE = { W: 640, H: 340, PL: 44, PR: 16, PT: 14, PB: 14 };
const SURPRISE = { W: 640, H: 190, PL: 44, PR: 16, PT: 12, PB: 12 };

const state = {
  rows: [],
  points: [],
  sketched: [],
  surprisePts: [],
  history: [],
  historyCounter: 0,
  tool: "pen",
  generating: false,
  cancel: false,
  menuOpen: false,
  previewIndex: null,
  drawing: null,
  eraserAt: null,
};

const $ = (id) => document.getElementById(id);
const editorEl = $("editor");
const fortuneSvg = $("fortuneCanvas");
const surpriseSvg = $("surpriseCanvas");

function newRow(text = "", kind = "user") {
  return { text, kind, fortune: null, pending: false };
}

function init() {
  for (let i = 0; i < DEFAULT_ROWS; i++) state.rows.push(newRow());
  state.sketched = state.rows.map(() => false);
  renderEditor();
  renderAll();
  bindCanvas(fortuneSvg, FORTUNE, "fortune");
  bindCanvas(surpriseSvg, SURPRISE, "surprise");
  bindControls();
  checkHealth();
}

// ------------------------------------------------------------------ geometry

const N = () => Math.max(1, state.rows.length);
function sx(geo, slot) { return geo.PL + ((slot + 0.5) / N()) * (geo.W - geo.PL - geo.PR); }
function sy(geo, v) { return geo.PT + (1 - v) * (geo.H - geo.PT - geo.PB); }
function slotFromX(geo, x) { return ((x - geo.PL) / (geo.W - geo.PL - geo.PR)) * N() - 0.5; }
function valueFromY(geo, y) { return 1 - (y - geo.PT) / (geo.H - geo.PT - geo.PB); }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function svgPoint(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// Catmull-Rom through points, as a cubic Bezier path, in screen coords
function smoothPath(pts) {
  if (pts.length === 0) return "";
  return `M${pts[0][0]},${pts[0][1]}` + curveTo(pts);
}

// The curve segments of smoothPath, without the initial move
function curveTo(pts) {
  let d = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// Split sorted sketch points into runs where the line is not broken
function runsOf(points, maxGap = 0.3) {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const runs = [];
  let cur = [];
  for (const p of sorted) {
    if (cur.length && p.x - cur[cur.length - 1].x > maxGap) { runs.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length) runs.push(cur);
  return runs;
}

// Thin out points so the drawn path stays smooth
function decimate(run, minDx = 0.02) {
  const out = [];
  for (const p of run) if (!out.length || p.x - out[out.length - 1].x >= minDx) out.push(p);
  if (run.length && out[out.length - 1] !== run[run.length - 1]) out.push(run[run.length - 1]);
  return out;
}

// ------------------------------------------------------------------ sketch -> per-slot controls

function pointsInSlot(points, i) {
  return points.filter((p) => p.x >= i - 0.5 && p.x < i + 0.5);
}

function valueAt(points, i) {
  const inSlot = pointsInSlot(points, i);
  if (!inSlot.length) return null;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  let left = null, right = null;
  for (const p of sorted) {
    if (p.x <= i && p.x >= i - 0.5) left = p;
    if (p.x >= i && p.x < i + 0.5 && !right) right = p;
  }
  if (left && right && right.x !== left.x) {
    const t = (i - left.x) / (right.x - left.x);
    return { y: left.y + t * (right.y - left.y), w: inSlot.reduce((s, p) => s + (p.w || 0), 0) / inSlot.length };
  }
  const near = inSlot.reduce((a, b) => (Math.abs(b.x - i) < Math.abs(a.x - i) ? b : a));
  return { y: near.y, w: inSlot.reduce((s, p) => s + (p.w || 0), 0) / inSlot.length };
}

function slotControl(i) {
  const v = valueAt(state.points, i);
  const target = v ? clamp(v.y, 0, 1) : null;
  const regenerations = v && v.w < SLOW_HALF_WIDTH ? 2 : 1;
  let surprise = DEFAULT_SURPRISE;
  if ($("surpriseToggle").checked) {
    const s = valueAt(state.surprisePts, i);
    if (s) surprise = clamp(s.y, 0, 1);
  }
  return { target, regenerations, surprise };
}

// ------------------------------------------------------------------ rendering: fortune canvas

function renderFortune() {
  const g = FORTUNE, svg = fortuneSvg;
  svg.innerHTML = "";
  const defs = el("defs", {}, svg);
  const pat = el("pattern", { id: "hatch", width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(-35)" }, defs);
  el("line", { x1: 0, y1: 0, x2: 0, y2: 5, stroke: "#5fcf95", "stroke-width": 1.6, opacity: 0.75 }, pat);
  const clip = el("clipPath", { id: "plotClip" }, defs);
  el("rect", { x: g.PL, y: g.PT, width: g.W - g.PL - g.PR, height: g.H - g.PT - g.PB, rx: 14 }, clip);

  // fortune bands: good (top, warm) to bad (bottom, grey); no explicit axis labels, as in the paper
  const bands = [[1, 0.75, "#fff6df"], [0.75, 0.5, "#fffbf0"], [0.5, 0.25, "#f6f6f6"], [0.25, 0, "#ececec"]];
  const plot = el("g", { "clip-path": "url(#plotClip)" }, svg);
  for (const [hi, lo, c] of bands) el("rect", { x: g.PL, y: sy(g, hi), width: g.W - g.PL - g.PR, height: sy(g, lo) - sy(g, hi), fill: c }, plot);
  // subtle vertical lines: one per sentence unit
  for (let i = 0; i < N(); i++) el("line", { x1: sx(g, i), x2: sx(g, i), y1: g.PT, y2: g.H - g.PB, stroke: "#e2e2e2", "stroke-width": 1 }, plot);
  el("line", { x1: g.PL, x2: g.W - g.PR, y1: sy(g, 0.5), y2: sy(g, 0.5), stroke: "#b5b5b5", "stroke-width": 2 }, plot);

  // the sketched envelope (green hatched area)
  const pts = state.drawing && state.drawing.points && state.drawing.kind === "fortune"
    ? mergeStroke(state.points, state.drawing.points) : state.points;
  for (const run of runsOf(pts)) {
    const r = decimate(run);
    if (r.length < 2) continue;
    const upper = r.map((p) => [sx(g, p.x), sy(g, clamp(p.y + p.w, -0.1, 1.1))]);
    const lower = r.map((p) => [sx(g, p.x), sy(g, clamp(p.y - p.w, -0.1, 1.1))]).reverse();
    const d = smoothPath(upper) + ` L${lower[0]}` + curveTo(lower) + " Z";
    el("path", { d, fill: "url(#hatch)", stroke: "#a6e5c4", "stroke-width": 0.8, opacity: 0.95 }, plot);
  }

  // stored stories in low opacity while the history menu is open (Figure 5B)
  if (state.menuOpen) {
    state.history.forEach((h, idx) => {
      if (idx === state.previewIndex) return;
      drawArc(plot, g, h.rows, 0.22, true);
    });
    if (state.previewIndex != null && state.history[state.previewIndex]) {
      drawArc(plot, g, state.history[state.previewIndex].rows, 1, false);
    }
  }
  if (!(state.menuOpen && state.previewIndex != null)) drawArc(plot, g, state.rows, 1, false);

  // pending sentences: a small marker at the target
  state.rows.forEach((r, i) => {
    if (!r.pending) return;
    const c = slotControl(i);
    const y = c.target == null ? 0.5 : c.target;
    const m = el("circle", { cx: sx(g, i), cy: sy(g, y), r: 5, fill: "none", stroke: "#4a90e2", "stroke-width": 1.5, "stroke-dasharray": "2 2" }, plot);
    el("animate", { attributeName: "opacity", values: "1;0.2;1", dur: "1.2s", repeatCount: "indefinite" }, m);
  });

  if (state.tool === "eraser" && state.eraserAt && state.eraserAt.svg === svg) {
    el("circle", { cx: state.eraserAt.x, cy: state.eraserAt.y, r: ERASER_RADIUS, fill: "rgba(240,150,150,.25)", stroke: "#d77", "stroke-width": 1 }, svg);
  }
}

// The story arc: one dot per non-empty sentence, connected to its neighbours; blanks leave gaps.
function drawArc(parent, g, rows, opacity, ghost) {
  const runs = [];
  let cur = [];
  rows.forEach((r, i) => {
    if (r.text.trim() && r.fortune != null && !r.pending) cur.push({ i, f: r.fortune, kind: r.kind });
    else { if (cur.length) runs.push(cur); cur = []; }
  });
  if (cur.length) runs.push(cur);
  const grp = el("g", { opacity }, parent);
  for (const run of runs) {
    const scr = run.map((p) => [sx(g, p.i), sy(g, p.f)]);
    for (let k = 0; k < run.length - 1; k++) {
      // one piece per pair, so each piece can take the colour of its sentence; tangents use the neighbours
      const p0 = scr[k - 1] || scr[k], p1 = scr[k], p2 = scr[k + 1], p3 = scr[k + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      const color = ghost ? "#9a9a9a" : run[k + 1].kind === "generated" ? "#4a90e2" : "#8b8f92";
      el("path", { d: `M${p1} C${c1} ${c2} ${p2}`, fill: "none", stroke: color, "stroke-width": ghost ? 2 : 2.5, "stroke-linecap": "round" }, grp);
    }
    run.forEach((p, k) => {
      const color = ghost ? "#9a9a9a" : p.kind === "generated" ? "#4a90e2" : "#8b8f92";
      const dot = el("circle", { cx: scr[k][0], cy: scr[k][1], r: ghost ? 3 : 4.5, fill: color }, grp);
      if (!ghost) {
        const t = el("title", {}, dot);
        t.textContent = `Sentence ${p.i + 1}: fortune ${p.f.toFixed(2)}`;
      }
    });
  }
}

// ------------------------------------------------------------------ rendering: surprise canvas

function renderSurprise() {
  const g = SURPRISE, svg = surpriseSvg;
  svg.innerHTML = "";
  el("rect", { x: g.PL, y: g.PT, width: g.W - g.PL - g.PR, height: g.H - g.PT - g.PB, fill: "#fbfbfa" }, svg);
  for (let i = 0; i < N(); i++) el("line", { x1: sx(g, i), x2: sx(g, i), y1: g.PT, y2: g.H - g.PB, stroke: "#e2e2e2" }, svg);
  el("line", { x1: g.PL, x2: g.W - g.PR, y1: sy(g, 0.5), y2: sy(g, 0.5), stroke: "#b5b5b5", "stroke-width": 2 }, svg);
  const hi = el("text", { x: 0, y: 0, transform: `translate(${g.PL - 14},${sy(g, 0.75)}) rotate(-90)`, "text-anchor": "middle", "font-size": 13, fill: "#e0703a" }, svg);
  hi.textContent = "High Surprise";
  const lo = el("text", { x: 0, y: 0, transform: `translate(${g.PL - 14},${sy(g, 0.25)}) rotate(-90)`, "text-anchor": "middle", "font-size": 13, fill: "#555" }, svg);
  lo.textContent = "Low Surprise";
  // default level, shown faintly where nothing is sketched
  el("line", { x1: g.PL, x2: g.W - g.PR, y1: sy(g, DEFAULT_SURPRISE), y2: sy(g, DEFAULT_SURPRISE), stroke: "#cfe9db", "stroke-dasharray": "4 4" }, svg);

  const pts = state.drawing && state.drawing.points && state.drawing.kind === "surprise"
    ? mergeStroke(state.surprisePts, state.drawing.points) : state.surprisePts;
  for (const run of runsOf(pts)) {
    const r = decimate(run);
    if (r.length < 2) continue;
    el("path", { d: smoothPath(r.map((p) => [sx(g, p.x), sy(g, p.y)])), fill: "none", stroke: "#3f9a5f", "stroke-width": 2.2, "stroke-linecap": "round" }, svg);
  }
  if (state.tool === "eraser" && state.eraserAt && state.eraserAt.svg === svg) {
    el("circle", { cx: state.eraserAt.x, cy: state.eraserAt.y, r: ERASER_RADIUS, fill: "rgba(240,150,150,.25)", stroke: "#d77" }, svg);
  }
}

function renderAll() {
  renderFortune();
  if (!surpriseSvg.hasAttribute("hidden")) renderSurprise();
  $("again").disabled = state.generating || !state.sketched.some(Boolean);
  fortuneSvg.classList.toggle("busy", state.generating);
}

// ------------------------------------------------------------------ sketching

// Replace existing points in the stroke's x range by the stroke
function mergeStroke(existing, stroke) {
  if (!stroke.length) return existing;
  const xs = stroke.map((p) => p.x);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return existing.filter((p) => p.x < lo || p.x > hi).concat(stroke).sort((a, b) => a.x - b.x);
}

function bindCanvas(svg, geo, kind) {
  svg.addEventListener("pointerdown", (e) => {
    if (state.generating && kind === "fortune") return;
    svg.setPointerCapture(e.pointerId);
    const p = svgPoint(svg, e);
    if (state.tool === "eraser") {
      state.drawing = { kind, erasing: true, removed: false };
      eraseAt(svg, geo, kind, p);
      return;
    }
    state.drawing = { kind, points: [], last: null, speed: 0.4 };
    addStrokePoint(geo, p, e.timeStamp);
    renderAll();
  });
  svg.addEventListener("pointermove", (e) => {
    const p = svgPoint(svg, e);
    if (state.tool === "eraser") {
      state.eraserAt = { svg, x: p.x, y: p.y };
      if (state.drawing && state.drawing.erasing && state.drawing.kind === kind) eraseAt(svg, geo, kind, p);
      else renderAll();
      return;
    }
    if (!state.drawing || state.drawing.kind !== kind || state.drawing.erasing) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ce of evs) addStrokePoint(geo, svgPoint(svg, ce), ce.timeStamp);
    renderAll();
  });
  svg.addEventListener("pointerleave", () => { state.eraserAt = null; if (state.tool === "eraser") renderAll(); });
  const finish = () => {
    const d = state.drawing;
    if (!d || d.kind !== kind) return;
    state.drawing = null;
    if (d.erasing) { renderAll(); return; }
    if (d.points.length < 2) { renderAll(); return; }
    if (kind === "surprise") {
      state.surprisePts = mergeStroke(state.surprisePts, d.points.map(({ x, y }) => ({ x, y })));
      renderAll();
      setStatus("Surprise set. It applies to the next generation (redraw the fortune line or click Generate Again).");
      return;
    }
    state.points = mergeStroke(state.points, d.points);
    const xs = d.points.map((p) => p.x);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const covered = [];
    for (let i = 0; i < N(); i++) if (lo <= i + 0.3 && hi >= i - 0.3) { covered.push(i); state.sketched[i] = true; }
    renderAll();
    if (covered.length) generateSlots(covered);
  };
  svg.addEventListener("pointerup", finish);
  svg.addEventListener("pointercancel", finish);
}

// Sketching speed sets the envelope width: fast = wide (loose), slow = thin (tight)
function addStrokePoint(geo, p, t) {
  const d = state.drawing;
  const x = clamp(slotFromX(geo, p.x), -0.5, N() - 0.5);
  const y = clamp(valueFromY(geo, p.y), 0, 1);
  if (d.last) {
    const dt = Math.max(1, t - d.last.t);
    const dist = Math.hypot(p.x - d.last.px, p.y - d.last.py);
    if (dist < 0.5) return;
    d.speed = 0.85 * d.speed + 0.15 * (dist / dt);       // viewBox px per ms, smoothed
  }
  const widthPx = 7 + 34 * clamp((d.speed - 0.12) / 1.3, 0, 1);  // half-width in px
  const w = widthPx / (geo.H - geo.PT - geo.PB);
  // fill in points along fast moves, so a quick stroke does not read as a broken line
  const prev = d.points[d.points.length - 1];
  if (prev) {
    const steps = Math.floor(Math.hypot(p.x - d.last.px, p.y - d.last.py) / 6);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      d.points.push({ x: prev.x + t * (x - prev.x), y: prev.y + t * (y - prev.y), w: prev.w + t * (w - prev.w) });
    }
  }
  d.points.push({ x, y, w });
  d.last = { px: p.x, py: p.y, t };
}

function eraseAt(svg, geo, kind, p) {
  const keep = (q) => Math.hypot(sx(geo, q.x) - p.x, sy(geo, q.y) - p.y) > ERASER_RADIUS;
  if (kind === "fortune") state.points = state.points.filter(keep);
  else state.surprisePts = state.surprisePts.filter(keep);
  state.eraserAt = { svg, x: p.x, y: p.y };
  renderAll();
}

// ------------------------------------------------------------------ editor

function renderEditor(focusIndex = null, caret = null) {
  editorEl.innerHTML = "";
  const rows = state.menuOpen && state.previewIndex != null ? state.history[state.previewIndex].rows : state.rows;
  const previewing = rows !== state.rows;
  rows.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "row" + (r.kind === "generated" ? " generated" : "") + (r.pending ? " pending" : "") + (previewing ? " preview" : "");
    const marker = document.createElement("span");
    marker.className = "marker";
    marker.textContent = ">";
    const text = document.createElement("div");
    text.className = "text";
    if (previewing || state.generating) text.contentEditable = "false";
    else try { text.contentEditable = "plaintext-only"; } catch { text.contentEditable = "true"; }
    text.textContent = r.pending ? "generating…" : r.text;
    text.dataset.index = i;
    text.dataset.placeholder = i === 0 && !r.text ? "Start your story here…" : "";
    if (!previewing) {
      text.addEventListener("input", () => onRowInput(i, text));
      text.addEventListener("keydown", (e) => onRowKey(e, i, text));
      text.addEventListener("paste", (e) => onRowPaste(e, i, text));
    }
    row.append(marker, text);
    editorEl.appendChild(row);
  });
  editorEl.classList.toggle("locked", state.generating || previewing);
  if (focusIndex != null) {
    const t = editorEl.querySelectorAll(".text")[focusIndex];
    if (t) placeCaret(t, caret == null ? t.textContent.length : caret);
  }
}

function placeCaret(node, offset) {
  node.focus();
  const range = document.createRange();
  const tn = node.firstChild;
  if (tn && tn.nodeType === 3) range.setStart(tn, Math.min(offset, tn.length));
  else range.setStart(node, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function caretOffset(node) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return 0;
  const r = sel.getRangeAt(0).cloneRange();
  r.selectNodeContents(node);
  r.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  return r.toString().length;
}

let recognizeTimer = null;
const dirty = new Set();

function onRowInput(i, node) {
  state.rows[i].text = node.textContent.replace(/\n/g, " ");
  // an edited generated sentence becomes the writer's: Generate Again keeps it and builds on it
  if (state.rows[i].kind === "generated") { state.rows[i].kind = "user"; node.parentElement.classList.remove("generated"); }
  state.rows[i].fortune = state.rows[i].text.trim() ? state.rows[i].fortune : null;
  dirty.add(i);
  clearTimeout(recognizeTimer);
  recognizeTimer = setTimeout(flushRecognition, 900);
  renderAll();
}

function onRowKey(e, i, node) {
  if (e.key === "Enter") {
    e.preventDefault();
    const off = caretOffset(node);
    const text = state.rows[i].text;
    state.rows[i].text = text.slice(0, off);
    insertRow(i + 1, newRow(text.slice(off)));
    dirty.add(i); dirty.add(i + 1);
    scheduleRecognition();
    renderEditor(i + 1, 0);
    renderAll();
  } else if (e.key === "Backspace" && caretOffset(node) === 0 && window.getSelection().isCollapsed && i > 0) {
    e.preventDefault();
    const prev = state.rows[i - 1];
    const join = prev.text.length;
    prev.text = (prev.text + (prev.text && state.rows[i].text ? " " : "") + state.rows[i].text);
    removeRow(i);
    dirty.add(i - 1);
    scheduleRecognition();
    renderEditor(i - 1, join);
    renderAll();
  } else if (e.key === "ArrowUp" && caretOffset(node) === 0 && i > 0) {
    e.preventDefault(); renderEditor(i - 1);
  } else if (e.key === "ArrowDown" && caretOffset(node) === node.textContent.length && i < state.rows.length - 1) {
    e.preventDefault(); renderEditor(i + 1, 0);
  }
}

function onRowPaste(e, i, node) {
  const text = (e.clipboardData || window.clipboardData).getData("text/plain");
  if (!text.includes("\n")) return;
  e.preventDefault();
  const lines = text.split(/\r?\n/).map((s) => s.replace(/^\s*[>\-*•]\s*/, "").trim()).filter(Boolean);
  const off = caretOffset(node);
  const before = state.rows[i].text.slice(0, off), after = state.rows[i].text.slice(off);
  state.rows[i].text = before + lines[0];
  dirty.add(i);
  let at = i;
  for (const line of lines.slice(1)) {
    // fill following empty bullets first, then insert new ones
    if (state.rows[at + 1] && !state.rows[at + 1].text.trim()) state.rows[at + 1].text = line;
    else insertRow(at + 1, newRow(line));
    at++;
    dirty.add(at);
  }
  state.rows[at].text += after;
  scheduleRecognition();
  renderEditor(at);
  renderAll();
}

function insertRow(i, row) {
  state.rows.splice(i, 0, row);
  state.sketched.splice(i, 0, false);
  const shift = (p) => (p.x >= i - 0.5 ? { ...p, x: p.x + 1 } : p);
  state.points = state.points.map(shift);
  state.surprisePts = state.surprisePts.map(shift);
}

function removeRow(i) {
  if (state.rows.length <= 1) return;
  state.rows.splice(i, 1);
  state.sketched.splice(i, 1);
  const fix = (pts) => pts.filter((p) => p.x < i - 0.5 || p.x >= i + 0.5).map((p) => (p.x >= i + 0.5 ? { ...p, x: p.x - 1 } : p));
  state.points = fix(state.points);
  state.surprisePts = fix(state.surprisePts);
}

function scheduleRecognition() {
  clearTimeout(recognizeTimer);
  recognizeTimer = setTimeout(flushRecognition, 900);
}

// Recognize the fortune of edited sentences (and the next few, whose context changed)
async function flushRecognition() {
  if (state.generating) { scheduleRecognition(); return; }
  const idx = new Set();
  for (const i of dirty) for (let k = i; k <= i + 3 && k < state.rows.length; k++) if (state.rows[k].text.trim()) idx.add(k);
  dirty.clear();
  if (!idx.size) { renderAll(); return; }
  await recognizeRows([...idx]);
}

async function recognizeRows(indices) {
  const snapshot = state.rows.map((r) => r.text);
  try {
    setStatus("Reading the protagonist's fortune…");
    const res = await api("/api/recognize", { protagonist: protagonist(), sentences: snapshot, indices });
    for (const [k, v] of Object.entries(res.fortunes)) {
      const i = Number(k);
      if (state.rows[i] && state.rows[i].text === snapshot[i]) state.rows[i].fortune = v;
    }
    setStatus("");
  } catch (err) {
    setStatus(err.message, true);
  }
  renderAll();
}

// ------------------------------------------------------------------ generation

const protagonist = () => $("protagonist").value.trim();

async function generateSlots(slots) {
  if (state.generating) return;
  slots = [...new Set(slots)].filter((i) => i >= 0 && i < state.rows.length).sort((a, b) => a - b);
  if (!slots.length) return;
  if (!protagonist()) {
    setStatus("Enter the protagonist's name first (the box above the canvas), then sketch again or click Generate Again.", true);
    $("protagonist").focus();
    return;
  }
  state.generating = true;
  state.cancel = false;
  $("stopBtn").hidden = false;
  const controls = {};
  for (const i of slots) {
    controls[i] = slotControl(i);
    Object.assign(state.rows[i], { text: "", pending: true, kind: "generated", fortune: null });
  }
  renderEditor();
  renderAll();

  // contiguous runs; a run with story text after it is infilled (alternating from previous / from next),
  // otherwise it is continued left to right
  const runs = [];
  for (const i of slots) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i); else runs.push([i]);
  }
  let done = 0, failed = null;
  try {
    for (const run of runs) {
      const hasNext = state.rows.slice(run[run.length - 1] + 1).some((r) => r.text.trim() && !r.pending);
      const order = [];
      if (hasNext) {
        let L = 0, R = run.length - 1, fromPrev = true;
        while (L <= R) {
          if (fromPrev) order.push({ slot: run[L++], mode: "infill_prev" });
          else order.push({ slot: run[R--], mode: "infill_next" });
          fromPrev = !fromPrev;
        }
      } else {
        for (const s of run) order.push({ slot: s, mode: "continue" });
      }
      for (const step of order) {
        if (state.cancel) break;
        const c = controls[step.slot];
        const pendingInRun = run.filter((s) => state.rows[s].pending && s !== step.slot);
        setStatus(`Generating sentence ${step.slot + 1} (${++done} of ${slots.length})` +
          (c.target == null ? ", no fortune target" : `, fortune target ${c.target.toFixed(2)}`) +
          (c.target == null ? "" : `, up to ${c.regenerations} regeneration${c.regenerations > 1 ? "s" : ""}`) + "…");
        const res = await api("/api/generate", {
          protagonist: protagonist(),
          sentences: state.rows.map((r) => (r.pending ? "" : r.text)),
          slot: step.slot,
          mode: step.mode,
          target: c.target,
          surprise: c.surprise,
          regenerations: c.target == null ? 0 : c.regenerations,
          gap_before: pendingInRun.filter((s) => s < step.slot).length,
          gap_after: pendingInRun.filter((s) => s > step.slot).length,
        });
        Object.assign(state.rows[step.slot], { text: res.sentence, fortune: res.fortune, pending: false, kind: "generated" });
        renderEditor();
        renderAll();
      }
      if (state.cancel) break;
    }
  } catch (err) {
    failed = err;
  }
  const generatedAny = slots.some((i) => !state.rows[i].pending && state.rows[i].text);
  for (const i of slots) if (state.rows[i].pending) Object.assign(state.rows[i], { pending: false, text: "" });
  state.generating = false;
  $("stopBtn").hidden = true;
  if (generatedAny) saveToHistory();
  renderEditor();
  renderAll();
  if (failed) setStatus(failed.message, true);
  else if (state.cancel) setStatus("Stopped.");
  else setStatus("Done. Edit the text, redraw part of the line, or click Generate Again. Stored stories are under History.");
}

// ------------------------------------------------------------------ history (multi-story management)

function snapshot() {
  return {
    rows: state.rows.map((r) => ({ text: r.text, kind: r.kind, fortune: r.fortune, pending: false })),
    points: state.points.map((p) => ({ ...p })),
    sketched: [...state.sketched],
    surprisePts: state.surprisePts.map((p) => ({ ...p })),
    title: $("title").value,
    protagonist: protagonist(),
  };
}

function saveToHistory() {
  state.historyCounter++;
  state.history.push({ name: `Story ${state.historyCounter}`, ...snapshot() });
  if (state.menuOpen) renderHistoryMenu();
}

function rollBack(idx) {
  const h = state.history[idx];
  state.rows = h.rows.map((r) => ({ ...r }));
  state.points = h.points.map((p) => ({ ...p }));
  state.sketched = [...h.sketched];
  state.surprisePts = h.surprisePts.map((p) => ({ ...p }));
  if (h.protagonist) $("protagonist").value = h.protagonist;
  closeMenu();
  setStatus(`Rolled back to "${h.name}".`);
}

function renderHistoryMenu() {
  const menu = $("historyMenu");
  menu.innerHTML = "";
  if (!state.history.length) {
    const d = document.createElement("div");
    d.className = "history-empty";
    d.textContent = "No stored stories yet. Each generation is stored here.";
    menu.appendChild(d);
    return;
  }
  state.history.forEach((h, idx) => {
    const item = document.createElement("div");
    item.className = "history-item";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = h.name;
    const ren = document.createElement("button");
    ren.className = "rename"; ren.title = "Rename"; ren.textContent = "✎";
    const del = document.createElement("button");
    del.title = "Delete"; del.textContent = "✕";
    item.append(name, ren, del);
    item.addEventListener("mouseenter", () => { state.previewIndex = idx; renderEditor(); renderAll(); });
    item.addEventListener("mouseleave", () => { state.previewIndex = null; renderEditor(); renderAll(); });
    item.addEventListener("click", (e) => { if (e.target === item || e.target === name) rollBack(idx); });
    ren.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = document.createElement("input");
      input.value = h.name;
      name.replaceWith(input);
      input.focus(); input.select();
      const commit = () => { h.name = input.value.trim() || h.name; renderHistoryMenu(); };
      input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") commit(); if (ev.key === "Escape") renderHistoryMenu(); });
      input.addEventListener("blur", commit);
      input.addEventListener("click", (ev) => ev.stopPropagation());
    });
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      state.history.splice(idx, 1);
      state.previewIndex = null;
      renderHistoryMenu(); renderEditor(); renderAll();
    });
    menu.appendChild(item);
  });
}

function openMenu() {
  state.menuOpen = true;
  $("historyMenu").hidden = false;
  renderHistoryMenu();
  renderAll();
}
function closeMenu() {
  state.menuOpen = false;
  state.previewIndex = null;
  $("historyMenu").hidden = true;
  renderEditor();
  renderAll();
}

// ------------------------------------------------------------------ controls, API, status

function bindControls() {
  $("again").addEventListener("click", () => {
    // regenerate the sketched slots, but keep sentences the writer wrote or edited
    const sketched = state.sketched.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    if (!sketched.length) { setStatus("Sketch a fortune line on the canvas first.", true); return; }
    const slots = sketched.filter((i) => !(state.rows[i].kind === "user" && state.rows[i].text.trim()));
    if (!slots.length) { setStatus("Every sketched sentence was written or edited by you. Redraw the line over a sentence to replace it.", true); return; }
    generateSlots(slots);
  });
  $("penTool").addEventListener("click", () => setTool("pen"));
  $("eraserTool").addEventListener("click", () => setTool("eraser"));
  $("surpriseToggle").addEventListener("change", (e) => {
    surpriseSvg.toggleAttribute("hidden", !e.target.checked);
    renderAll();
  });
  $("historyBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.menuOpen) closeMenu(); else openMenu();
  });
  document.addEventListener("click", (e) => {
    if (state.menuOpen && !e.target.closest(".history")) closeMenu();
  });
  let lastName = "";
  $("protagonist").addEventListener("change", () => {
    const name = protagonist();
    if (name === lastName) return;
    lastName = name;
    const idx = state.rows.map((r, i) => (r.text.trim() ? i : -1)).filter((i) => i >= 0);
    if (idx.length && name) recognizeRows(idx);
  });
  $("stopBtn").addEventListener("click", () => { state.cancel = true; setStatus("Stopping after the current sentence…"); });
}

function setTool(t) {
  state.tool = t;
  $("penTool").classList.toggle("active", t === "pen");
  $("eraserTool").classList.toggle("active", t === "eraser");
  fortuneSvg.classList.toggle("eraser", t === "eraser");
  surpriseSvg.classList.toggle("eraser", t === "eraser");
  state.eraserAt = null;
  renderAll();
}

async function api(path, body) {
  let r;
  try {
    r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) {
    throw new Error("Cannot reach the TaleBrush server. Is `python3 server.py` running?");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Server error ${r.status}`);
  return data;
}

function setStatus(msg, isError = false) {
  const s = $("status");
  s.textContent = msg || "";
  s.classList.toggle("error", !!isError);
}

async function checkHealth() {
  const note = $("modelNote");
  try {
    const r = await fetch("/api/health");
    const h = await r.json();
    if (h.ok) {
      const i = h.info || {};
      const who = [i.backend, i.model].filter(Boolean).join(" / ") || "LLM bridge";
      note.textContent = `Language model: ${who} via the workshop LLM bridge (substitute for the paper's GPT-Neo + GeDi)`;
    } else {
      note.textContent = "Language model: not connected";
      setStatus(`The LLM bridge is not answering at ${h.bridge}. Start it with: python3 llm-bridge/bridge.py claude`, true);
    }
  } catch {
    note.textContent = "";
  }
}

init();
