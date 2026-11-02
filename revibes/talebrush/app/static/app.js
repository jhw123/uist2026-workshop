/* TaleBrush front end: text editor, fortune sketch canvas, surprise panel,
 * pen/eraser, Generate Again, and the story history (paper Section 4). */
'use strict';

// ---------------------------------------------------------------- constants
const GRID = 600;               // sketch resolution along x (columns)
const DEFAULT_SLOTS = 8;        // bullets shown at start (Figure 1 A2 shows 8)
const DEFAULT_SURPRISE = 0.3;   // surprise used when no surprise is sketched (assumption)
const MIN_HALF_WIDTH = 0.04;    // envelope half-width, in fortune units, for a very slow stroke
const MAX_HALF_WIDTH = 0.30;    // ... for a very fast stroke
const TIGHT_WIDTH = 0.15;       // narrower than this -> regenerate up to 2 times, else 1
const PAD = { l: 14, r: 14, t: 14, b: 14 };

// ---------------------------------------------------------------- state
const state = {
  bullets: [],                  // {text, source:'user'|'ai', fortune:number|null, recText:string|null, pending:false}
  sketch: new Array(GRID).fill(null),    // {y, w} per column; y in 0..1, w = envelope half-width
  surprise: new Array(GRID).fill(null),  // y in 0..1 per column
  tool: 'pen',
  dirty: new Set(),             // slots whose sketch changed since the last generation
  history: [],                  // stored stories (Section 4.2.3)
  currentHistory: null,
  historyOpen: false,
  previewHistory: null,
  generating: false,
  abort: false,
  genCount: 0,
};

const $ = (id) => document.getElementById(id);
const editorEl = $('editor');
const fortuneCanvas = $('fortuneCanvas');
const surpriseCanvas = $('surpriseCanvas');

function newBullet(text = '', source = 'user') {
  return { text, source, fortune: null, recText: null, pending: false };
}

// ---------------------------------------------------------------- editor
function renderEditor() {
  const list = state.previewHistory ? state.previewHistory.bullets : state.bullets;
  editorEl.classList.toggle('preview', !!state.previewHistory);
  editorEl.innerHTML = '';
  list.forEach((b, i) => {
    const row = document.createElement('div');
    row.className = 'bullet' + (b.source === 'ai' && b.text ? ' ai' : '') + (b.pending ? ' pending' : '');
    row.dataset.index = i;
    const bar = document.createElement('div'); bar.className = 'bar';
    const marker = document.createElement('div'); marker.className = 'marker'; marker.textContent = '>';
    const ta = document.createElement('textarea');
    ta.rows = 1; ta.value = b.pending ? '' : b.text;
    ta.placeholder = b.pending ? 'generating…' : '';
    ta.readOnly = !!state.previewHistory || b.pending || state.generating;
    const fv = document.createElement('div'); fv.className = 'fval';
    fv.textContent = (b.text && b.fortune != null && !b.pending) ? b.fortune.toFixed(2) : '';
    fv.title = 'recognized fortune (0 = bad, 1 = good)';
    row.append(bar, marker, ta, fv);
    editorEl.append(row);
    autosize(ta);
    if (state.previewHistory) return;
    ta.addEventListener('input', () => {
      b.text = ta.value.replace(/\n/g, ' ');
      if (b.source === 'ai') { b.source = 'user'; row.classList.remove('ai'); }
      autosize(ta);
      scheduleRecognize();
    });
    ta.addEventListener('keydown', (e) => onBulletKey(e, i, ta));
    ta.addEventListener('focus', () => { hoverSlot = i; drawAll(); });
    ta.addEventListener('blur', () => { hoverSlot = null; drawAll(); });
  });
}

function autosize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }

function focusBullet(i, atEnd = true) {
  const ta = editorEl.querySelectorAll('textarea')[i];
  if (!ta) return;
  ta.focus();
  const p = atEnd ? ta.value.length : 0;
  ta.setSelectionRange(p, p);
}

