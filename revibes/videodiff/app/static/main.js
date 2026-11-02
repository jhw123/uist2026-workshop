// VideoDiff front end: versions outline, timeline and transcript views,
// sorting / pinning / archiving, and generate / recombine / refine prompts.

import { Model, fmt, escapeHtml } from './model.js';
import { CompositePlayer } from './player.js';

const $ = s => document.querySelector(s);
const STAGES = ['roughcut', 'broll', 'text'];
const STAGE_NAME = { roughcut: 'Rough Cut', broll: 'B-Roll', text: 'Text Effects' };
const OUTLINE_NAME = { roughcut: 'Rough Cut versions', broll: 'B-Roll versions', text: 'Text Effect versions' };
const SORTS = {
  roughcut: [['default', 'Default order'], ['longest', 'Longest'], ['shortest', 'Shortest'],
    ['most-sections', 'Most Sections'], ['fewest-sections', 'Fewest Sections']],
  broll: [['default', 'Default order'], ['most', 'Most B-rolls'], ['fewest', 'Fewest B-rolls'], ['media', 'Media type']],
  text: [['default', 'Default order'], ['most', 'Most text effects'], ['fewest', 'Fewest text effects'], ['style', 'Text style']],
};
const MEDIA_ORDER = { photo: 0, illustration: 1, video: 2 };
const STYLE_ORDER = { title: 0, subtitle: 1, lower: 2 };
const STYLE_NAME = { title: 'Title', subtitle: 'Subtitle', lower: 'Lower third' };
const TW = 64; // thumbnail tile width in the timeline
const CONCURRENCY = 4;

let P = null;        // project from the server
let M = null;        // Model
let S = null;        // persisted state
let thumbs = { step: 2, urls: [] };
const brollThumbs = new Map();
const players = new Map();
let pending = { stage: null, n: 0, total: 0 }; // batch generation in progress
let health = null;

// --------------------------------------------------------------------------
// utilities
// --------------------------------------------------------------------------

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

