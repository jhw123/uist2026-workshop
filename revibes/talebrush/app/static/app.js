/* TaleBrush (revibed) front end.
 *
 * Coordinates: the x axis of both canvases is in "slot" units. Slot i (the
 * i-th bullet point in the editor) spans [i, i+1] and its centre is i + 0.5.
 * The y axis is the protagonist's fortune (or surprise) from 0 to 1.
 */
(() => {
  "use strict";

  // ------------------------------------------------------------------ config
  const DEFAULT_SLOTS = 10;
  const DEFAULT_SURPRISE = 0.3;      // used where no surprise is sketched
  const W_MIN = 0.05, W_MAX = 0.28;  // half-width of the sketched envelope (fortune units)
  const SPEED_SLOW = 0.25, SPEED_FAST = 1.6; // px per ms
  const TIGHT_WIDTH = 0.14;          // half-width below this -> 2 regenerations, else 1
  const ERASER_RADIUS = 14;          // px
  const SNAP = 0.3;                  // a stroke ending within 0.3 slot of a centre still covers it
  const PAD = { l: 14, r: 14, t: 14, b: 14 };

  // ------------------------------------------------------------------ state
  const state = {
    lines: [
      { text: "", source: "user", fortune: null },
    ],
    strokes: [],          // fortune sketch: [[{x, y, w}]]
    surpriseStrokes: [],  // surprise sketch: [[{x, y}]]
    surpriseOn: false,
    tool: "pen",
    busy: false,
    lastTargets: null,
    history: [],
    historyCounter: 0,
    historyOpen: false,
    hoverHistory: null,
    activeLine: null,
    drawing: null,
  };
  while (state.lines.length < DEFAULT_SLOTS) state.lines.push({ text: "", source: "user", fortune: null });

  // ------------------------------------------------------------------ dom
  const $ = (id) => document.getElementById(id);
  const editorEl = $("editor"), previewEl = $("preview");
  const fortuneSvg = $("fortune-canvas"), surpriseSvg = $("surprise-canvas");
  const protagonistEl = $("protagonist"), titleEl = $("title");
  const genBtn = $("generate-again"), statusEl = $("status");
  const busyEl = $("busy"), busyText = $("busy-text");
  const historyBtn = $("history-btn"), historyMenu = $("history-menu"), historyList = $("history-list");
  const SVGNS = "http://www.w3.org/2000/svg";
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip hidden";
  document.body.appendChild(tooltip);

  const N = () => state.lines.length;
  const protagonist = () => protagonistEl.value.trim() || "the protagonist";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("error", !!isError);
  }

  // ------------------------------------------------------------------ api
  async function api(path, body) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  }

  async function checkBridge() {
    const banner = $("bridge-banner");
    try {
      const h = await (await fetch("/api/health")).json();
      if (h.ok) { banner.classList.add("hidden"); return; }
      banner.innerHTML = `The LLM bridge is not reachable at <code>${h.bridge}</code>. Start it from the repository root with <code>python3 llm-bridge/bridge.py claude</code>, then reload.`;
    } catch (e) {
      banner.textContent = "The TaleBrush server is not reachable.";
    }
    banner.classList.remove("hidden");
  }

  // ------------------------------------------------------------------ editor
  function autoSize(ta) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }

  function lineClass(l) {
    return "line " + (l.pending ? "pending" : l.text.trim() ? l.source : "");
  }

  function buildLines(container, lines, editable) {
    container.innerHTML = "";
    lines.forEach((l, i) => {
      const row = document.createElement("div");
      row.className = lineClass(l);
      row.dataset.index = i;
      const b = document.createElement("span");
      b.className = "bullet";
      b.textContent = ">";
      const ta = document.createElement("textarea");
      ta.rows = 1;
      ta.value = l.text;
      ta.placeholder = l.pending ? "generating…" : "";
      ta.readOnly = !editable || !!l.pending;
      ta.tabIndex = editable ? 0 : -1;
      row.append(b, ta);
      container.appendChild(row);
      if (editable) wireLine(ta, row);
    });
    requestAnimationFrame(() => container.querySelectorAll("textarea").forEach(autoSize));
  }

  function renderEditor(focusIndex, caret) {
    buildLines(editorEl, state.lines, true);
    if (focusIndex != null) {
      const ta = editorEl.querySelectorAll("textarea")[focusIndex];
      if (ta) { ta.focus(); const c = caret == null ? ta.value.length : caret; ta.setSelectionRange(c, c); }
    }
  }

  function updateLineEl(i) {
    const row = editorEl.children[i];
    if (!row) return renderEditor();
    const l = state.lines[i];
    row.className = lineClass(l);
    const ta = row.querySelector("textarea");
    ta.value = l.text;
    ta.placeholder = l.pending ? "generating…" : "";
    ta.readOnly = !!l.pending;
    autoSize(ta);
  }

  const idx = (row) => Number(row.dataset.index);

  function wireLine(ta, row) {
    ta.addEventListener("input", () => {
      const i = idx(row);
      if (ta.value.includes("\n")) {   // pasted text with line breaks
        const parts = ta.value.split(/\n+/);
        state.lines[i].text = parts[0];
        markEdited(i);
        const extra = parts.slice(1).map((t) => ({ text: t, source: "user", fortune: null, dirty: true }));
        state.lines.splice(i + 1, 0, ...extra);
        renderEditor(i + extra.length);
        scheduleRecognition();
        renderAll();
        return;
      }
      state.lines[i].text = ta.value;
      markEdited(i);
      row.className = lineClass(state.lines[i]);
      autoSize(ta);
      scheduleRecognition();
    });
    ta.addEventListener("focus", () => { state.activeLine = idx(row); row.classList.add("active"); renderCanvases(); });
    ta.addEventListener("blur", () => { state.activeLine = null; row.classList.remove("active"); renderCanvases(); });
    ta.addEventListener("keydown", (e) => {
      const i = idx(row);
      if (state.busy && (e.key === "Enter" || e.key === "Backspace" && ta.selectionStart === 0)) { e.preventDefault(); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const pos = ta.selectionStart;
        const before = ta.value.slice(0, pos), after = ta.value.slice(ta.selectionEnd);
        state.lines[i].text = before;
        if (after !== state.lines[i].text) markEdited(i);
        state.lines.splice(i + 1, 0, { text: after, source: "user", fortune: null, dirty: !!after.trim() });
        renderEditor(i + 1, 0);
        scheduleRecognition();
        renderCanvases();
      } else if (e.key === "Backspace" && ta.selectionStart === 0 && ta.selectionEnd === 0 && i > 0) {
        e.preventDefault();
        const prev = state.lines[i - 1];
        const caret = prev.text.length;
        if (ta.value) { prev.text += (prev.text && !prev.text.endsWith(" ") ? " " : "") + ta.value; markEdited(i - 1); }
        state.lines.splice(i, 1);
        if (!state.lines.length) state.lines.push({ text: "", source: "user", fortune: null });
        renderEditor(i - 1, caret);
        scheduleRecognition();
        renderCanvases();
      } else if (e.key === "ArrowUp" && ta.selectionStart === 0 && i > 0) {
        e.preventDefault();
        editorEl.querySelectorAll("textarea")[i - 1].focus();
      } else if (e.key === "ArrowDown" && ta.selectionStart === ta.value.length && i < N() - 1) {
        e.preventDefault();
        const n = editorEl.querySelectorAll("textarea")[i + 1];
        n.focus(); n.setSelectionRange(0, 0);
      }
    });
  }

  function markEdited(i) {
    const l = state.lines[i];
    l.source = "user";    // an edited sentence becomes the writer's own context
    l.dirty = true;
    l.target = undefined;
    if (!l.text.trim()) { l.fortune = null; l.dirty = false; }
  }

  // ------------------------------------------------------------------ recognition
  let recTimer = null, recRunning = false, recAgain = false;
  function scheduleRecognition(delay = 900) {
    clearTimeout(recTimer);
    recTimer = setTimeout(runRecognition, delay);
  }

  function contextBefore(i, lines = state.lines) {
    const out = [];
    for (let j = 0; j < i; j++) if (lines[j].text.trim() && !lines[j].pending) out.push(lines[j].text.trim());
    return out;
  }
  function contextAfter(i, lines = state.lines) {
    const out = [];
    for (let j = i + 1; j < lines.length; j++) if (lines[j].text.trim() && !lines[j].pending) out.push(lines[j].text.trim());
    return out;
  }

  async function runRecognition() {
    if (recRunning) { recAgain = true; return; }
    const todo = state.lines.map((l, i) => ({ l, i })).filter(({ l }) => l.dirty && l.text.trim() && !l.pending);
    if (!todo.length) return;
    recRunning = true;
    const snapshot = todo.map(({ l }) => l.text);
    todo.forEach(({ l }) => (l.dirty = false));
    setStatus(`Recognizing ${protagonist()}'s fortune in ${todo.length} sentence${todo.length > 1 ? "s" : ""}…`);
    try {
      const res = await api("/api/recognize", {
        protagonist: protagonist(),
        items: todo.map(({ l, i }) => ({ context: contextBefore(i).slice(-3), sentence: l.text.trim() })),
      });
      todo.forEach(({ l }, k) => {
        if (l.text === snapshot[k]) l.fortune = res.fortunes[k];
        else l.dirty = true;   // changed while we were waiting
      });
      setStatus("");
    } catch (e) {
      todo.forEach(({ l }) => (l.dirty = true));
      setStatus("Recognition failed: " + e.message, true);
    }
    recRunning = false;
    renderCanvases();
    if (recAgain || state.lines.some((l) => l.dirty && l.text.trim())) { recAgain = false; scheduleRecognition(300); }
  }

  // ------------------------------------------------------------------ sketch geometry
  function geom(svg) {
    const W = svg.clientWidth || 600, H = Number(svg.getAttribute("height"));
    const pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b;
    const n = N();
    return {
      W, H, n,
      xPx: (x) => PAD.l + (x / n) * pw,
      yPx: (y) => PAD.t + (1 - y) * ph,
      xData: (px) => clamp(((px - PAD.l) / pw) * n, 0, n),
      yData: (py) => clamp(1 - (py - PAD.t) / ph, 0, 1),
      yScale: ph,
    };
  }

  /** Sketched value at a slot centre (last stroke that covers it wins). */
  function sampleSlot(strokes, i) {
    const cx = i + 0.5;
    let hit = null;
    for (const s of strokes) {
      for (let k = 0; k + 1 < s.length; k++) {
        const a = s[k], b = s[k + 1];
        if ((a.x - cx) * (b.x - cx) <= 0 && a.x !== b.x) {
          const t = (cx - a.x) / (b.x - a.x);
          hit = { y: a.y + t * (b.y - a.y), w: (a.w ?? 0) + t * ((b.w ?? 0) - (a.w ?? 0)) };
        }
      }
      if (!hit && s.length) {
        // snap a stroke that starts or ends just short of the centre
        // (not an end made by the eraser or by redrawing: that gap is intended)
        for (const p of [s[0], s[s.length - 1]]) {
          if (!p.cut && Math.abs(p.x - cx) <= SNAP) hit = { y: p.y, w: p.w ?? 0 };
        }
      }
    }
    return hit;
  }

  function sketchedSlots(strokes) {
    const out = [];
    for (let i = 0; i < N(); i++) if (sampleSlot(strokes, i)) out.push(i);
    return out;
  }

  /** Split strokes, dropping points where remove(p) is true. Ends created by a
   *  split are flagged `cut` so they do not snap onto neighbouring slots. */
  function splitStrokes(strokes, remove) {
    const out = [];
    let changed = false;
    for (const s of strokes) {
      let cur = [], afterCut = false;
      for (const p of s) {
        if (remove(p)) {
          changed = true;
          if (cur.length) cur[cur.length - 1] = { ...cur[cur.length - 1], cut: true };
          if (cur.length > 1) out.push(cur);
          cur = [];
          afterCut = true;
        } else {
          cur.push(afterCut ? { ...p, cut: true } : p);
          afterCut = false;
        }
      }
      if (cur.length > 1) out.push(cur);
    }
    return changed ? out : strokes;
  }

  function cutRange(strokes, x0, x1) {
    return splitStrokes(strokes, (p) => p.x >= x0 && p.x <= x1);
  }

  /** The eraser removes any part of the band it touches, not only its centre line. */
  function eraseAt(strokes, g, px, py) {
    return splitStrokes(strokes, (p) => {
      const half = (p.w || 0) * g.yScale;
      return Math.abs(g.xPx(p.x) - px) < ERASER_RADIUS && Math.abs(g.yPx(p.y) - py) < ERASER_RADIUS + half;
    });
  }

  const widthForSpeed = (v) => W_MIN + (W_MAX - W_MIN) * clamp((v - SPEED_SLOW) / (SPEED_FAST - SPEED_SLOW), 0, 1);

  // ------------------------------------------------------------------ rendering
  function el(name, attrs = {}, parent) {
    const e = document.createElementNS(SVGNS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }

  function smoothPath(pts) {
    // Catmull-Rom through pts ([[x,y]]), as cubic beziers
    if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i + 1 < pts.length; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  function drawBackground(svg, g, kind) {
    const defs = el("defs", {}, svg);
    const pat = el("pattern", { id: kind + "-hatch", width: 7, height: 7, patternUnits: "userSpaceOnUse", patternTransform: "rotate(-35)" }, defs);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 7, stroke: "#59cf8a", "stroke-width": 2.2, "stroke-opacity": 0.75 }, pat);
    const clip = el("clipPath", { id: kind + "-clip" }, defs);
    el("rect", { x: PAD.l, y: 0, width: g.W - PAD.l - PAD.r, height: g.H }, clip);

    if (kind === "fortune") {
      el("rect", { x: PAD.l, y: g.yPx(1), width: g.W - PAD.l - PAD.r, height: g.yPx(0.66) - g.yPx(1), fill: "#fdf8e8" }, svg);
      el("rect", { x: PAD.l, y: g.yPx(0.33), width: g.W - PAD.l - PAD.r, height: g.yPx(0) - g.yPx(0.33), fill: "#ececea" }, svg);
      el("text", { x: g.W - PAD.r - 4, y: g.yPx(1) + 12, "text-anchor": "end", "font-size": 10, fill: "#c9b26a" }, svg).textContent = "good fortune";
      el("text", { x: g.W - PAD.r - 4, y: g.yPx(0) - 4, "text-anchor": "end", "font-size": 10, fill: "#9a9a9a" }, svg).textContent = "bad fortune";
    }
    // sentence-unit boundaries (subtle vertical lines)
    for (let i = 0; i <= g.n; i++) {
      el("line", { x1: g.xPx(i), x2: g.xPx(i), y1: PAD.t - 6, y2: g.H - PAD.b + 6, stroke: "#d9d9d6", "stroke-width": 1 }, svg);
    }
    el("line", { x1: PAD.l, x2: g.W - PAD.r, y1: g.yPx(0.5), y2: g.yPx(0.5), stroke: "#a9a9a6", "stroke-width": 1.6 }, svg);
    if (state.activeLine != null && state.activeLine < g.n) {
      el("rect", { x: g.xPx(state.activeLine), y: PAD.t - 6, width: g.xPx(1) - g.xPx(0), height: g.H - PAD.t - PAD.b + 12, fill: "#3d8ef0", "fill-opacity": 0.06 }, svg);
    }
    state.lines.forEach((l, i) => {
      if (l.pending) el("rect", { x: g.xPx(i), y: PAD.t - 6, width: g.xPx(1) - g.xPx(0), height: g.H - PAD.t - PAD.b + 12, fill: "#3d8ef0", "fill-opacity": 0.08 }, svg);
    });
  }

  function drawEnvelope(svg, g, s) {
    if (s.length < 2) return;
    const up = s.map((p) => [g.xPx(p.x), g.yPx(clamp(p.y + p.w, -0.03, 1.03))]);
    const lo = s.map((p) => [g.xPx(p.x), g.yPx(clamp(p.y - p.w, -0.03, 1.03))]).reverse();
    const d = "M" + up.concat(lo).map((p) => p.join(",")).join(" L") + " Z";
    const grp = el("g", { "clip-path": "url(#fortune-clip)" }, svg);
    el("path", { d, fill: "#7fd9a3", "fill-opacity": 0.18, stroke: "none" }, grp);
    el("path", { d, fill: "url(#fortune-hatch)", stroke: "none" }, grp);
  }

  /** Slots inside the sketched span with no sketch (erased): generated without a fortune target. */
  function unconstrainedSlots() {
    const sk = sketchedSlots(state.strokes);
    const out = [];
    if (sk.length < 2) return out;
    for (let i = sk[0] + 1; i < sk[sk.length - 1]; i++) {
      const l = state.lines[i];
      if (!sampleSlot(state.strokes, i) && !(l.text.trim() && l.source === "user")) out.push(i);
    }
    return out;
  }

  function drawUnconstrained(svg, g) {
    for (const i of unconstrainedSlots()) {
      const x = g.xPx(i + 0.5);
      el("line", { x1: x, x2: x, y1: g.yPx(0.96), y2: g.yPx(0.04), stroke: "#59cf8a", "stroke-width": 1.5, "stroke-dasharray": "3 5", "stroke-opacity": 0.8 }, svg);
      el("text", { x, y: g.yPx(0) - 3, "text-anchor": "middle", "font-size": 9.5, fill: "#3c9a5c" }, svg).textContent = "no target";
    }
  }

  function drawArc(svg, g, lines, opts = {}) {
    // recognized fortune of each sentence: dots, connected within runs of non-blank sentences
    const pts = lines.map((l, i) => (l.text && l.text.trim() && l.fortune != null && !l.pending ? { i, x: g.xPx(i + 0.5), y: g.yPx(l.fortune), l } : null));
    const grp = el("g", { opacity: opts.opacity ?? 1 }, svg);
    for (let i = 0; i + 1 < pts.length; i++) {
      if (!pts[i] || !pts[i + 1]) continue;
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6];
      const c2 = [p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6];
      const color = opts.color || (p2.l.source === "generated" ? "var(--blue)" : "var(--gray-arc)");
      el("path", { d: `M${p1.x},${p1.y} C${c1} ${c2} ${p2.x},${p2.y}`, fill: "none", stroke: color, "stroke-width": opts.width || 2.4, "stroke-linecap": "round" }, grp);
    }
    pts.forEach((p) => {
      if (!p) return;
      const color = opts.color || (p.l.source === "generated" ? "var(--blue)" : "var(--gray-arc)");
      // hollow dot = generated without a fortune target (erased part of the sketch)
      const free = !opts.color && p.l.source === "generated" && p.l.target == null;
      const dot = el("circle", free
        ? { cx: p.x, cy: p.y, r: opts.dot || 4.5, fill: "#fff", stroke: color, "stroke-width": 2 }
        : { cx: p.x, cy: p.y, r: opts.dot || 4.5, fill: color, stroke: "#fff", "stroke-width": 1.2 }, grp);
      if (opts.interactive) {
        dot.style.cursor = "pointer";
        dot.addEventListener("pointerenter", (e) => showTip(e, p.i, p.l));
        dot.addEventListener("pointerleave", hideTip);
        dot.addEventListener("dblclick", () => focusLine(p.i));
      }
    });
  }

  function showTip(e, i, l) {
    const t = l.target == null ? (l.source === "generated" ? "no target (unconstrained)" : "written by you") : `target ${l.target.toFixed(2)}`;
    tooltip.innerHTML = "";
    const b = document.createElement("div");
    b.textContent = `#${i + 1} · fortune ${l.fortune.toFixed(2)} · ${t}`;
    b.style.opacity = 0.75;
    const s = document.createElement("div");
    s.textContent = l.text;
    tooltip.append(b, s);
    tooltip.style.left = e.clientX + 12 + "px";
    tooltip.style.top = e.clientY + 12 + "px";
    tooltip.classList.remove("hidden");
  }
  function hideTip() { tooltip.classList.add("hidden"); }
  function focusLine(i) { const ta = editorEl.querySelectorAll("textarea")[i]; if (ta) ta.focus(); }

  function renderFortune() {
    const svg = fortuneSvg, g = geom(svg);
    svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${g.W} ${g.H}`);
    drawBackground(svg, g, "fortune");
    for (const s of state.strokes) drawEnvelope(svg, g, s);
    if (state.drawing && state.drawing.svg === svg && state.drawing.pts.length > 1) drawEnvelope(svg, g, state.drawing.pts);
    drawUnconstrained(svg, g);

    if (state.historyOpen) {
      state.history.forEach((h) => {
        if (h === state.hoverHistory) return;
        drawArc(svg, g, h.lines, { opacity: 0.22, color: "#777", width: 1.8, dot: 3 });
      });
    }
    if (state.hoverHistory) {
      drawArc(svg, g, state.hoverHistory.lines, { opacity: 0.95, color: "#1f6fd6", width: 3, dot: 5 });
      drawArc(svg, g, state.lines, { opacity: 0.25 });
    } else {
      drawArc(svg, g, state.lines, { interactive: true });
    }
  }

  function renderSurprise() {
    if (!state.surpriseOn) return;
    const svg = surpriseSvg, g = geom(svg);
    svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${g.W} ${g.H}`);
    drawBackground(svg, g, "surprise");
    const all = state.surpriseStrokes.slice();
    if (state.drawing && state.drawing.svg === svg) all.push(state.drawing.pts);
    for (const s of all) {
      if (s.length < 2) continue;
      el("path", { d: smoothPath(s.map((p) => [g.xPx(p.x), g.yPx(p.y)])), fill: "none", stroke: "#3c9a5c", "stroke-width": 2.2, "stroke-linecap": "round", "clip-path": "url(#surprise-clip)" }, svg);
    }
    // per-slot surprise value markers
    for (let i = 0; i < g.n; i++) {
      const h = sampleSlot(state.surpriseStrokes, i);
      if (h) el("circle", { cx: g.xPx(i + 0.5), cy: g.yPx(h.y), r: 2.5, fill: "#3c9a5c" }, svg);
    }
  }

  function renderCanvases() { renderFortune(); renderSurprise(); }
  function renderAll() { renderCanvases(); renderHistory(); genBtn.disabled = state.busy; }

  // ------------------------------------------------------------------ sketch input
  function attachSketch(svg, kind) {
    svg.addEventListener("pointerdown", (e) => {
      if (state.busy) { setStatus("Wait for the generation to finish."); return; }
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      const g = geom(svg);
      const r = svg.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      if (state.tool === "eraser") {
        state.drawing = { svg, kind, erase: true, changed: false };
        erase(kind, g, px, py);
        return;
      }
      state.drawing = { svg, kind, pts: [], last: { px, py, t: performance.now() }, speed: 0.6 };
      state.drawing.pts.push({ x: g.xData(px), y: g.yData(py), w: widthForSpeed(0.6) });
      renderCanvases();
    });
    svg.addEventListener("pointermove", (e) => {
      const d = state.drawing;
      if (!d || d.svg !== svg) return;
      const g = geom(svg);
      const r = svg.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      if (d.erase) { erase(kind, g, px, py); return; }
      const now = performance.now();
      const dist = Math.hypot(px - d.last.px, py - d.last.py);
      if (dist < 2) return;
      const dt = Math.max(1, now - d.last.t);
      d.speed = 0.8 * d.speed + 0.2 * (dist / dt);   // smoothed so the width changes gradually
      d.last = { px, py, t: now };
      d.pts.push({ x: g.xData(px), y: g.yData(py), w: widthForSpeed(d.speed) });
      renderCanvases();
    });
    const end = () => {
      const d = state.drawing;
      if (!d || d.svg !== svg) return;
      state.drawing = null;
      if (d.erase) {
        renderCanvases();
        if (d.changed && kind === "fortune") setStatus("Erased. Erased slots are generated without a fortune target. Click “Generate Again” to regenerate.");
        return;
      }
      if (d.pts.length < 2) { renderCanvases(); return; }
      const xs = d.pts.map((p) => p.x);
      const x0 = Math.min(...xs), x1 = Math.max(...xs);
      if (kind === "fortune") {
        state.strokes = cutRange(state.strokes, x0, x1).concat([d.pts]);
        const touched = sketchedSlots([d.pts]);
        renderCanvases();
        if (touched.length) generateFor(withUnconstrainedGaps(touched));
      } else {
        state.surpriseStrokes = cutRange(state.surpriseStrokes, x0, x1).concat([d.pts.map(({ x, y }) => ({ x, y }))]);
        renderCanvases();
        setStatus("Surprise sketched. It applies to the next generation.");
      }
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
  }

  function erase(kind, g, px, py) {
    const key = kind === "fortune" ? "strokes" : "surpriseStrokes";
    const next = eraseAt(state[key], g, px, py);
    if (next !== state[key]) { state[key] = next; state.drawing.changed = true; }
    renderCanvases();
  }

  /** Add blank, un-sketched slots lying between sketched slots (an erased gap). */
  function withUnconstrainedGaps(slots) {
    const set = new Set(slots);
    const sk = sketchedSlots(state.strokes);
    if (sk.length) {
      const lo = Math.min(...sk, ...slots), hi = Math.max(...sk, ...slots);
      for (let i = lo; i <= hi; i++) {
        if (!sampleSlot(state.strokes, i) && !state.lines[i].text.trim()) set.add(i);
      }
    }
    return [...set].sort((a, b) => a - b);
  }

  // ------------------------------------------------------------------ generation
  function surpriseAt(i) {
    if (!state.surpriseOn) return DEFAULT_SURPRISE;
    const h = sampleSlot(state.surpriseStrokes, i);
    return h ? h.y : DEFAULT_SURPRISE;
  }

  const isWriters = (i) => state.lines[i].text.trim() && state.lines[i].source === "user";

  async function generateFor(targets) {
    targets = targets.filter((i) => i < N());
    // The writer's own sentences (typed or edited) are never overwritten: a stroke
    // drawn across a written beginning and ending infills only the slots between.
    const kept = targets.filter(isWriters);
    targets = targets.filter((i) => !isWriters(i));
    if (!targets.length) {
      if (kept.length) setStatus("Those slots hold your own sentences, so nothing was generated. Clear a sentence to let TaleBrush rewrite it.");
      return;
    }
    if (!state.history.length && state.lines.some((l) => l.text.trim())) storeHistory("Initial");
    state.busy = true;
    state.lastTargets = targets.slice();
    genBtn.disabled = true;
    targets.forEach((i) => Object.assign(state.lines[i], { text: "", pending: true, fortune: null, target: undefined, dirty: false }));
    renderEditor();
    renderCanvases();
    busyEl.classList.remove("hidden");

    // contiguous runs, left to right
    const runs = [];
    for (const i of targets) {
      const r = runs[runs.length - 1];
      if (r && r[r.length - 1] === i - 1) r.push(i); else runs.push([i]);
    }
    const total = targets.length;
    let done = 0, failed = null;
    try {
      for (const run of runs) {
        const remaining = run.slice();
        let fromPrev = true;
        while (remaining.length) {
          const hasNext = contextAfter(remaining[remaining.length - 1]).length > 0;
          let slot, mode;
          if (!hasNext) { slot = remaining.shift(); mode = "continue"; }
          else if (fromPrev) { slot = remaining.shift(); mode = "infill_prev"; fromPrev = false; }
          else { slot = remaining.pop(); mode = "infill_next"; fromPrev = true; }
          const sk = sampleSlot(state.strokes, slot);
          const target = sk ? clamp(sk.y, 0, 1) : null;
          const maxRegen = sk && sk.w < TIGHT_WIDTH ? 2 : 1;
          const label = { continue: "continuation", infill_prev: "infill from previous", infill_next: "infill from next" }[mode];
          busyText.textContent = `Generating sentence ${done + 1} of ${total} (#${slot + 1}, ${label}${target == null ? ", no fortune target" : ""})…`;
          const res = await api("/api/generate", {
            protagonist: protagonist(),
            mode,
            prev: contextBefore(slot),
            next: contextAfter(slot),
            target,
            surprise: surpriseAt(slot),
            max_regen: maxRegen,
            gap: remaining.length,   // other sentences still missing in this gap
          });
          Object.assign(state.lines[slot], { text: res.sentence, source: "generated", fortune: res.fortune, target, pending: false, dirty: false, tries: res.generations_used });
          done++;
          updateLineEl(slot);
          renderCanvases();
        }
      }
    } catch (e) {
      failed = e;
    }
    state.lines.forEach((l) => { if (l.pending) { l.pending = false; } });
    state.busy = false;
    busyEl.classList.add("hidden");
    renderEditor();
    if (failed) {
      setStatus("Generation failed: " + failed.message, true);
    } else {
      storeHistory();
      const tight = targets.filter((i) => state.lines[i].target != null);
      const err = tight.length ? tight.reduce((a, i) => a + Math.abs(state.lines[i].fortune - state.lines[i].target), 0) / tight.length : null;
      const free = targets.filter((i) => state.lines[i].target == null).length;
      setStatus(`Generated ${done} sentence${done === 1 ? "" : "s"}` +
        (free ? ` (${free} without a fortune target)` : "") +
        (err != null ? ` · mean distance from sketch ${err.toFixed(2)}` : "") +
        (kept.length ? ` · kept your sentence${kept.length > 1 ? "s" : ""} #${kept.map((i) => i + 1).join(", #")}` : "") +
        ". Stored in History.");
    }
    renderAll();
  }

  genBtn.addEventListener("click", () => {
    if (state.busy) return;
    let targets = state.lastTargets;
    if (!targets || !targets.length) {
      const sk = sketchedSlots(state.strokes);
      if (!sk.length) { setStatus("Sketch the protagonist's fortune on the canvas first."); return; }
      targets = withUnconstrainedGaps(sk);
    }
    generateFor(targets);
  });

  // ------------------------------------------------------------------ history (multi-story management)
  function storeHistory(name) {
    state.historyCounter += name ? 0 : 1;
    state.history.push({
      id: Date.now() + Math.random(),
      name: name || `Story ${state.historyCounter}`,
      lines: clone(state.lines.map(({ text, source, fortune, target }) => ({ text, source, fortune, target }))),
      strokes: clone(state.strokes),
      surpriseStrokes: clone(state.surpriseStrokes),
    });
    renderHistory();
  }

  function renderHistory() {
    historyList.innerHTML = "";
    historyMenu.querySelector(".history-empty").classList.toggle("hidden", state.history.length > 0);
    state.history.forEach((h) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = h.name;
      const ren = document.createElement("button");
      ren.title = "Rename";
      ren.textContent = "✎";
      const del = document.createElement("button");
      del.className = "del";
      del.title = "Delete";
      del.textContent = "×";
      li.append(name, ren, del);
      li.addEventListener("mouseenter", () => previewHistory(h));
      li.addEventListener("mouseleave", () => previewHistory(null));
      li.addEventListener("click", (e) => {
        if (e.target !== li && e.target !== name) return;
        rollBack(h);
      });
      ren.addEventListener("click", (e) => {
        e.stopPropagation();
        const inp = document.createElement("input");
        inp.value = h.name;
        li.replaceChild(inp, name);
        inp.focus(); inp.select();
        const done = () => { h.name = inp.value.trim() || h.name; renderHistory(); };
        inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") done(); if (ev.key === "Escape") renderHistory(); });
        inp.addEventListener("blur", done);
        inp.addEventListener("click", (ev) => ev.stopPropagation());
      });
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        state.history = state.history.filter((x) => x !== h);
        previewHistory(null);
        renderHistory();
      });
      historyList.appendChild(li);
    });
  }

  function previewHistory(h) {
    state.hoverHistory = h;
    if (h) {
      buildLines(previewEl, h.lines, false);
      previewEl.classList.remove("hidden");
      editorEl.classList.add("hidden");
    } else {
      previewEl.classList.add("hidden");
      editorEl.classList.remove("hidden");
    }
    renderCanvases();
  }

  function rollBack(h) {
    if (state.busy) return;
    state.lines = clone(h.lines).map((l) => ({ ...l, dirty: false }));
    state.strokes = clone(h.strokes);
    state.surpriseStrokes = clone(h.surpriseStrokes);
    state.lastTargets = null;
    closeHistory();
    renderEditor();
    renderAll();
    setStatus(`Rolled back to “${h.name}”.`);
  }

  function closeHistory() {
    state.historyOpen = false;
    historyMenu.classList.add("hidden");
    previewHistory(null);
  }

  historyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    state.historyOpen = !state.historyOpen;
    historyMenu.classList.toggle("hidden", !state.historyOpen);
    if (!state.historyOpen) previewHistory(null);
    renderCanvases();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.isConnected) return;   // e.g. a deleted history entry
    if (state.historyOpen && !historyMenu.contains(e.target) && e.target !== historyBtn) closeHistory();
  });

  $("new-story").addEventListener("click", () => {
    if (state.busy) return;
    const hasText = state.lines.some((l) => l.text.trim());
    const last = state.history[state.history.length - 1];
    const same = last && JSON.stringify(last.lines.map((l) => l.text)) === JSON.stringify(state.lines.map((l) => l.text));
    if (hasText && !same) storeHistory();
    state.lines = Array.from({ length: DEFAULT_SLOTS }, () => ({ text: "", source: "user", fortune: null }));
    state.strokes = [];
    state.surpriseStrokes = [];
    state.lastTargets = null;
    titleEl.value = "";
    renderEditor(0, 0);
    renderAll();
    setStatus(hasText && !same ? "Started a new story. The previous one is in History." : "Started a new story.");
  });

  // ------------------------------------------------------------------ misc controls
  function setTool(t) {
    state.tool = t;
    $("tool-pen").classList.toggle("active", t === "pen");
    $("tool-eraser").classList.toggle("active", t === "eraser");
    $("tool-pen").setAttribute("aria-pressed", t === "pen");
    $("tool-eraser").setAttribute("aria-pressed", t === "eraser");
    fortuneSvg.classList.toggle("eraser", t === "eraser");
    surpriseSvg.classList.toggle("eraser", t === "eraser");
  }
  $("tool-pen").addEventListener("click", () => setTool("pen"));
  $("tool-eraser").addEventListener("click", () => setTool("eraser"));

  $("surprise-on").addEventListener("change", (e) => {
    state.surpriseOn = e.target.checked;
    $("surprise-wrap").classList.toggle("hidden", !state.surpriseOn);
    renderCanvases();
  });

  let lastName = protagonistEl.value;
  protagonistEl.addEventListener("change", () => {
    if (protagonistEl.value.trim() === lastName) return;
    lastName = protagonistEl.value.trim();
    state.lines.forEach((l) => { if (l.text.trim()) l.dirty = true; });
    scheduleRecognition(100);
  });

  window.addEventListener("resize", renderCanvases);

  // ------------------------------------------------------------------ boot
  attachSketch(fortuneSvg, "fortune");
  attachSketch(surpriseSvg, "surprise");
  renderEditor();
  renderAll();
  checkBridge();
  setStatus("Name the protagonist, write a sentence or two, then sketch their fortune on the canvas.");

  // ------------------------------------------------------------------ design chat
  (function chatInit() {
    const box = document.getElementById("chat"), toggle = document.getElementById("chat-toggle");
    const log = document.getElementById("chat-log"), form = document.getElementById("chat-form");
    const input = document.getElementById("chat-input"), sug = document.getElementById("chat-suggest");
    const history = [];
    const add = (role, text, cls) => {
      const d = document.createElement("div");
      d.className = "chat-msg " + role + (cls ? " " + cls : "");
      d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
    };
    const open = (v) => { box.classList.toggle("hidden", !v); toggle.classList.toggle("hidden", v); if (v) input.focus(); };
    toggle.onclick = () => open(true);
    document.getElementById("chat-close").onclick = () => open(false);
    add("assistant", "Ask me why TaleBrush was designed the way it was, or how a feature works. Answers come from the paper.");
    ["Why sketch the fortune arc?", "Why does line width mean control?", "How is surprise handled?", "How does fortune recognition work?"].forEach((q) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = q;
      b.onclick = () => { input.value = q; form.requestSubmit(); }; sug.appendChild(b);
    });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const q = input.value.trim(); if (!q || form.dataset.busy) return;
      input.value = ""; add("user", q); form.dataset.busy = "1";
      const wait = add("assistant", "Thinking…");
      try {
        const context = { protagonist: document.getElementById("protagonist").value, story: state.lines.map((l) => l.text).filter(Boolean) };
        const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, history, context }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || r.statusText);
        wait.textContent = j.answer; history.push({ role: "user", content: q }, { role: "assistant", content: j.answer });
      } catch (err) { wait.textContent = "Error: " + err.message; wait.classList.add("error"); }
      delete form.dataset.busy; log.scrollTop = log.scrollHeight;
    };
  })();
})();