function onBulletKey(e, i, ta) {
  if (state.generating) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    // split the bullet at the caret, like a standard editor
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos).trim(), after = ta.value.slice(pos).trim();
    const b = state.bullets[i];
    if (after) { b.text = before; b.source = 'user'; }
    state.bullets.splice(i + 1, 0, newBullet(after));
    afterStructureChange();
    focusBullet(i + 1, false);
  } else if (e.key === 'Backspace' && ta.selectionStart === 0 && ta.selectionEnd === 0 && state.bullets.length > 1) {
    const b = state.bullets[i];
    if (b.text === '') {
      e.preventDefault();
      state.bullets.splice(i, 1);
      afterStructureChange();
      focusBullet(Math.max(0, i - 1));
    }
  } else if (e.key === 'ArrowUp' && ta.selectionStart === 0 && i > 0) {
    e.preventDefault(); focusBullet(i - 1);
  } else if (e.key === 'ArrowDown' && ta.selectionEnd === ta.value.length && i < state.bullets.length - 1) {
    e.preventDefault(); focusBullet(i + 1, false);
  }
}

function afterStructureChange() {
  // changing the number of bullets changes which slot each sketch column belongs to
  renderEditor();
  scheduleRecognize();
  drawAll();
}

// ---------------------------------------------------------------- recognition
let recogTimer = null;
function scheduleRecognize(delay = 900) {
  clearTimeout(recogTimer);
  recogTimer = setTimeout(recognizeStale, delay);
}

async function recognizeStale() {
  if (state.generating) { scheduleRecognize(1500); return; }
  const story = state.bullets.map((b) => b.text.trim());
  // a sentence's fortune depends on up to three previous sentences, so
  // re-recognize a slot when its text or its preceding context changed
  const indices = [];
  state.bullets.forEach((b, i) => {
    const key = story.slice(Math.max(0, i - 3), i + 1).join('\u0001');
    if (b.text.trim() && b.recText !== key) indices.push(i);
    if (!b.text.trim()) b.fortune = null;
  });
  drawAll();
  if (!indices.length) return;
  setStatus('Recognizing fortune of ' + indices.length + ' sentence(s)…');
  try {
    const res = await api('/api/recognize', { protagonist: protagonist(), story, indices });
    for (const [k, v] of Object.entries(res.fortunes)) {
      const i = +k, b = state.bullets[i];
      if (!b || b.text.trim() !== story[i]) continue;    // changed meanwhile
      b.fortune = v;
      b.recText = story.slice(Math.max(0, i - 3), i + 1).join('\u0001');
    }
    setStatus('');
  } catch (err) { setStatus(err.message, true); }
  renderFortuneValues();
  drawAll();
}

function renderFortuneValues() {
  editorEl.querySelectorAll('.bullet').forEach((row, i) => {
    const b = state.bullets[i]; if (!b) return;
    row.querySelector('.fval').textContent = (b.text && b.fortune != null && !b.pending) ? b.fortune.toFixed(2) : '';
  });
}

// ---------------------------------------------------------------- canvas geometry
function setupCanvas(cv) {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W: r.width, H: r.height };
}
function plot(cv) {
  const r = cv.getBoundingClientRect();
  return { x0: PAD.l, y0: PAD.t, w: r.width - PAD.l - PAD.r, h: r.height - PAD.t - PAD.b };
}
const nSlots = () => Math.max(1, state.bullets.length);
const colToX = (c, p) => p.x0 + ((c + 0.5) / GRID) * p.w;
const valToY = (v, p) => p.y0 + (1 - v) * p.h;
const slotCenterX = (i, p) => p.x0 + ((i + 0.5) / nSlots()) * p.w;
const colToSlot = (c) => Math.min(nSlots() - 1, Math.floor((c / GRID) * nSlots()));
function slotCols(i) {   // columns that belong to slot i
  const a = Math.floor((i / nSlots()) * GRID), b = Math.floor(((i + 1) / nSlots()) * GRID);
  return [a, Math.max(a + 1, b)];
}