async function api(path, body, method) {
  const r = await fetch(path, {
    method: method || (body !== undefined ? 'POST' : 'GET'),
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

function banner(html, kind = 'info') {
  const b = $('#banner');
  if (!html) { b.hidden = true; return; }
  b.hidden = false;
  b.className = kind;
  b.innerHTML = html;
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api(`/api/project/${P.id}/state`, S).catch(e => console.warn(e)), 300);
}

const measureCtx = document.createElement('canvas').getContext('2d');
function textWidth(s, font = '12px system-ui, sans-serif') {
  measureCtx.font = font;
  return measureCtx.measureText(s).width;
}

// tooltip
const tip = () => $('#tooltip');
function showTip(html, ev) {
  const t = tip();
  t.innerHTML = html;
  t.hidden = false;
  moveTip(ev);
}
function moveTip(ev) {
  const t = tip();
  if (t.hidden) return;
  const pad = 14;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  const r = t.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
  t.style.left = `${Math.max(4, x)}px`;
  t.style.top = `${Math.max(4, y)}px`;
}
function hideTip() { tip().hidden = true; }

// --------------------------------------------------------------------------
// state helpers
// --------------------------------------------------------------------------

function freshState() {
  return {
    stages: Object.fromEntries(STAGES.map(s => [s, { versions: [], next: 1, base: null }])),
    ui: { stage: 'roughcut', view: 'timeline', timeline: 'edited', sort: {}, collapsed: [] },
    seq: 1,
  };
}

const vkey = v => `${v.stage}:${v.id}`;
const stageOf = s => S.stages[s];

function findVersion(key) {
  for (const s of STAGES) {
    const v = S.stages[s].versions.find(v => vkey(v) === key);
    if (v) return v;
  }
  return null;
}

function headerText(v) {
  if (v.stage === 'roughcut') {
    return `#${v.id} | ${fmt(M.editedDuration(v.keep))} | ${M.sectionsIn(v.keep).length} Sections`;
  }
  if (v.stage === 'broll') {
    const types = [...new Set(v.brolls.map(b => b.media?.type || b.type))];
    const t = types.length === 1 ? cap(types[0]) : types.length ? 'Mixed' : '';
    return `#${v.id} | ${v.brolls.length} B-rolls${t ? ' | ' + t : ''}`;
  }
  const styles = [...new Set(v.texts.map(t => t.style))];
  const st = styles.length === 1 ? STYLE_NAME[styles[0]] : styles.length ? 'Mixed' : '';
  return `#${v.id} | ${v.texts.length} Text effects${st ? ' | ' + st : ''}`;
}
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

function dominant(list, key, order) {
  const c = {};
  list.forEach(x => { const k = key(x); c[k] = (c[k] || 0) + 1; });
  const ks = Object.keys(c);
  if (!ks.length) return 99;
  ks.sort((a, b) => c[b] - c[a] || order[a] - order[b]);
  return order[ks[0]] ?? 50;
}

function orderedVersions(stage) {
  const vs = stageOf(stage).versions;
  const byKey = new Map(vs.map(v => [v.id, v]));
  // default: creation order, edits right below their original
  const roots = vs.filter(v => !v.editedFrom || !byKey.has(v.editedFrom)).sort((a, b) => a.seq - b.seq);
  const kids = id => vs.filter(v => v.editedFrom === id).sort((a, b) => a.seq - b.seq);
  const out = [];
  const walk = v => { out.push(v); kids(v.id).forEach(walk); };
  roots.forEach(walk);
  const sort = S.ui.sort[stage] || 'default';
  const metric = {
    'longest': v => -M.editedDuration(v.keep),
    'shortest': v => M.editedDuration(v.keep),
    'most-sections': v => -M.sectionsIn(v.keep).length * 1e4 - M.editedDuration(v.keep),
    'fewest-sections': v => M.sectionsIn(v.keep).length * 1e4 + M.editedDuration(v.keep),
    'most': v => -(stage === 'broll' ? v.brolls.length : v.texts.length),
    'fewest': v => (stage === 'broll' ? v.brolls.length : v.texts.length),
    'media': v => dominant(v.brolls, b => b.media?.type || b.type, MEDIA_ORDER) * 100 - v.brolls.length,
    'style': v => dominant(v.texts, t => t.style, STYLE_ORDER) * 100 - v.texts.length,
  }[sort];
  let list = out.map((v, i) => ({ v, i }));
  if (metric) list.sort((a, b) => metric(a.v) - metric(b.v) || a.i - b.i);
  list = list.map(x => x.v);
  return [...list.filter(v => v.pinned && !v.archived), ...list.filter(v => !v.pinned && !v.archived), ...list.filter(v => v.archived)];
}

// --------------------------------------------------------------------------
// thumbnails (extracted in the browser from the source video)
// --------------------------------------------------------------------------

async function seekTo(video, t) {
  return new Promise(res => {
    const done = () => { video.removeEventListener('seeked', done); res(); };
    video.addEventListener('seeked', done);
    video.currentTime = t;
    setTimeout(done, 3000);
  });
}

async function extractThumbs(url, dur, projectId) {
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url;
  await new Promise(res => { v.onloadeddata = res; v.onerror = res; setTimeout(res, 8000); });
  const step = Math.max(2, dur / 140);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 72;
  const ctx = c.getContext('2d');
  const urls = [];
  thumbs = { step, urls };
  for (let t = 0; t < dur; t += step) {
    if (P?.id !== projectId) return;
    await seekTo(v, Math.min(dur - 0.1, t + step / 2));
    try { ctx.drawImage(v, 0, 0, 128, 72); urls.push(c.toDataURL('image/jpeg', 0.6)); } catch { urls.push(''); }
    if (urls.length % 20 === 0) renderVersions();
  }
  v.removeAttribute('src');
  renderVersions();
}

function thumbAt(t) {
  if (!thumbs.urls.length) return '';
  const i = Math.max(0, Math.min(thumbs.urls.length - 1, Math.floor(t / thumbs.step)));
  return thumbs.urls[i];
}

function brollThumb(media) {
  if (!media) return '';
  if (media.type !== 'video') return `/media/broll/${media.file}`;
  if (brollThumbs.has(media.file)) return brollThumbs.get(media.file);
  brollThumbs.set(media.file, '');
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = `/media/broll/${media.file}`;
  v.onloadeddata = async () => {
    await seekTo(v, 1);
    const c = document.createElement('canvas'); c.width = 128; c.height = 72;
    c.getContext('2d').drawImage(v, 0, 0, 128, 72);
    brollThumbs.set(media.file, c.toDataURL('image/jpeg', 0.7));
    renderVersions();
  };
  return '';
}

// --------------------------------------------------------------------------
// players
// --------------------------------------------------------------------------

function playerFor(v) {
  const k = vkey(v);
  let p = players.get(k);
  if (!p) { p = new CompositePlayer(M, P.videoUrl); players.set(k, p); }
  p.setVersion(v);
  return p;
}

// --------------------------------------------------------------------------
// rendering
// --------------------------------------------------------------------------

function renderAll() {
  renderOutline();
  renderToolbar();
  renderVersions();
}

function renderOutline() {
  const body = $('#outlineBody');
  body.innerHTML = '';
  for (const st of STAGES) {
    const sd = stageOf(st);
    const g = el('div', 'og' + (S.ui.stage === st ? ' active' : ''));
    const h = el('div', 'og-h', OUTLINE_NAME[st]);
    h.onclick = () => switchStage(st);
    g.appendChild(h);
    if (sd.baseSnap) g.appendChild(el('div', 'og-sub', `on ${STAGE_NAME[sd.baseSnap.stage]} #${escapeHtml(sd.baseSnap.id)}`));
    const ul = el('ul');
    for (const v of orderedVersions(st)) {
      const li = el('li', (v.pinned ? 'pinned ' : '') + (v.archived ? 'archived' : ''), escapeHtml(headerText(v)));
      li.title = v.summary || v.label || '';
      li.onclick = () => { switchStage(st); requestAnimationFrame(() => focusCard(vkey(v))); };
      ul.appendChild(li);
    }
    if (pending.stage === st) ul.appendChild(el('li', 'gen', `generating… ${pending.n}/${pending.total}`));
    if (!sd.versions.length && pending.stage !== st) {
      ul.appendChild(el('li', 'empty', st === 'roughcut' ? 'none yet' : st === 'broll'
        ? 'Pick a rough cut and press 🪄 Add B-roll' : 'Pick a B-roll version and press 🪄 Add text'));
    }
    g.appendChild(ul);
    body.appendChild(g);
  }
}

function focusCard(key) {
  const c = document.getElementById('card-' + key);
  if (!c) return;
  c.scrollIntoView({ behavior: 'smooth', block: S.ui.view === 'timeline' ? 'center' : 'nearest', inline: 'center' });
  c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
}

function switchStage(st) {
  if (S.ui.stage === st) return;
  S.ui.stage = st;
  save();
  renderAll();
}

function renderToolbar() {
  const st = S.ui.stage;
  const tabs = $('#stageTitle');
  tabs.innerHTML = '';
  STAGES.forEach((s, i) => {
    const b = el('button', 'tab' + (s === st ? ' active' : ''), `${i + 1}. ${STAGE_NAME[s]}`);
    b.onclick = () => switchStage(s);
    tabs.appendChild(b);
  });
  const sel = $('#sortSelect');
  sel.innerHTML = SORTS[st].map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  sel.value = S.ui.sort[st] || 'default';
  $('#viewToggle').checked = S.ui.view === 'transcript';
  $('#timelineToggle').checked = S.ui.timeline === 'source';
  const gb = $('#generateBtn');
  gb.disabled = !!pending.stage || (st !== 'roughcut' && !stageOf(st).baseSnap);
  gb.title = gb.disabled && !pending.stage ? 'Choose a version in the previous stage first' : 'Generate a new version from a prompt, recombine versions, or Surprise me';
}

function renderVersions() {
  if (!S || !M) return;
  const host = $('#versions');
  const scrollTop = host.scrollTop, scrollLeft = host.scrollLeft;
  hideTip();
  host.innerHTML = '';
  host.className = S.ui.view === 'transcript' ? 'transcript-view' : 'timeline-view';
  const st = S.ui.stage;
  const list = orderedVersions(st);
  if (!list.length && pending.stage !== st) {
    const msg = st === 'roughcut' ? 'No rough cuts yet.' :
      st === 'broll' ? 'No B-roll versions yet. In the Rough Cut stage, press <b>🪄 Add B-roll</b> on the version you like.' :
        'No text effect versions yet. In the B-Roll stage, press <b>🪄 Add text effects</b> on the version you like.';
    host.appendChild(el('div', 'empty-state', msg));
  }
  if (S.ui.view === 'transcript') renderTranscriptView(host, list);
  else renderTimelineView(host, list);
  if (pending.stage === st) {
    for (let i = pending.n; i < pending.total; i++) {
      host.appendChild(el('div', S.ui.view === 'transcript' ? 'tcol placeholder' : 'vcard placeholder',
        `<div class="spinner"></div> Generating ${STAGE_NAME[st]} version… (${pending.n}/${pending.total} done)`));
    }
  }
  host.scrollTop = scrollTop; host.scrollLeft = scrollLeft;
}

function actionButtons(v) {
  const box = el('div', 'actions');
  const mk = (icon, title, cls, fn) => {
    const b = el('button', 'act ' + cls, icon);
    b.title = title;
    b.onclick = e => { e.stopPropagation(); fn(); };
    box.appendChild(b);
  };
  const editTitle = { roughcut: 'Edit this storyline with a prompt', broll: 'Edit these B-rolls with a prompt', text: 'Edit these text effects with a prompt' }[v.stage];
  mk('✎', editTitle, 'edit', () => openPrompt('edit', v));
  mk('📌', v.pinned ? 'Unpin' : 'Pin to the top', v.pinned ? 'on' : '', () => { v.pinned = !v.pinned; if (v.pinned) v.archived = false; save(); renderAll(); });
  if (v.stage === 'roughcut') mk('🪄', 'Add B-roll: generate 10 B-roll versions on this rough cut', 'wand', () => startBatch('broll', v));
  if (v.stage === 'broll') mk('🪄', 'Add text effects: generate 10 text effect versions on this B-roll version', 'wand', () => startBatch('text', v));
  mk('🗃', v.archived ? 'Unarchive' : 'Archive (move to the bottom)', v.archived ? 'on' : '', () => { v.archived = !v.archived; if (v.archived) v.pinned = false; save(); renderAll(); });
  return box;
}

function versionHead(v) {
  const h = el('div', 'vhead');
  h.appendChild(el('span', 'vtitle', escapeHtml(headerText(v)) + (v.prompt ? ` <span class="vprompt">+ ${escapeHtml(v.prompt)}</span>` : '')));
  if (v.label) h.appendChild(el('span', 'chip', escapeHtml(v.label)));
  if (v.origin && v.origin !== 'ai') h.appendChild(el('span', 'chip origin', { edit: 'Edited', prompt: 'From prompt', surprise: 'Surprise me' }[v.origin] || v.origin));
  if (v.summary && v.origin && v.origin !== 'ai') h.appendChild(el('span', 'vsummary', escapeHtml(v.summary)));
  else if (v.summary) h.title = v.summary;
  return h;
}

// ------------------------------ timeline view -----------------------------

function renderTimelineView(host, list) {
  const W = Math.max(300, host.clientWidth - 230 - 90 - 40 - 110); // room for the last label
  const mode = S.ui.timeline;
  const maxDur = mode === 'edited'
    ? Math.max(1, ...list.filter(v => !v.archived).map(v => M.editedDuration(v.keep)), ...list.map(v => M.editedDuration(v.keep)))
    : M.duration;
  const pps = W / maxDur;
  for (const v of list) {
    const card = el('div', 'vcard' + (v.pinned ? ' pinned' : '') + (v.archived ? ' archived' : '') + (v.origin && v.origin !== 'ai' ? ' generated' : ''));
    card.id = 'card-' + vkey(v);
    card.appendChild(versionHead(v));
    const body = el('div', 'vbody');
    const slot = el('div', 'pslot');
    const player = playerFor(v);
    slot.appendChild(player.el);
    body.appendChild(slot);
    body.appendChild(buildTimeline(v, pps, mode, player));
    body.appendChild(actionButtons(v));
    card.appendChild(body);
    host.appendChild(card);
  }
}

function buildTimeline(v, pps, mode, player) {
  const keep = v.keep;
  const edDur = M.editedDuration(keep);
  const barW = Math.max(4, (mode === 'edited' ? edDur : M.duration) * pps);
  const toX = src => (mode === 'edited' ? (M.srcToEd(keep, src) ?? M.srcToEdNext(keep, src)) : src) * pps;
  const root = el('div', 'tl');

  const strip = el('div', 'thumbs');
  strip.style.width = barW + 'px';
  const hl = el('div', 'hlbox');

  if (v.stage === 'broll') root.appendChild(effectRow(v, 'broll', toX, hl, player));
  if (v.stage === 'text') root.appendChild(effectRow(v, 'text', toX, hl, player));
  if (v.stage === 'roughcut') root.appendChild(labelRow(v, mode, pps, player));

  // section bar
  const bar = el('div', 'bar');
  bar.style.width = barW + 'px';
  const pieces = M.editedPieces(keep);
  if (mode === 'edited') {
    for (const p of pieces) {
      const d = el('div', 'piece' + (p.cutBefore ? ' cut' : ''));
      d.style.left = p.ed * pps + 'px';
      d.style.width = Math.max(1, (p.edEnd - p.ed) * pps) + 'px';
      d.style.background = M.sections[p.sec].color;
      bar.appendChild(d);
    }
  } else {
    if (M.segs.length && M.segs[0].start > 0.5) {
      const d = el('div', 'piece excluded nospeech');
      d.style.left = '0px'; d.style.width = M.segs[0].start * pps + 'px';
      bar.appendChild(d);
    }
    M.sections.forEach((s, k) => {
      const sp = M.sectionSpan(k);
      const d = el('div', 'piece excluded');
      d.style.left = sp.s * pps + 'px';
      d.style.width = Math.max(1, (sp.e - sp.s) * pps) + 'px';
      d.style.background = s.color;
      bar.appendChild(d);
    });
    for (const p of pieces) {
      const d = el('div', 'piece');
      d.style.left = p.s * pps + 'px';
      d.style.width = Math.max(1, (p.e - p.s) * pps) + 'px';
      d.style.background = M.sections[p.sec].color;
      bar.appendChild(d);
    }
  }
  root.appendChild(bar);

  // thumbnail strip
  const n = Math.ceil(barW / TW);
  for (let i = 0; i < n; i++) {
    const x0 = i * TW, w = Math.min(TW, barW - x0);
    const tMid = (x0 + w / 2) / pps;
    const src = mode === 'edited' ? M.edToSrc(keep, tMid) : tMid;
    const b = (v.brolls || []).find(b => { const sp = M.sentenceSpan(b.sentence); return src >= sp.s && src < sp.e; });
    const tile = el('div', 'tile' + (b ? ' is-broll' : ''));
    tile.style.left = x0 + 'px';
    tile.style.width = w + 'px';
    const url = b && b.media ? brollThumb(b.media) : thumbAt(src);
    if (url) tile.style.backgroundImage = `url("${url}")`;
    strip.appendChild(tile);
  }
  if (mode === 'source') {
    // dim what the version leaves out
    let last = 0;
    const runs = M.runs(keep);
    for (const r of [...runs, { s: M.duration, e: M.duration }]) {
      if (r.s - last > 0.05) {
        const d = el('div', 'dim');
        d.style.left = last * pps + 'px';
        d.style.width = (r.s - last) * pps + 'px';
        strip.appendChild(d);
      }
      last = r.e;
    }
  }
  strip.appendChild(hl);
  root.appendChild(strip);

  // hover and click on the bar and the strip
  const at = ev => {
    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(barW - 0.1, ev.clientX - rect.left));
    const t = x / pps;
    const src = mode === 'edited' ? M.edToSrc(keep, t) : t;
    const kept = mode === 'edited' || M.srcToEd(keep, src) !== null;
    return { x, t, src, kept };
  };
  const onMove = ev => {
    const a = at(ev);
    const tileI = Math.floor(a.x / TW);
    hl.style.display = 'block';
    hl.style.left = tileI * TW + 'px';
    hl.style.width = Math.min(TW, barW - tileI * TW) + 'px';
    showTip(sectionTip(v, a, mode), ev);
  };
  for (const target of [bar, strip]) {
    target.addEventListener('mousemove', onMove);
    target.addEventListener('mouseleave', () => { hl.style.display = 'none'; hideTip(); });
    target.addEventListener('click', ev => {
      const a = at(ev);
      if (mode === 'edited') player.playFromEd(a.t); else player.playFromSrc(a.src);
    });
  }
  return root;
}

function sectionTip(v, a, mode) {
  if (M.segs.length && a.src < M.segs[0].start - 0.2) {
    return `<div class="tt-h">No speech</div><div class="muted">0:00–${fmt(M.segs[0].start)} of the source (not used by rough cuts)</div>`;
  }
  let i = M.segs.findIndex(g => g.end > a.src);
  if (i < 0) i = M.segs.length - 1;
  const k = M.secOf[i];
  const s = M.sections[k];
  const sp = M.sectionSpan(k);
  let range, sample;
  if (a.kept) {
    const p = M.editedPieces(v.keep).find(p => p.sec === k && a.src >= p.s - 0.01 && a.src <= p.e + 0.01) || { s: sp.s, e: sp.e, ed: 0, edEnd: 0 };
    range = mode === 'edited' ? `${fmt(p.ed)}–${fmt(p.edEnd)} in this version · source ${fmt(p.s)}–${fmt(p.e)}` : `source ${fmt(p.s)}–${fmt(p.e)} · included`;
    sample = [p.s, (p.s + p.e) / 2, p.e - 0.5];
  } else {
    const runs = M.runs(v.keep);
    let gs = sp.s, ge = sp.e;
    for (const r of runs) { if (r.e <= a.src) gs = Math.max(gs, r.e); if (r.s >= a.src) { ge = Math.min(ge, r.s); break; } }
    range = `source ${fmt(gs)}–${fmt(ge)} · <b>not included</b> in this version`;
    sample = [gs, (gs + ge) / 2, ge - 0.5];
  }
  const imgs = thumbs.urls.length ? `<div class="tt-thumbs">${sample.map(t => `<img src="${thumbAt(t)}">`).join('')}</div>` : '';
  const sentence = M.segs[i].text;
  return `<div class="tt-h"><span class="sw" style="background:${s.color}"></span>${escapeHtml(s.title)}</div>
    <div class="muted">${range}</div>${imgs}
    <div class="tt-kw">${s.keywords.map(k => `<span>${escapeHtml(k)}</span>`).join('')}</div>
    <div class="tt-sent">“${escapeHtml(sentence)}”</div>
    <div class="muted small">${a.kept ? 'Click to play from here' : 'Click to play from the next included part'}</div>`;
}

function labelRow(v, mode, pps, player) {
  const row = el('div', 'labels');
  const blocks = [];
  if (mode === 'edited') {
    for (const p of M.editedPieces(v.keep)) {
      const last = blocks[blocks.length - 1];
      if (last && last.sec === p.sec) last.x1 = p.edEnd * pps;
      else blocks.push({ sec: p.sec, x0: p.ed * pps, x1: p.edEnd * pps, play: () => player.playFromEd(p.ed), included: true });
    }
  } else {
    const inc = new Set(M.sectionsIn(v.keep));
    M.sections.forEach((s, k) => {
      const sp = M.sectionSpan(k);
      blocks.push({ sec: k, x0: sp.s * pps, x1: sp.e * pps, included: inc.has(k), range: `${fmt(sp.s)}–${fmt(sp.e)}`,
        play: () => player.playFromSrc(sp.s) });
    });
  }
  const rowEnd = [-1e9, -1e9]; // [lower, upper]
  for (const b of blocks) {
    const s = M.sections[b.sec];
    const text = s.title;
    const w = Math.max(textWidth(text), b.range ? textWidth(b.range, '10px system-ui') : 0) + 10;
    // two label rows; a label that does not fit moves right, with a leader line at its true start
    const r = b.x0 >= rowEnd[0] ? 0 : b.x0 >= rowEnd[1] ? 1 : (rowEnd[0] <= rowEnd[1] ? 0 : 1);
    const x = Math.max(b.x0, rowEnd[r]);
    rowEnd[r] = x + w;
    const lab = el('div', `lab row${r}` + (b.included ? '' : ' excl'),
      `${escapeHtml(text)}${b.range ? `<small>${b.range}</small>` : ''}`);
    lab.style.left = x + 'px';
    lab.title = `${s.title} — click to play`;
    lab.onclick = b.included ? b.play : null;
    row.appendChild(lab);
    if (r === 1 || x > b.x0 + 1) {
      const line = el('div', `leader row${r}`);
      line.style.left = b.x0 + 'px';
      row.appendChild(line);
    }
  }
  return row;
}

function effectRow(v, kind, toX, hl, player) {
  const row = el('div', kind === 'broll' ? 'fxrow brolls' : 'fxrow texts');
  const items = kind === 'broll' ? v.brolls : v.texts;
  let lastEnd = -1e9;
  for (const it of items) {
    const sp = M.sentenceSpan(it.sentence);
    const start = kind === 'text' ? M.phraseStart(it.sentence, it.text) : sp.s;
    const xTrue = toX(start);
    let node, w;
    if (kind === 'broll') {
      w = TW;
      const url = brollThumb(it.media);
      node = el('div', 'bitem', `<div class="bkw">${escapeHtml(it.keyword)}</div>
        <div class="bimg" style="${url ? `background-image:url('${url}')` : ''}">${it.media ? (it.media.type === 'video' ? '<span class="badge">▶</span>' : '') : '<span class="nores">no result</span>'}</div>`);
    } else {
      const label = '❞ ' + it.text;
      w = textWidth(label, '13px system-ui') + 12;
      node = el('div', `titem st-${it.style}`, escapeHtml(label));
    }
    const x = Math.max(xTrue, lastEnd + 3);
    lastEnd = x + w;
    node.style.left = x + 'px';
    if (x - xTrue > 2) {
      const tick = el('div', 'tick');
      tick.style.left = xTrue + 'px';
      row.appendChild(tick);
    }
    node.onmouseenter = ev => {
      const x0 = toX(sp.s), x1 = toX(Math.max(sp.e, kind === 'text' ? start + 1.8 : sp.e));
      hl.style.display = 'block';
      hl.style.left = x0 + 'px';
      hl.style.width = Math.max(6, x1 - x0) + 'px';
      showTip(kind === 'broll' ? brollTip(it) : textTip(it), ev);
    };
    node.onmousemove = moveTip;
    node.onmouseleave = () => { hl.style.display = 'none'; hideTip(); };
    node.onclick = () => player.playFromSrc(start);
    row.appendChild(node);
  }
  if (!items.length) row.appendChild(el('div', 'noeffects muted', kind === 'broll' ? 'No B-roll in this version' : 'No text effects in this version'));
  return row;
}

function brollTip(b) {
  const sent = M.segs[b.sentence].text;
  const m = b.media;
  const img = m ? `<img class="tt-big" src="${brollThumb(m) || ''}">` : '<div class="muted">No match in the B-roll library</div>';
  return `<div class="tt-h">${escapeHtml(b.keyword)} <span class="muted">· ${escapeHtml(m?.type || b.type)}</span></div>${img}
    <div class="tt-sent">Covers: “${escapeHtml(sent)}”</div>
    ${m ? `<div class="muted small">${escapeHtml(m.title)} — ${escapeHtml(m.credit)} (${escapeHtml(m.license)})</div>` : ''}
    <div class="muted small">Click to preview</div>`;
}

function textTip(t) {
  const sent = M.segs[t.sentence].text;
  const i = sent.toLowerCase().indexOf(t.text.toLowerCase());
  const html = i >= 0 ? escapeHtml(sent.slice(0, i)) + `<b>${escapeHtml(sent.slice(i, i + t.text.length))}</b>` + escapeHtml(sent.slice(i + t.text.length)) : escapeHtml(sent);
  return `<div class="tt-h">❞ ${escapeHtml(t.text)} <span class="muted">· ${STYLE_NAME[t.style]}</span></div>
    <div class="tt-sent">${html}</div><div class="muted small">Click to preview</div>`;
}

// ----------------------------- transcript view ----------------------------

let syncDriver = null, syncTime = 0;
function syncScroll(ev) {
  const src = ev.currentTarget;
  const now = performance.now();
  if (syncDriver && syncDriver !== src && now - syncTime < 200) return;
  syncDriver = src; syncTime = now;
  const sents = src.querySelectorAll('.sent');
  let anchor = null;
  for (const s of sents) { if (s.offsetTop + s.offsetHeight > src.scrollTop) { anchor = s; break; } }
  if (!anchor) return;
  const i = +anchor.dataset.i;
  const off = anchor.offsetTop - src.scrollTop;
  document.querySelectorAll('.tbody').forEach(b => {
    if (b === src) return;
    const t = [...b.querySelectorAll('.sent')].find(s => +s.dataset.i >= i);
    if (t) b.scrollTop = t.offsetTop - off;
  });
}

function renderTranscriptView(host, list) {
  const mode = S.ui.timeline;
  for (const v of list) {
    const col = el('div', 'tcol' + (v.pinned ? ' pinned' : '') + (v.archived ? ' archived' : '') + (v.origin && v.origin !== 'ai' ? ' generated' : ''));
    col.id = 'card-' + vkey(v);
    const head = versionHead(v);
    head.appendChild(actionButtons(v));
    col.appendChild(head);
    const player = playerFor(v);
    const slot = el('div', 'pslot');
    slot.appendChild(player.el);
    col.appendChild(slot);
    col.appendChild(miniTimeline(v, mode, player));
    if (v.stage === 'broll') col.appendChild(contentStrip(v, player));
    if (v.stage === 'text') col.appendChild(textStrip(v, player));
    const body = el('div', 'tbody');
    body.addEventListener('scroll', syncScroll);
    buildTranscript(v, mode, player, body);
    col.appendChild(body);
    host.appendChild(col);
  }
}

function miniTimeline(v, mode, player) {
  const wrap = el('div', 'mini');
  const total = mode === 'edited' ? M.editedDuration(v.keep) : M.duration;
  const pieces = M.editedPieces(v.keep);
  if (mode === 'source') {
    M.sections.forEach((s, k) => {
      const sp = M.sectionSpan(k);
      const d = el('div', 'mp excluded');
      d.style.left = (sp.s / total * 100) + '%'; d.style.width = ((sp.e - sp.s) / total * 100) + '%';
      d.style.background = s.color;
      wrap.appendChild(d);
    });
  }
  for (const p of pieces) {
    const d = el('div', 'mp');
    const a = mode === 'edited' ? p.ed : p.s, b = mode === 'edited' ? p.edEnd : p.e;
    d.style.left = (a / total * 100) + '%'; d.style.width = ((b - a) / total * 100) + '%';
    d.style.background = M.sections[p.sec].color;
    d.title = M.sections[p.sec].title;
    d.onclick = () => player.playFromEd(p.ed);
    wrap.appendChild(d);
  }
  return wrap;
}

function contentStrip(v, player) {
  const s = el('div', 'content-strip', '<span class="cs-l">Content</span>');
  for (const b of v.brolls) {
    const url = brollThumb(b.media);
    const t = el('div', 'cs-item', url ? '' : `<span>${escapeHtml(b.keyword)}</span>`);
    if (url) t.style.backgroundImage = `url('${url}')`;
    t.onmouseenter = ev => showTip(brollTip(b), ev);
    t.onmousemove = moveTip;
    t.onmouseleave = hideTip;
    t.onclick = () => player.playFromSrc(M.segs[b.sentence].start);
    s.appendChild(t);
  }
  if (!v.brolls.length) s.appendChild(el('span', 'muted', 'none'));
  return s;
}

function textStrip(v, player) {
  const s = el('div', 'content-strip texts', '<span class="cs-l">Text</span>');
  for (const t of v.texts) {
    const c = el('div', `titem inline st-${t.style}`, '❞ ' + escapeHtml(t.text));
    c.onmouseenter = ev => showTip(textTip(t), ev);
    c.onmousemove = moveTip;
    c.onmouseleave = hideTip;
    c.onclick = () => player.playFromSrc(M.phraseStart(t.sentence, t.text));
    s.appendChild(c);
  }
  if (!v.texts.length) s.appendChild(el('span', 'muted', 'none'));
  return s;
}

function sentenceHtml(v, i, kept) {
  let text = escapeHtml(M.segs[i].text);
  if (v.stage === 'roughcut') {
    const re = M.keywordRegex();
    if (re) text = text.replace(re, '<b class="kw">$1</b>');
  }
  if (v.stage === 'text') {
    const t = v.texts.find(t => t.sentence === i);
    if (t) {
      const raw = M.segs[i].text;
      const k = raw.toLowerCase().indexOf(t.text.toLowerCase());
      if (k >= 0) text = escapeHtml(raw.slice(0, k)) + `<b class="fxword">${escapeHtml(raw.slice(k, k + t.text.length))}</b>` + escapeHtml(raw.slice(k + t.text.length));
    }
  }
  return text + ' ';
}

function buildTranscript(v, mode, player, body) {
  const keepSet = new Set(v.keep);
  const collapsed = new Set(S.ui.collapsed || []);
  M.sections.forEach((s, k) => {
    const ids = [];
    for (let i = s.start; i <= s.end; i++) if (mode === 'source' || keepSet.has(i)) ids.push(i);
    if (!ids.length) return;
    const included = ids.some(i => keepSet.has(i));
    const sec = el('div', 'tsec' + (included ? '' : ' excl'));
    sec.style.setProperty('--c', s.color);
    const h = el('div', 'tsec-h', `<span class="ttl">${escapeHtml(s.title)}</span><button class="coll" title="Collapse / expand in every version">${collapsed.has(k) ? '▼' : '▲'}</button>`);
    h.querySelector('.ttl').onclick = () => {
      const first = ids.find(i => keepSet.has(i));
      if (first !== undefined) player.playFromSrc(M.segs[first].start);
    };
    h.querySelector('.ttl').title = included ? 'Play this section' : 'Not included in this version';
    h.querySelector('.coll').onclick = () => {
      const c = new Set(S.ui.collapsed || []);
      c.has(k) ? c.delete(k) : c.add(k);
      S.ui.collapsed = [...c];
      save();
      renderVersions();
    };
    sec.appendChild(h);
    if (!collapsed.has(k)) {
      const b = el('div', 'tsec-b');
      for (const i of ids) {
        const kept = keepSet.has(i);
        const br = v.brolls?.find(x => x.sentence === i);
        const tx = v.stage === 'text' ? v.texts.find(x => x.sentence === i) : null;
        const hasFx = (v.stage === 'broll' && br) || tx;
        const span = el('span', 'sent' + (kept ? ' kept' : ' cut') + (hasFx ? ' hasfx' : '') + (v.stage === 'roughcut' && kept ? ' colored' : ''));
        span.dataset.i = i;
        if (v.stage === 'broll' && br) {
          const url = brollThumb(br.media);
          const im = el('span', 'inline-broll');
          if (url) im.style.backgroundImage = `url('${url}')`;
          im.onmouseenter = ev => showTip(brollTip(br), ev);
          im.onmousemove = moveTip;
          im.onmouseleave = hideTip;
          span.appendChild(im);
        }
        span.insertAdjacentHTML('beforeend', sentenceHtml(v, i, kept));
        if (tx) {
          span.onmouseenter = ev => showTip(textTip(tx), ev);
          span.onmousemove = moveTip;
          span.onmouseleave = hideTip;
        }
        if (kept) span.onclick = () => player.playFromSrc(tx ? M.phraseStart(i, tx.text) : M.segs[i].start);
        b.appendChild(span);
      }
      sec.appendChild(b);
    }
    body.appendChild(sec);
  });
}

// --------------------------------------------------------------------------
// generation
// --------------------------------------------------------------------------

function compact(v) {
  return { id: v.id, keep: v.keep, brolls: v.brolls || [], texts: v.texts || [] };
}

function snapshot(v) {
  return { stage: v.stage, id: v.id, keep: [...v.keep], brolls: v.brolls || [], texts: v.texts || [] };
}

function addVersion(stage, res, opts) {
  const sd = stageOf(stage);
  let id;
  if (opts.editedFrom) {
    id = `${opts.editedFrom.id}-Edited`;
    let n = 2;
    while (sd.versions.some(v => v.id === id)) id = `${opts.editedFrom.id}-Edited-${n++}`;
  } else {
    id = String(sd.next++);
  }
  const base = opts.base || sd.baseSnap;
  const v = {
    id, stage, seq: S.seq++,
    keep: stage === 'roughcut' ? res.keep : [...base.keep],
    brolls: stage === 'broll' ? res.brolls : stage === 'text' ? (base.brolls || []) : [],
    texts: stage === 'text' ? res.texts : [],
    label: res.label || opts.editedFrom?.label || '',
    summary: res.summary || '',
    origin: opts.origin,
    prompt: opts.prompt || '',
    editedFrom: opts.editedFrom?.id || null,
    pinned: opts.editedFrom ? !!opts.editedFrom.pinned : opts.origin !== 'ai',
    archived: false,
  };
  sd.versions.push(v);
  return v;
}

async function startBatch(stage, baseVersion) {
  if (pending.stage) { alert('Please wait for the current generation to finish.'); return; }
  const sd = stageOf(stage);
  const unpinned = sd.versions.filter(v => !v.pinned);
  if (stage !== 'roughcut' && unpinned.length) {
    const ok = confirm(`Generate 10 new ${STAGE_NAME[stage]} versions on ${STAGE_NAME[baseVersion.stage]} #${baseVersion.id}?\n\n` +
      `The ${unpinned.length} unpinned ${STAGE_NAME[stage]} versions will be replaced. Pinned versions are kept.`);
    if (!ok) return;
  }
  if (stage === 'roughcut' && unpinned.length) {
    const ok = confirm(`Generate 10 new rough cuts? The ${unpinned.length} unpinned rough cuts will be replaced.`);
    if (!ok) return;
  }
  sd.versions = sd.versions.filter(v => v.pinned);
  if (baseVersion) sd.baseSnap = snapshot(baseVersion);
  S.ui.stage = stage;
  let plan;
  try { plan = await api('/api/plan', { stage }); } catch (e) { banner(`Could not plan the generation: ${escapeHtml(e.message)}`, 'error'); return; }
  pending = { stage, n: 0, total: plan.length };
  banner(`Generating ${plan.length} ${STAGE_NAME[stage]} recommendations through the LLM bridge (${CONCURRENCY} at a time)…`);
  renderAll();
  const errors = [];
  let next = 0;
  const worker = async () => {
    while (next < plan.length) {
      const k = next++;
      try {
        const res = await api('/api/generate', {
          project: P.id, stage, mode: 'augment', augment: plan[k], variant: k + 1,
          base: sd.baseSnap ? { keep: sd.baseSnap.keep } : undefined,
        });
        addVersion(stage, res, { origin: 'ai' });
      } catch (e) { errors.push(e.message); }
      pending.n++;
      save();
      renderAll();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  pending = { stage: null, n: 0, total: 0 };
  if (errors.length) banner(`${errors.length} of ${plan.length} generations failed: ${escapeHtml(errors[0])}`, 'error');
  else banner(null);
  save();
  renderAll();
}

let promptCtx = null;
function openPrompt(mode, target) {
  const st = target ? target.stage : S.ui.stage;
  promptCtx = { mode, target, stage: st };
  const d = $('#promptDialog');
  const examples = {
    roughcut: 'e.g. “Make a one-minute teaser about searing the breast”, or recombine: “Use the opening of #3 and the ending of #7.”',
    broll: 'e.g. “Use more illustrations”, or recombine: “Use first two B-roll images from #3 and last B-roll image from #7.”',
    text: 'e.g. “Show many text effects when I talk about ingredients”, or recombine: “Titles from #2 and lower thirds from #5.”',
  };
  const editEx = {
    roughcut: 'e.g. “Shorten the part about making stock.”',
    broll: 'e.g. “Replace the second B-roll with a video.”',
    text: 'e.g. “Use lower thirds instead of titles.”',
  };
  if (mode === 'edit') {
    $('#promptTitle').textContent = { roughcut: 'Edit this storyline', broll: 'Edit these B-rolls', text: 'Edit these text effects' }[st] + ` (#${target.id})`;
    $('#promptHelp').textContent = editEx[st] + ' The edited version appears right below the original.';
  } else {
    $('#promptTitle').textContent = `Generate a new ${STAGE_NAME[st]} version`;
    $('#promptHelp').textContent = examples[st] + ' Refer to versions by their number. New versions are pinned to the top.';
  }
  $('#surpriseBtn').hidden = mode === 'edit';
  $('#promptText').value = '';
  $('#promptStatus').textContent = '';
  setPromptBusy(false);
  d.showModal();
  $('#promptText').focus();
}

function setPromptBusy(b) {
  ['#promptGo', '#surpriseBtn', '#promptText'].forEach(s => { $(s).disabled = b; });
  $('#promptStatus').innerHTML = b ? '<span class="spinner"></span> Generating… (a few seconds)' : $('#promptStatus').innerHTML;
}

async function runPrompt(surprise) {
  const { mode, target, stage } = promptCtx;
  const text = $('#promptText').value.trim();
  if (!surprise && !text) { $('#promptStatus').textContent = 'Type what you want first, or press Surprise me.'; return; }
  const sd = stageOf(stage);
  const req = {
    project: P.id, stage,
    mode: mode === 'edit' ? 'edit' : surprise ? 'surprise' : 'prompt',
    prompt: text,
    versions: sd.versions.filter(v => !v.archived).map(compact),
  };
  if (mode === 'edit') { req.target = compact(target); req.base = { keep: target.keep }; } else if (stage !== 'roughcut') req.base = { keep: sd.baseSnap.keep };
  setPromptBusy(true);
  try {
    const res = await api('/api/generate', req);
    const v = addVersion(stage, res, mode === 'edit'
      ? { origin: 'edit', prompt: text, editedFrom: target, base: snapshot(target) }
      : { origin: surprise ? 'surprise' : 'prompt', prompt: surprise ? '' : text });
    save();
    $('#promptDialog').close();
    renderAll();
    requestAnimationFrame(() => focusCard(vkey(v)));
  } catch (e) {
    setPromptBusy(false);
    $('#promptStatus').innerHTML = `<span class="err">${escapeHtml(e.message)}</span>`;
  }
}

// --------------------------------------------------------------------------
// project loading
// --------------------------------------------------------------------------

function videoDuration(url) {
  return new Promise(res => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { res(v.duration); v.removeAttribute('src'); };
    v.onerror = () => res(0);
    v.src = url;
  });
}

async function loadProject(id) {
  players.forEach(p => p.pause());
  players.clear();
  M = null; S = null;
  thumbs = { step: 2, urls: [] };
  $('#versions').innerHTML = '';
  $('#outlineBody').innerHTML = '';
  try { localStorage.setItem('videodiff.project', id); } catch { /* ignore */ }
  banner('Loading the video and its transcript…');
  P = await api(`/api/project/${id}`);
  P.duration = (await videoDuration(P.videoUrl)) || (P.segments.at(-1)?.end ?? 0) + 1;
  let analysis = P.analysis;
  if (!analysis) {
    banner('<span class="spinner"></span> Segmenting the transcript into sections and finding visually concrete keywords (LLM)…');
    try { analysis = await api(`/api/project/${id}/analyze`, {}); } catch (e) {
      banner(`Could not analyse the transcript: ${escapeHtml(e.message)} <button id="retryBtn">Retry</button>`, 'error');
      $('#retryBtn').onclick = () => loadProject(id);
      return;
    }
  }
  M = new Model(P, analysis);
  S = P.state || freshState();
  S.ui = { ...freshState().ui, ...(S.ui || {}) };
  banner(null);
  renderCredits();
  renderAll();
  extractThumbs(P.videoUrl, P.duration, P.id);
  if (!stageOf('roughcut').versions.length) startBatch('roughcut', null);
}

function renderCredits() {
  const b = health?.bridge;
  $('#credits').innerHTML = `
    <div><b>Substitutions</b></div>
    <div>AI: ${b ? `LLM bridge → ${escapeHtml(b.backend)} (${escapeHtml(b.model)})` : 'LLM bridge (not reachable)'}, not GPT-4o</div>
    <div>Transcript: provided Whisper-format file, not the Whisper API</div>
    <div>B-roll: local library search, not a stock media API</div>
    <div>Player: custom HTML5 compositor, not Remotion</div>
    <button id="resetBtn" class="ghost small">Start over (new rough cuts)</button>`;
  $('#resetBtn').onclick = async () => {
    if (!confirm('Delete every version of this video and generate 10 new rough cuts?')) return;
    await api(`/api/project/${P.id}/reset`, {});
    loadProject(P.id);
  };
}

async function init() {
  try { health = await api('/api/health'); } catch { health = null; }
  if (!health?.bridge) {
    banner(`The LLM bridge is not running at ${escapeHtml(health?.url || 'http://localhost:8787')}. From the repository root run
      <code>python3 llm-bridge/bridge.py claude</code>, then reload.`, 'error');
  }
  const projects = await api('/api/projects');
  const sel = $('#projectSelect');
  sel.innerHTML = projects.map(p => `<option value="${p.id}">${escapeHtml(p.title)}${p.builtin ? '' : ' (upload)'}</option>`).join('');
  let last = null;
  try { last = localStorage.getItem('videodiff.project'); } catch { /* ignore */ }
  const id = projects.some(p => p.id === last) ? last : projects[0]?.id;
  sel.value = id;
  sel.onchange = () => loadProject(sel.value);
  if (!health?.bridge) return; // banner above explains how to start the bridge
  await loadProject(id);
}

// --------------------------------------------------------------------------
// wiring
// --------------------------------------------------------------------------

$('#viewToggle').onchange = e => { S.ui.view = e.target.checked ? 'transcript' : 'timeline'; save(); renderVersions(); };
$('#timelineToggle').onchange = e => { S.ui.timeline = e.target.checked ? 'source' : 'edited'; save(); renderVersions(); };
$('#sortSelect').onchange = e => { S.ui.sort[S.ui.stage] = e.target.value; save(); renderAll(); };
$('#generateBtn').onclick = () => openPrompt('new', null);
$('#promptForm').onsubmit = e => { e.preventDefault(); runPrompt(false); };
$('#surpriseBtn').onclick = () => runPrompt(true);
$('#promptCancel').onclick = () => $('#promptDialog').close();
$('#promptText').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runPrompt(false); } });