// Fortune target, tolerance and surprise for slot i come from the central half
// of the slot's columns ("sentence units", Section 4.2.2).
function slotSketch(i, arr = state.sketch) {
  const [a, b] = slotCols(i);
  const q = Math.floor((b - a) / 4);
  let ys = 0, ws = 0, n = 0;
  for (let c = a + q; c < b - q; c++) {
    const s = arr[c]; if (s == null) continue;
    if (typeof s === 'number') { ys += s; n++; } else { ys += s.y; ws += s.w; n++; }
  }
  if (!n) return null;
  return { y: ys / n, w: ws / n };
}

// ---------------------------------------------------------------- drawing
let hatch = null;
function hatchPattern(ctx) {
  if (hatch) return hatch;
  const pc = document.createElement('canvas'); pc.width = pc.height = 8;
  const g = pc.getContext('2d');
  g.strokeStyle = 'rgba(63,191,127,0.55)'; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(6, 10); g.lineTo(10, 6); g.stroke();
  hatch = ctx.createPattern(pc, 'repeat');
  return hatch;
}

let hoverSlot = null;

function drawFortune() {
  const { ctx, W, H } = setupCanvas(fortuneCanvas);
  const p = plot(fortuneCanvas);
  hatch = null;
  ctx.clearRect(0, 0, W, H);
  // background bands: good (top, warm) to bad (bottom, gray)
  roundRect(ctx, 0, 0, W, H, 16); ctx.save(); ctx.clip();
  const bands = ['#fffaf0', '#fdfbf4', '#f7f7f5', '#efefef', '#e7e7e7'];
  bands.forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(0, (k * H) / 5, W, H / 5 + 1); });
  ctx.restore();
  // sentence-unit lines (subtle vertical lines)
  for (let i = 0; i < nSlots(); i++) {
    const x = slotCenterX(i, p);
    ctx.strokeStyle = hoverSlot === i ? '#f0c040' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = hoverSlot === i ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x, p.y0); ctx.lineTo(x, p.y0 + p.h); ctx.stroke();
  }
  // neutral line
  ctx.strokeStyle = '#b5b5b5'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(p.x0, valToY(0.5, p)); ctx.lineTo(p.x0 + p.w, valToY(0.5, p)); ctx.stroke();

  // the sketch: green hatched envelope whose width follows sketching speed
  const sk = state.previewHistory ? state.previewHistory.sketch : state.sketch;
  ctx.save(); roundRect(ctx, 0, 0, W, H, 16); ctx.clip();
  drawEnvelope(ctx, p, sk);
  ctx.restore();

  // stored stories in low opacity while the history list is open (Figure 5B)
  if (state.historyOpen) {
    state.history.forEach((h) => {
      const hl = state.previewHistory && state.previewHistory.id === h.id;
      if (!hl) drawArc(ctx, p, h.bullets, { alpha: 0.18, mono: '#555' });
    });
  }
  // the current story's recognized fortune (gray = written, blue = generated)
  const shown = state.previewHistory ? state.previewHistory.bullets : state.bullets;
  drawArc(ctx, p, shown, state.previewHistory ? { mono: '#7b4fd6' } : {});
  // pending slots: ring at the target
  if (!state.previewHistory) {
    state.bullets.forEach((b, i) => {
      if (!b.pending) return;
      const s = slotSketch(i);
      const y = valToY(s ? s.y : 0.5, p);
      ctx.strokeStyle = '#3fbf7f'; ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(slotCenterX(i, p), y, 7, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    });
  }
}

function smoothArr(vals, k) {
  return vals.map((_, i) => {
    let s = 0, n = 0;
    for (let j = i - k; j <= i + k; j++) if (j >= 0 && j < vals.length) { s += vals[j]; n++; }
    return s / n;
  });
}

function segments(arr) {
  const segs = []; let cur = null;
  arr.forEach((s, c) => {
    if (s == null) { cur = null; return; }
    if (!cur) { cur = []; segs.push(cur); }
    cur.push({ c, s });
  });
  return segs;
}