$('#uploadBtn').onclick = () => { $('#upStatus').textContent = ''; $('#uploadDialog').showModal(); };
$('#upCancel').onclick = () => $('#uploadDialog').close();
$('#uploadForm').onsubmit = async e => {
  e.preventDefault();
  const vf = $('#upVideo').files[0], tf = $('#upTranscript').files[0];
  if (!vf || !tf) { $('#upStatus').textContent = 'Choose a video and a transcript file.'; return; }
  const title = $('#upTitle').value.trim() || vf.name.replace(/\.[^.]+$/, '');
  try {
    $('#upStatus').innerHTML = '<span class="spinner"></span> Uploading video…';
    let r = await fetch(`/api/upload?kind=video&name=${encodeURIComponent(vf.name)}&title=${encodeURIComponent(title)}`, { method: 'POST', body: vf });
    const { id, error } = await r.json();
    if (error) throw new Error(error);
    $('#upStatus').innerHTML = '<span class="spinner"></span> Uploading transcript…';
    r = await fetch(`/api/upload?kind=transcript&id=${id}&name=${encodeURIComponent(tf.name)}`, { method: 'POST', body: tf });
    const t = await r.json();
    if (t.error) throw new Error(t.error);
    $('#uploadDialog').close();
    const projects = await api('/api/projects');
    $('#projectSelect').innerHTML = projects.map(p => `<option value="${p.id}">${escapeHtml(p.title)}${p.builtin ? '' : ' (upload)'}</option>`).join('');
    $('#projectSelect').value = id;
    loadProject(id);
  } catch (err) {
    $('#upStatus').innerHTML = `<span class="err">${escapeHtml(err.message)}</span>`;
  }
};

let resizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderVersions, 150); });

init();