function drawEnvelope(ctx, p, sk) {
  for (const seg of segments(sk)) {
    const ys = smoothArr(seg.map((d) => d.s.y), 2);
    const ws = smoothArr(seg.map((d) => d.s.w), 12);   // width changes gradually
    const xs = seg.map((d) => colToX(d.c, p));
    ctx.beginPath();
    xs.forEach((x, k) => { const y = valToY(Math.min(1.02, ys[k] + ws[k]), p); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    for (let k = xs.length - 1; k >= 0; k--) ctx.lineTo(xs[k], valToY(Math.max(-0.02, ys[k] - ws[k]), p));
    ctx.closePath();
    ctx.fillStyle = 'rgba(63,191,127,0.10)'; ctx.fill();
    ctx.fillStyle = hatchPattern(ctx); ctx.fill();
  }
}

function drawArc(ctx, p, bullets, opt) {
  const alpha = opt.alpha == null ? 1 : opt.alpha;
  ctx.save(); ctx.globalAlpha = alpha;
  const pts = bullets.map((b, i) => (b.text && b.text.trim() && b.fortune != null && !b.pending)
    ? { x: slotCenterX(i, p), y: valToY(b.fortune, p), ai: b.source === 'ai' } : null);
  ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (!a || !b) continue;                      // missing sentences leave a visual gap
    ctx.strokeStyle = opt.mono || (b.ai ? '#3b8ef0' : '#8f8f8f');
    const mx = (a.x + b.x) / 2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.bezierCurveTo(mx, a.y, mx, b.y, b.x, b.y); ctx.stroke();
  }
  pts.forEach((q) => {
    if (!q) return;
    ctx.fillStyle = opt.mono || (q.ai ? '#3b8ef0' : '#8f8f8f');
    ctx.beginPath(); ctx.arc(q.x, q.y, q.ai ? 5 : 4, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

function drawSurprise() {
  if ($('surpriseBox').hidden) return;
  const { ctx, W, H } = setupCanvas(surpriseCanvas);
  const p = plot(surpriseCanvas);
  ctx.clearRect(0, 0, W, H);
  roundRect(ctx, 0, 0, W, H, 16); ctx.fillStyle = '#fafaf8'; ctx.fill();
  for (let i = 0; i < nSlots(); i++) {
    const x = slotCenterX(i, p);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, p.y0); ctx.lineTo(x, p.y0 + p.h); ctx.stroke();
  }
  ctx.strokeStyle = '#b5b5b5'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(p.x0, valToY(0.5, p)); ctx.lineTo(p.x0 + p.w, valToY(0.5, p)); ctx.stroke();
  const arr = state.previewHistory ? state.previewHistory.surprise : state.surprise;
  ctx.strokeStyle = '#3a9a5c'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  for (const seg of segments(arr)) {
    ctx.beginPath();
    seg.forEach((d, k) => { const x = colToX(d.c, p), y = valToY(d.s, p); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }
  // dots at per-slot surprise values actually used
  for (let i = 0; i < nSlots(); i++) {
    const s = slotSketch(i, arr); if (!s) continue;
    ctx.fillStyle = '#3a9a5c'; ctx.beginPath(); ctx.arc(slotCenterX(i, p), valToY(s.y, p), 3, 0, Math.PI * 2); ctx.fill();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawAll() { drawFortune(); drawSurprise(); }
window.addEventListener('resize', drawAll);

// ---------------------------------------------------------------- sketching
function attachSketch(cv, kind) {
  let active = null;
  const pos = (e) => {
    const r = cv.getBoundingClientRect(), p = plot(cv);
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const c = Math.max(0, Math.min(GRID - 1, Math.floor(((x - p.x0) / p.w) * GRID)));
    const v = Math.max(0, Math.min(1, 1 - (y - p.y0) / p.h));
    return { x, y, c, v, t: performance.now() };
  };
  cv.addEventListener('pointerdown', (e) => {
    if (state.generating || state.previewHistory) return;
    cv.setPointerCapture(e.pointerId);
    const q = pos(e);
    active = { last: q, speed: 0.6 };
    apply(q, q, active);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!active) return;
    const q = pos(e);
    const dt = Math.max(1, q.t - active.last.t);
    const inst = Math.hypot(q.x - active.last.x, q.y - active.last.y) / dt;   // px per ms
    active.speed = 0.8 * active.speed + 0.2 * inst;
    apply(active.last, q, active);
    active.last = q;
  });
  const end = () => {
    if (!active) return;
    active = null;
    onStrokeEnd();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  function apply(a, b, st) {
    const arr = kind === 'fortune' ? state.sketch : state.surprise;
    if (state.tool === 'eraser') {
      const r = 6;   // eraser half-width in columns, plus the swept range
      for (let c = Math.min(a.c, b.c) - r; c <= Math.max(a.c, b.c) + r; c++) {
        if (c < 0 || c >= GRID || arr[c] == null) continue;
        arr[c] = null; state.dirty.add(colToSlot(c));
      }
    } else {
      // speed -> envelope half-width: fast = wide (loose), slow = narrow (tight)
      const w = Math.max(MIN_HALF_WIDTH, Math.min(MAX_HALF_WIDTH, MIN_HALF_WIDTH + st.speed * 0.16));
      const c0 = a.c, c1 = b.c, n = Math.max(1, Math.abs(c1 - c0));
      for (let k = 0; k <= n; k++) {
        const c = c0 + Math.sign(c1 - c0) * k;
        const y = a.v + ((b.v - a.v) * k) / n;
        arr[c] = kind === 'fortune' ? { y, w } : y;
        state.dirty.add(colToSlot(c));
      }
    }
    drawAll();
  }
}

function onStrokeEnd() {
  const targets = generationTargets([...state.dirty]);
  state.dirty.clear();
  if (targets.length) runGeneration(targets);
  else drawAll();
}

// Which slots to generate, and with what fortune target.
//  - sketched slots get the sketched fortune as target
//  - unsketched slots between sketched ones (erased parts) get no target
//  - slots holding text written (or edited) by the writer are kept
function generationTargets(slots) {
  const sketched = [];
  for (let i = 0; i < nSlots(); i++) if (slotSketch(i)) sketched.push(i);
  if (!sketched.length) return [];
  const lo = sketched[0], hi = sketched[sketched.length - 1];
  const out = [];
  for (const i of [...new Set(slots)].sort((a, b) => a - b)) {
    const b = state.bullets[i]; if (!b) continue;
    if (b.source === 'user' && b.text.trim()) continue;
    const s = slotSketch(i);
    if (s) out.push({ i, target: s.y, retries: s.w < TIGHT_WIDTH ? 2 : 1, width: s.w });
    else if (i > lo && i < hi) out.push({ i, target: null, retries: 0, width: null });
  }
  return out;
}

// ---------------------------------------------------------------- generation
async function runGeneration(targets) {
  if (state.generating) return;
  if (!state.history.length) saveHistory('Initial', true);
  state.generating = true; state.abort = false;
  $('generateAgain').disabled = true; $('stopBtn').hidden = false;
  for (const t of targets) { const b = state.bullets[t.i]; b.pending = true; b.text = ''; b.fortune = null; b.source = 'ai'; }
  renderEditor(); drawAll();

  // order the work: contiguous runs left to right; a run followed by fixed text
  // is infilled alternately from the previous and the next context (Section 5.2.2)
  const runs = [];
  for (const t of targets) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1].i === t.i - 1) last.push(t); else runs.push([t]);
  }
  const order = [];
  for (const run of runs) {
    const end = run[run.length - 1].i;
    const textAfter = state.bullets.slice(end + 1).some((b) => b.text.trim() && !b.pending);
    if (!textAfter) { run.forEach((t) => order.push({ ...t, mode: 'continue' })); continue; }
    let a = 0, z = run.length - 1, front = true;
    while (a <= z) {
      if (front) order.push({ ...run[a++], mode: 'infill_prev' });
      else order.push({ ...run[z--], mode: 'infill_next' });
      front = !front;
    }
  }

  let done = 0, failed = null;
  for (const job of order) {
    if (state.abort) break;
    const b = state.bullets[job.i];
    setStatus(`Generating sentence ${done + 1} of ${order.length} (slot ${job.i + 1}, ` +
      (job.target == null ? 'no fortune target' : `fortune ${job.target.toFixed(2)}, up to ${job.retries} regeneration${job.retries > 1 ? 's' : ''}`) +
      `, ${job.mode.replace('_', ' from ')})…`);
    try {
      const res = await api('/api/generate', {
        protagonist: protagonist(),
        story: state.bullets.map((x) => (x.pending ? '' : x.text.trim())),
        index: job.i, mode: job.mode, target: job.target,
        surprise: slotSurprise(job.i), retries: job.retries,
      });
      b.text = res.text; b.fortune = res.fortune; b.source = 'ai'; b.pending = false;
      const story = state.bullets.map((x) => x.text.trim());
      b.recText = story.slice(Math.max(0, job.i - 3), job.i + 1).join('\u0001');
      b.attempts = res.attempts;
    } catch (err) { failed = err; break; }
    done++;
    renderEditor(); drawAll();
  }
  for (const b of state.bullets) if (b.pending) { b.pending = false; b.text = ''; b.source = 'user'; }
  state.generating = false;
  $('generateAgain').disabled = false; $('stopBtn').hidden = true;
  renderEditor(); drawAll();
  if (failed) setStatus(failed.message, true);
  else if (state.abort) setStatus('Stopped.');
  else setStatus('');
  if (done) saveHistory('Story ' + (++state.genCount));
  scheduleRecognize(300);   // context changed for later written sentences
}

function slotSurprise(i) {
  if ($('surpriseBox').hidden) return DEFAULT_SURPRISE;
  const s = slotSketch(i, state.surprise);
  return s ? s.y : DEFAULT_SURPRISE;
}

$('generateAgain').addEventListener('click', () => {
  const all = [];
  for (let i = 0; i < nSlots(); i++) all.push(i);
  const targets = generationTargets(all);
  if (!targets.length) { setStatus('Sketch the fortune arc on the canvas first (over empty or generated slots).', true); return; }
  runGeneration(targets);
});
$('stopBtn').addEventListener('click', () => { state.abort = true; setStatus('Stopping after the current sentence…'); });

// ---------------------------------------------------------------- history (Section 4.2.3)
function snapshot() {
  return {
    bullets: state.bullets.map((b) => ({ text: b.text, source: b.source, fortune: b.fortune, recText: b.recText })),
    sketch: state.sketch.map((s) => (s ? { ...s } : null)),
    surprise: state.surprise.slice(),
    title: $('title').value,
  };
}
let historyId = 0;
function saveHistory(name, initial = false) {
  if (initial && !state.bullets.some((b) => b.text.trim())) return;
  const h = { id: ++historyId, name, ...snapshot() };
  state.history.push(h);
  state.currentHistory = h.id;
  renderHistory();
}
function rollBack(h) {
  state.bullets = h.bullets.map((b) => ({ ...b, pending: false }));
  state.sketch = h.sketch.map((s) => (s ? { ...s } : null));
  state.surprise = h.surprise.slice();
  state.currentHistory = h.id;
  state.previewHistory = null;
  closeHistory();
  renderEditor(); drawAll();
  setStatus(`Rolled back to “${h.name}”.`);
}
function renderHistory() {
  const el = $('historyList');
  el.innerHTML = '';
  if (!state.history.length) { el.innerHTML = '<div class="historyEmpty">Generated stories will be stored here.</div>'; return; }
  state.history.forEach((h) => {
    const row = document.createElement('div');
    row.className = 'historyItem' + (h.id === state.currentHistory ? ' current' : '');
    const name = document.createElement('span'); name.className = 'name'; name.textContent = h.name;
    const ren = document.createElement('button'); ren.textContent = '✎'; ren.title = 'Rename';
    const del = document.createElement('button'); del.textContent = '✕'; del.className = 'del'; del.title = 'Delete';
    row.append(name, ren, del);
    row.addEventListener('mouseenter', () => { state.previewHistory = h; renderEditor(); drawAll(); });
    row.addEventListener('mouseleave', () => { state.previewHistory = null; renderEditor(); drawAll(); });
    row.addEventListener('click', (e) => { if (e.target === row || e.target === name) rollBack(h); });
    ren.addEventListener('click', (e) => {
      e.stopPropagation();
      const inp = document.createElement('input'); inp.value = h.name;
      name.innerHTML = ''; name.append(inp); inp.focus(); inp.select();
      const commit = () => { h.name = inp.value.trim() || h.name; renderHistory(); };
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') renderHistory(); });
      inp.addEventListener('blur', commit);
      inp.addEventListener('click', (ev) => ev.stopPropagation());
    });
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      state.history = state.history.filter((x) => x !== h);
      state.previewHistory = null;
      renderHistory(); renderEditor(); drawAll();
    });
    el.append(row);
  });
}
function closeHistory() { state.historyOpen = false; $('historyList').hidden = true; drawAll(); }
$('historyBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  if (state.generating) return;
  state.historyOpen = !state.historyOpen;
  $('historyList').hidden = !state.historyOpen;
  renderHistory(); drawAll();
});
document.addEventListener('click', (e) => {
  if (state.historyOpen && !$('historyList').contains(e.target)) closeHistory();
});

// ---------------------------------------------------------------- tools & misc
function setTool(t) {
  state.tool = t;
  $('penTool').classList.toggle('active', t === 'pen');
  $('eraserTool').classList.toggle('active', t === 'eraser');
  document.querySelectorAll('.canvasBox').forEach((b) => b.classList.toggle('eraser', t === 'eraser'));
}
$('penTool').addEventListener('click', () => setTool('pen'));
$('eraserTool').addEventListener('click', () => setTool('eraser'));
$('surpriseToggle').addEventListener('change', (e) => { $('surpriseBox').hidden = !e.target.checked; drawAll(); });
$('protagonist').addEventListener('input', () => { state.bullets.forEach((b) => { b.recText = null; }); scheduleRecognize(); });

const protagonist = () => $('protagonist').value.trim();

function setStatus(msg, err = false) {
  const el = $('status'); el.textContent = msg; el.classList.toggle('err', !!err);
}

async function api(path, body) {
  let r;
  try {
    r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (e) { throw new Error('Cannot reach the TaleBrush server. Is server.py running?'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ('Server error ' + r.status));
  return data;
}

async function checkBridge() {
  const el = $('bridgeStatus');
  try {
    const r = await (await fetch('/api/health')).json();
    if (r.ok) {
      const b = r.bridge || {};
      el.textContent = 'LLM bridge: ' + [b.backend, b.model].filter(Boolean).join(' / ') ;
      el.className = 'bridge ok';
    } else {
      el.textContent = 'LLM bridge not reachable: run python3 llm-bridge/bridge.py claude';
      el.className = 'bridge bad';
    }
  } catch (e) { el.textContent = 'server not reachable'; el.className = 'bridge bad'; }
}

// ---------------------------------------------------------------- start
function init() {
  attachSketch(fortuneCanvas, 'fortune');
  attachSketch(surpriseCanvas, 'surprise');
  state.bullets = [
    newBullet('Mike is a jazz guitarist who has great ambitions and devotion to music.'),
    newBullet('Mike recently thought about expanding his expertise to heavy metal, thinking that mixing it with jazz would be interesting.'),
  ];
  while (state.bullets.length < DEFAULT_SLOTS) state.bullets.push(newBullet());
  renderEditor(); renderHistory(); drawAll();
  scheduleRecognize(100);
  checkBridge();
}
init();
