// VideoDiff app shell: state, outline, toolbar, variations list, generation flows.

import { el, icon, fmtTime, toast, pool, hideTip } from "./util.js";
import { STAGES, STAGE_LABEL, buildTranscript, layoutVersion, headerText, getVersion, roughcutOf } from "./model.js";
import { settings, analyzeVideo, augmentations, generateRoughCut, generateBroll, generateText, promptGenerate } from "./ai.js";
import { ThumbStore } from "./thumbs.js";
import { Player, pauseAll } from "./player.js";
import { renderTimeline, renderTranscript, renderMiniTimeline } from "./views.js";

const app = document.getElementById("app");

const state = {
  videos: [],
  bridge: null,
  project: null,
  stage: "roughcut",
  view: "timeline", // timeline | transcript
  mode: "edited", // edited | source
  sort: { roughcut: "default", broll: "default", text: "default" },
  perGen: 10,
  busy: null, // { label, done, total }
  base: { broll: null, text: null }, // base version for "Generate new" in later stages
  popover: null, // { kind, versionId?, running }
};
const thumbs = new ThumbStore();
const players = new Map(); // version id -> Player
const playheadFns = new Map(); // version id -> Map(key -> fn)
const collapsedByVersion = new Map();

try {
  const saved = JSON.parse(localStorage.getItem("videodiff-ui") || "{}");
  if (saved.view) state.view = saved.view;
  if (saved.perGen) state.perGen = saved.perGen;
} catch {}
function saveUI() {
  try {
    localStorage.setItem("videodiff-ui", JSON.stringify({ view: state.view, perGen: state.perGen, video: state.project?.id }));
  } catch {}
}

// ------------------------------------------------------------------ persistence
let saveTimer = null;
function saveProject() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const p = state.project;
    if (!p) return;
    const { library, ...rest } = p;
    fetch(`/api/projects/${encodeURIComponent(p.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rest) }).catch(() => {});
  }, 300);
}

// ------------------------------------------------------------------ versions
function newVersion(stage, data) {
  const p = state.project;
  const num = ++p.counters[stage];
  let label = data.label || String(num);
  while (p.versions[stage].some((v) => v.label === label)) label += "'";
  const v = { id: `${stage}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, stage, num, pinned: false, archived: false, createdAt: Date.now(), attrs: [], ...data, label };
  p.versions[stage].push(v);
  return v;
}

function sortKey(stage, v) {
  const lay = layoutVersion(state.project, v);
  const s = state.sort[stage];
  if (s === "shortest") return lay.duration;
  if (s === "longest") return -lay.duration;
  if (s === "most-sections") return -lay.sectionsIncluded * 1e4 + lay.duration;
  if (s === "fewest-sections") return lay.sectionsIncluded * 1e4 + lay.duration;
  if (s === "most") return -v.items.length;
  if (s === "fewest") return v.items.length;
  if (s.startsWith("type:")) {
    const t = s.slice(5);
    const matchCount = v.items.filter((it) => (stage === "broll" ? it.mediaItem?.type : it.style || v.style) === t).length;
    return -(matchCount / Math.max(1, v.items.length)) * 1000 + v.num * 0.001;
  }
  return v.num;
}

// Display order: pinned on top, archived at the bottom, edits right below their original.
function orderedVersions(stage) {
  const list = state.project.versions[stage];
  const byParent = new Map();
  const roots = [];
  for (const v of list) {
    if (v.parentId && list.some((x) => x.id === v.parentId)) {
      if (!byParent.has(v.parentId)) byParent.set(v.parentId, []);
      byParent.get(v.parentId).push(v);
    } else roots.push(v);
  }
  const keyed = roots.map((v) => ({ v, k: sortKey(stage, v) }));
  keyed.sort((a, b) => a.k - b.k || a.v.num - b.v.num);
  const group = (v) => (v.pinned ? 0 : v.archived ? 2 : 1);
  keyed.sort((a, b) => group(a.v) - group(b.v));
  const out = [];
  const add = (v) => {
    out.push(v);
    for (const c of (byParent.get(v.id) || []).sort((a, b) => a.createdAt - b.createdAt)) add(c);
  };
  keyed.forEach(({ v }) => add(v));
  return out;
}

function getPlayer(v, lay) {
  let p = players.get(v.id);
  if (!p) {
    p = new Player(state.project.videoUrl, lay);
    p.onChange((et) => {
      const fns = playheadFns.get(v.id);
      if (fns) for (const fn of fns.values()) fn(et);
    });
    players.set(v.id, p);
  } else p.setLayout(lay);
  return p;
}

function onPlayhead(key, fn) {
  const id = key.split(":")[0];
  if (!playheadFns.has(id)) playheadFns.set(id, new Map());
  playheadFns.get(id).set(key, fn);
}

// ------------------------------------------------------------------ rendering
let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderNow();
  });
}

function renderNow() {
  hideTip();
  const keep = new Map();
  document.querySelectorAll("[data-sk]").forEach((n) => keep.set(n.dataset.sk, [n.scrollTop, n.scrollLeft]));

  if (!state.project) {
    app.replaceChildren(topbar(), welcome());
    return;
  }
  app.replaceChildren(topbar(), el("div", { class: "main" }, outline(), workspace()));

  document.querySelectorAll("[data-sk]").forEach((n) => {
    const k = keep.get(n.dataset.sk);
    if (k) [n.scrollTop, n.scrollLeft] = k;
  });
}

function toggle(leftLabel, rightLabel, isRight, onChange, title) {
  return el(
    "label",
    { class: "toggle", title },
    el("span", { class: isRight ? "" : "on" }, leftLabel),
    el("span", { class: "switch" + (isRight ? " right" : ""), onclick: (e) => { e.preventDefault(); onChange(!isRight); } }, el("span", { class: "knob" })),
    el("span", { class: isRight ? "on" : "" }, rightLabel)
  );
}

function topbar() {
  const b = state.bridge;
  const bridgeInfo = settings.stub
    ? el("span", { class: "badge stub", title: "No LLM: heuristic stand-ins generate the variations" }, "Offline stub (no LLM)")
    : b?.ok
      ? el("span", { class: "badge ok", title: `LLM bridge at ${b.bridge}` }, `LLM: ${b.info?.backend || "bridge"}${b.info?.model ? " · " + b.info.model : ""} (stands in for GPT-4o)`)
      : el("span", { class: "badge bad", title: b?.error || "" }, "LLM bridge offline");
  return el(
    "header",
    { class: "topbar" },
    el("div", { class: "logo", onclick: () => closeProject() }, "Video Diff"),
    state.project ? el("span", { class: "video-name", title: "Current video" }, state.project.title) : null,
    bridgeInfo,
    el("span", { class: "flex1" }),
    state.project
      ? el("label", { class: "pergen", title: "How many variations each generation creates (the paper uses 10)" }, "Variations per generation ",
          el("select", { onchange: (e) => { state.perGen = +e.target.value; saveUI(); } }, [3, 5, 10].map((n) => el("option", { value: n, selected: n === state.perGen }, n))))
      : null,
    state.project ? toggle("Timeline View", "Transcript View", state.view === "transcript", (r) => { state.view = r ? "transcript" : "timeline"; saveUI(); render(); }) : null
  );
}

function outline() {
  const p = state.project;
  return el(
    "aside",
    { class: "outline", "data-sk": "outline" },
    el("div", { class: "outline-title" }, "VERSIONS OUTLINE"),
    STAGES.map((st) => {
      const list = orderedVersions(st);
      if (!list.length && st !== "roughcut") return null;
      return el(
        "div",
        { class: "outline-group" + (st === state.stage ? " current" : "") },
        el("div", { class: "outline-stage", onclick: () => setStage(st) }, `${STAGE_LABEL[st]} versions`),
        list.map((v) =>
          el("div", {
            class: "outline-item" + (v.pinned ? " pinned" : "") + (v.archived ? " archived" : "") + (v.isNew ? " new" : ""),
            onclick: () => focusVersion(v),
            title: v.summary || "",
          }, (v.pinned ? "📌 " : "") + headerText(p, v, layoutVersion(p, v)))
        )
      );
    }),
    el("div", { class: "outline-foot" },
      el("button", { class: "link", onclick: () => closeProject() }, "Change video"),
      el("button", { class: "link", onclick: () => resetProject() }, "Reset project"))
  );
}

const SORTS = {
  roughcut: [["default", "Version ID"], ["shortest", "Shortest Duration"], ["longest", "Longest Duration"], ["most-sections", "Most Sections"], ["fewest-sections", "Fewest Sections"]],
  broll: [["default", "Version ID"], ["most", "Most B-Rolls"], ["fewest", "Fewest B-Rolls"], ["type:photo", "Media: Photo"], ["type:illustration", "Media: Illustration"], ["type:video", "Media: Video"]],
  text: [["default", "Version ID"], ["most", "Most Text Effects"], ["fewest", "Fewest Text Effects"], ["type:title", "Style: Title"], ["type:subtitle", "Style: Subtitle"], ["type:lower", "Style: Lower Thirds"]],
};

function workspace() {
  const st = state.stage;
  const p = state.project;
  const tabs = el("div", { class: "stage-tabs" }, STAGES.map((s, k) =>
    el("button", { class: "stage-tab" + (s === st ? " active" : ""), onclick: () => setStage(s) },
      el("span", { class: "stage-num" }, k + 1), STAGE_LABEL[s], el("span", { class: "count" }, p.versions[s].length))
  ));
  const gen = el("button", { class: "btn-generate", onclick: (e) => openPopover(e.currentTarget, { kind: "new" }), disabled: !!state.busy || (st !== "roughcut" && !p.versions[prevStage(st)].length) }, icon("sparkle", 18), "GENERATE NEW");
  const toolbar = el(
    "div",
    { class: "toolbar" },
    tabs,
    gen,
    el("span", { class: "flex1" }),
    toggle("Extracted Timeline", "Original Timeline", state.mode === "source", (r) => { state.mode = r ? "source" : "edited"; render(); }, "Align variations by the edited video or by the original source video"),
    el("label", { class: "sortby" }, el("span", {}, "Sort By"),
      el("select", { onchange: (e) => { state.sort[st] = e.target.value; render(); } }, SORTS[st].map(([k, l]) => el("option", { value: k, selected: state.sort[st] === k }, l))))
  );
  const busy = state.busy
    ? el("div", { class: "busy" }, el("span", { class: "spinner" }), `${state.busy.label}${state.busy.total ? ` (${state.busy.done}/${state.busy.total})` : ""}`)
    : null;
  const bridgeWarn = !settings.stub && state.bridge && !state.bridge.ok ? bridgeBanner() : null;

  const list = orderedVersions(st);
  let content;
  if (!list.length) {
    content = el("div", { class: "empty" }, st === "roughcut"
      ? (state.busy ? "Generating rough cuts…" : el("div", {}, "No rough cuts yet. ", el("button", { class: "btn", onclick: () => generateStage("roughcut") }, `Generate ${state.perGen} rough cuts`)))
      : el("div", {}, `No ${STAGE_LABEL[st]} versions yet. Pick a ${STAGE_LABEL[prevStage(st)]} version and click its `, icon("wand", 16), st === "broll" ? " (add B-roll) button." : " (add text effects) button."));
  } else content = state.view === "timeline" ? timelineList(list) : transcriptColumns(list);

  return el("section", { class: "workspace" }, toolbar, bridgeWarn, busy, el("div", { class: "versions" + (state.view === "transcript" ? " tx-mode" : ""), "data-sk": `versions-${st}-${state.view}` }, content));
}

function prevStage(st) {
  return STAGES[STAGES.indexOf(st) - 1];
}

function bridgeBanner() {
  return el(
    "div",
    { class: "banner" },
    el("div", {}, el("b", {}, "The LLM bridge is not reachable. "), "Start it from the repository root with ", el("code", {}, "python3 llm-bridge/bridge.py claude"), ", then click Retry. Or continue with the offline stub (heuristic stand-ins, no LLM)."),
    el("button", { class: "btn", onclick: checkBridge }, "Retry"),
    el("button", { class: "btn", onclick: () => { settings.stub = true; render(); } }, "Use offline stub")
  );
}

function versionHeader(v, lay) {
  const p = state.project;
  const chips = (v.attrs || []).map((a) => el("span", { class: "chip" }, `${a.name}: ${a.value}`));
  const base = v.stage === "broll" ? getVersion(p, v.rc) : v.stage === "text" ? getVersion(p, v.br) : null;
  return el(
    "div",
    { class: "vhead" + (v.summary && v.parentId ? " edited" : "") },
    el("h3", {}, headerText(p, v, lay), v.prompt ? el("span", { class: "vprompt" }, ` + ${v.prompt}`) : null),
    el("button", { class: "btn-edit", onclick: (e) => openPopover(e.currentTarget, { kind: "edit", versionId: v.id }), disabled: !!state.busy }, "EDIT"),
    chips,
    base ? el("span", { class: "basenote" }, `on ${STAGE_LABEL[base.stage]} #${base.label}`) : null,
    v.isNew ? el("span", { class: "chip new" }, "NEW") : null,
    v.summary ? el("span", { class: "vsummary" }, v.summary) : null
  );
}

function actions(v) {
  const next = v.stage === "roughcut" ? "add B-roll" : v.stage === "broll" ? "add text effects" : null;
  return el(
    "div",
    { class: "vactions" },
    next ? el("button", { class: "ibtn", title: `${next[0].toUpperCase() + next.slice(1)}: generate ${state.perGen} ${STAGE_LABEL[STAGES[STAGES.indexOf(v.stage) + 1]]} variations of this version`, onclick: () => nextStage(v), disabled: !!state.busy }, icon("wand")) : null,
    el("button", { class: "ibtn" + (v.pinned ? " active" : ""), title: v.pinned ? "Unpin" : "Pin to top", onclick: () => { v.pinned = !v.pinned; if (v.pinned) v.archived = false; saveProject(); render(); } }, icon("pin")),
    el("button", { class: "ibtn" + (v.archived ? " active" : ""), title: v.archived ? "Unarchive" : "Archive (move to bottom)", onclick: () => { v.archived = !v.archived; if (v.archived) v.pinned = false; saveProject(); render(); } }, icon("archive"))
  );
}

function timelineList(list) {
  const p = state.project;
  const isSource = state.mode === "source";
  const avail = Math.max(300, (document.querySelector(".workspace")?.clientWidth || window.innerWidth - 260) - 260 - 120 - 40);
  const visible = list.filter((v) => !v.archived);
  const maxDur = isSource ? p.duration : Math.max(1, ...(visible.length ? visible : list).map((v) => layoutVersion(p, v).duration));
  const pps = avail / maxDur;
  const ctx = { project: p, mode: state.mode, pps, thumbs, onPlayhead, rerender: render };
  return list.map((v) => {
    const lay = layoutVersion(p, v);
    const player = getPlayer(v, lay);
    const row = el(
      "div",
      { class: "vrow" + (v.pinned ? " pinned" : "") + (v.archived ? " archived" : "") + (v.parentId ? " child" : ""), id: "v-" + v.id },
      versionHeader(v, lay),
      v.archived
        ? null
        : el("div", { class: "vbody" }, player.el, el("div", { class: "tl-wrap", "data-sk": `tl-${v.id}-${state.mode}` }, renderTimeline(ctx, v, lay, player)), actions(v))
    );
    if (v.archived) row.querySelector(".vhead").append(actions(v));
    return row;
  });
}

function transcriptColumns(list) {
  const p = state.project;
  const cols = list.map((v) => {
    const lay = layoutVersion(p, v);
    const player = getPlayer(v, lay);
    if (!collapsedByVersion.has(v.id)) collapsedByVersion.set(v.id, new Set());
    const ctx = { project: p, mode: state.mode, thumbs, onPlayhead, rerender: render, collapsed: collapsedByVersion.get(v.id) };
    const { body, content } = renderTranscript(ctx, v, lay, player);
    body.dataset.sk = `tx-${v.id}-${state.mode}`;
    body.addEventListener("scroll", () => syncScroll(body));
    // Only the column the user is actually scrolling drives the others (avoids feedback jitter).
    for (const ev of ["wheel", "pointerdown", "touchstart", "keydown", "mouseenter"]) body.addEventListener(ev, () => (scrollLeader = body), { passive: true });
    return el(
      "div",
      { class: "tx-col" + (v.pinned ? " pinned" : "") + (v.archived ? " archived" : ""), "data-id": v.id, id: "v-" + v.id },
      el("div", { class: "tx-colhead" }, versionHeader(v, lay), actions(v)),
      player.el,
      renderMiniTimeline(ctx, v, lay, player),
      content,
      body
    );
  });
  return el("div", { class: "tx-columns", "data-sk": `txcols-${state.stage}` }, cols);
}

// Synchronised scrolling across transcript columns, anchored on the transcript segment at the top.
let scrollLeader = null;
function syncScroll(src) {
  if (src !== scrollLeader) return;
  const top = src.getBoundingClientRect().top;
  let anchor = null;
  for (const s of src.querySelectorAll(".tx-seg")) {
    const r = s.getBoundingClientRect();
    if (r.bottom > top + 2) {
      anchor = { seg: +s.dataset.seg, off: r.top - top };
      break;
    }
  }
  if (!anchor) return;
  for (const body of document.querySelectorAll(".tx-body")) {
    if (body === src) continue;
    let target = body.querySelector(`[data-seg="${anchor.seg}"]`);
    if (!target) {
      // nearest later segment
      let best = null;
      for (const s of body.querySelectorAll(".tx-seg")) if (+s.dataset.seg >= anchor.seg && (!best || +s.dataset.seg < +best.dataset.seg)) best = s;
      target = best;
    }
    if (target) body.scrollTop += target.getBoundingClientRect().top - body.getBoundingClientRect().top - anchor.off;
  }
}

// ------------------------------------------------------------------ navigation
function setStage(st) {
  pauseAll();
  state.stage = st;
  state.popover = null;
  render();
}

function focusVersion(v) {
  if (state.stage !== v.stage) setStage(v.stage);
  setTimeout(() => {
    const node = document.getElementById("v-" + v.id);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      node.classList.add("flash");
      setTimeout(() => node.classList.remove("flash"), 1300);
    }
  }, 60);
}

// ------------------------------------------------------------------ popovers (generate new / edit)
function openPopover(anchor, spec) {
  closePopover();
  const p = state.project;
  const st = spec.versionId ? getVersion(p, spec.versionId).stage : state.stage;
  const target = spec.versionId ? getVersion(p, spec.versionId) : null;
  const what = { roughcut: "storyline", broll: "B-roll", text: "text effects" }[st];
  const ta = el("textarea", {
    rows: 3,
    placeholder: spec.kind === "edit"
      ? { roughcut: "e.g. Shorten the part about stock. / Switch the first two sections.", broll: "e.g. Remove the first two B-rolls. / Use videos instead of photos.", text: "e.g. Use title style for all. / Add a text effect when I mention butter." }[st]
      : { roughcut: "e.g. A 1-minute version focused on searing the breast. / Combine the intro of #2 with the rest of #5.", broll: "e.g. Use first two B-roll images from #3 and last B-roll image from #7.", text: "e.g. Show many text effects when I talk about ingredients." }[st],
  });

  let baseSel = null;
  if (spec.kind === "new" && st !== "roughcut") {
    const prev = p.versions[prevStage(st)];
    const def = state.base[st] && prev.some((x) => x.id === state.base[st]) ? state.base[st] : prev[0]?.id;
    baseSel = el("select", {}, prev.map((x) => el("option", { value: x.id, selected: x.id === def }, `${STAGE_LABEL[x.stage]} #${x.label}`)));
  }
  const status = el("div", { class: "pop-status" });
  const run = async (mode) => {
    const prompt = ta.value.trim();
    if (mode !== "surprise" && !prompt) {
      ta.focus();
      return;
    }
    status.replaceChildren(el("span", { class: "spinner" }), " Generating…");
    pop.classList.add("running");
    try {
      const base = target ? (st === "broll" ? getVersion(p, target.rc) : st === "text" ? getVersion(p, target.br) : null) : baseSel ? getVersion(p, baseSel.value) : null;
      if (baseSel) state.base[st] = baseSel.value;
      const v = await runPromptGeneration(st, { mode: spec.kind === "edit" ? "edit" : mode, prompt, target, base });
      closePopover();
      focusVersion(v);
    } catch (e) {
      pop.classList.remove("running");
      status.replaceChildren(el("span", { class: "err" }, String(e.message || e)));
    }
  };
  const pop = el(
    "div",
    { class: "popover", onclick: (e) => e.stopPropagation() },
    el("button", { class: "pop-close", onclick: closePopover }, icon("close", 16)),
    el("div", { class: "pop-title" }, spec.kind === "edit" ? `Edit this ${what} (#${target.label})` : `Generate a new ${STAGE_LABEL[st]} version`),
    baseSel ? el("label", { class: "pop-base" }, "Based on ", baseSel) : null,
    el("fieldset", {}, el("legend", {}, "Type your changes."), ta),
    spec.kind === "new" ? el("div", { class: "pop-hint" }, "Refer to versions by ID (e.g. #3, #7) to recombine them.") : null,
    el("div", { class: "pop-actions" },
      status,
      spec.kind === "new" ? el("button", { class: "btn", onclick: () => run("surprise") }, icon("sparkle", 16), "Surprise me") : null,
      el("button", { class: "btn primary", onclick: () => run("new") }, "GENERATE"))
  );
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run("new");
  });
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.min(window.innerWidth - 420, Math.max(8, r.left)) + "px";
  pop.style.top = Math.min(window.innerHeight - 260, r.bottom + 6) + "px";
  state.popover = pop;
  setTimeout(() => ta.focus(), 0);
}

function closePopover() {
  if (state.popover) state.popover.remove();
  state.popover = null;
}
document.addEventListener("click", (e) => {
  if (state.popover && !state.popover.contains(e.target) && !e.target.closest(".btn-edit, .ibtn, .btn-generate") && !state.popover.classList.contains("running")) closePopover();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePopover();
});

async function runPromptGeneration(stage, { mode, prompt, target, base }) {
  const p = state.project;
  const res = await promptGenerate(p, stage, { mode, prompt, target, base });
  const common = { prompt: mode === "surprise" ? "Surprise me" : prompt, summary: res.summary || (mode === "surprise" ? "A new alternative different from the existing ones." : "") };
  let data;
  if (stage === "roughcut") data = { segs: res.segs };
  else if (stage === "broll") data = { items: res.items, media: res.media, rc: base.id };
  else data = { items: res.items, style: res.style, br: base.id };

  let v;
  if (mode === "edit") {
    v = newVersion(stage, { ...data, ...common, attrs: target.attrs, parentId: target.id, label: `${target.label}-Edited`, prompt: [target.prompt, prompt].filter(Boolean).join(" + ") });
  } else {
    v = newVersion(stage, { ...data, ...common, pinned: true, isNew: true }); // new results are pinned to the top
  }
  saveProject();
  render();
  return v;
}

// ------------------------------------------------------------------ stage generation
async function nextStage(v) {
  const st = v.stage === "roughcut" ? "broll" : "text";
  const p = state.project;
  const existing = p.versions[st].filter((x) => (st === "broll" ? x.rc : x.br) === v.id);
  state.base[st] = v.id;
  if (existing.length && !confirm(`#${v.label} already has ${existing.length} ${STAGE_LABEL[st]} versions. Generate ${state.perGen} more?\n(Cancel just shows them.)`)) {
    setStage(st);
    return;
  }
  setStage(st);
  await generateStage(st, v);
}

async function generateStage(stage, base) {
  const p = state.project;
  const n = state.perGen;
  const augs = augmentations(stage, n);
  state.busy = { label: `Generating ${n} ${STAGE_LABEL[stage]} variations${base ? ` for #${base.label}` : ""}`, done: 0, total: n };
  render();
  const seed0 = p.counters[stage];
  const tasks = augs.map((aug, k) => async () => {
    if (stage === "roughcut") {
      const r = await generateRoughCut(p, aug);
      return newVersion("roughcut", { segs: r.segs, note: r.note, attrs: [{ name: "Length", value: aug.length.label }, { name: "Focus", value: aug.focus.label }] });
    }
    if (stage === "broll") {
      const r = await generateBroll(p, base, aug, seed0 + k);
      return newVersion("broll", { rc: base.id, items: r.items, media: aug.media.key, attrs: [{ name: "Frequency", value: aug.frequency.label }] });
    }
    const r = await generateText(p, base, aug);
    return newVersion("text", { br: base.id, items: r.items, style: aug.style.key, attrs: [{ name: "Frequency", value: aug.frequency.label }] });
  });
  const errors = [];
  await pool(tasks, 4, (i, res) => {
    state.busy.done++;
    if (res && res.error) errors.push(res.error);
    saveProject();
    render();
  });
  state.busy = null;
  if (errors.length) {
    toast(`${errors.length} of ${n} generations failed: ${errors[0].message || errors[0]}`, "error", 8000);
    if (/bridge|fetch|reach/i.test(String(errors[0].message))) checkBridge();
  }
  saveProject();
  render();
}

// ------------------------------------------------------------------ project lifecycle
async function checkBridge() {
  try {
    state.bridge = await (await fetch("/api/health")).json();
  } catch {
    state.bridge = { ok: false };
  }
  render();
  return state.bridge.ok;
}

function closeProject() {
  for (const pl of players.values()) pl.destroy();
  players.clear();
  playheadFns.clear();
  state.project = null;
  state.busy = null;
  saveUI();
  history.replaceState(null, "", location.pathname);
  loadVideos().then(render);
}

async function loadVideos() {
  state.videos = await (await fetch("/api/videos")).json();
}

function videoDuration(url) {
  return new Promise((res) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => res(v.duration);
    v.onerror = () => res(null);
    v.src = url;
  });
}

async function openVideo(meta) {
  closePopover();
  for (const pl of players.values()) pl.destroy();
  players.clear();
  playheadFns.clear();
  state.stage = "roughcut";
  history.replaceState(null, "", `?video=${encodeURIComponent(meta.id)}`);

  const [trJson, saved, library, dur] = await Promise.all([
    fetch(meta.transcriptUrl).then((r) => r.json()),
    fetch(`/api/projects/${encodeURIComponent(meta.id)}`).then((r) => r.json()),
    fetch(`/api/broll${meta.sample ? `?video=${encodeURIComponent(meta.id)}` : ""}`).then((r) => r.json()),
    videoDuration(meta.url),
  ]);
  const transcript = buildTranscript(trJson);
  const duration = dur || transcript[transcript.length - 1].end;
  state.project = saved && saved.transcript
    ? { ...saved, library, videoUrl: meta.url, title: meta.title, duration }
    : { id: meta.id, title: meta.title, videoUrl: meta.url, duration, transcript, sections: [], keywords: {}, versions: { roughcut: [], broll: [], text: [] }, counters: { roughcut: 0, broll: 0, text: 0 }, library };
  saveUI();
  thumbs.extract(meta.url, duration).catch((e) => toast(e.message, "error"));
  render();

  if (!state.project.sections.length) {
    if (!settings.stub && !(await checkBridge())) return; // banner offers retry / stub
    await setupProject();
  }
}

async function setupProject() {
  const p = state.project;
  state.busy = { label: "Segmenting the video into sections and finding visually concrete keywords" };
  render();
  try {
    const { sections, keywords } = await analyzeVideo(p);
    p.sections = sections;
    p.keywords = keywords;
    saveProject();
  } catch (e) {
    state.busy = null;
    toast("Analysis failed: " + (e.message || e), "error", 8000);
    checkBridge();
    render();
    return;
  }
  state.busy = null;
  await generateStage("roughcut");
}

async function resetProject() {
  const p = state.project;
  if (!confirm("Delete all sections and variations for this video and start over?")) return;
  await fetch(`/api/projects/${encodeURIComponent(p.id)}`, { method: "DELETE" });
  const meta = state.videos.find((v) => v.id === p.id);
  await openVideo(meta);
}
window.videodiffReset = resetProject;

// ------------------------------------------------------------------ welcome / upload
function welcome() {
  const vfile = el("input", { type: "file", accept: "video/mp4,video/webm,video/quicktime" });
  const tfile = el("input", { type: "file", accept: ".json,.srt" });
  const msg = el("div", { class: "upload-msg" });
  const upload = async () => {
    if (!vfile.files[0] || !tfile.files[0]) {
      msg.textContent = "Choose both a video and its transcript.";
      return;
    }
    msg.replaceChildren(el("span", { class: "spinner" }), " Uploading…");
    try {
      const f = vfile.files[0];
      const up = await (await fetch(`/api/upload?name=${encodeURIComponent(f.name)}`, { method: "POST", body: f })).json();
      const t = tfile.files[0];
      const fmt = t.name.toLowerCase().endsWith(".srt") ? "srt" : "json";
      const r = await fetch(`/api/upload-transcript?id=${encodeURIComponent(up.id)}&format=${fmt}`, { method: "POST", body: await t.text() });
      if (!r.ok) throw new Error((await r.json()).error);
      await loadVideos();
      openVideo(state.videos.find((v) => v.id === up.id));
    } catch (e) {
      msg.textContent = "Upload failed: " + (e.message || e);
    }
  };
  return el(
    "div",
    { class: "welcome" },
    el("h1", {}, "Video Diff"),
    el("p", { class: "lead" }, "Generate, compare and customise AI edit alternatives — rough cuts, B-roll and text effects."),
    el("h2", {}, "Choose a video"),
    el("div", { class: "video-cards" }, state.videos.filter((v) => v.hasTranscript).map((v) =>
      el("div", { class: "video-card", onclick: () => openVideo(v) },
        el("video", { src: v.url + "#t=15", preload: "metadata", muted: true }),
        el("div", { class: "vc-title" }, v.title),
        el("div", { class: "vc-sub" }, v.sample ? "Sample video (transcript provided)" : "Uploaded"))
    )),
    el("h2", {}, "Or upload your own"),
    el("div", { class: "upload" },
      el("label", {}, "Video (MP4/WebM) ", vfile),
      el("label", {}, "Transcript (Whisper JSON or SRT) ", tfile),
      el("button", { class: "btn primary", onclick: upload }, "Upload & open"),
      msg,
      el("p", { class: "note" }, "The paper transcribes uploads with the Whisper API. This build has no API key, so it asks for a transcript file instead (e.g. from a local Whisper run).")
    ),
    el("p", { class: "note" }, "LLM calls go through the workshop LLM bridge. ", state.bridge?.ok ? `Bridge connected (${state.bridge.info?.backend || "ok"}).` : el("span", {}, "Bridge not connected: start it with ", el("code", {}, "python3 llm-bridge/bridge.py claude"), "."))
  );
}

// ------------------------------------------------------------------ boot
thumbs.onUpdate(() => {
  // Thumbnails arrive progressively; fill them into the existing tiles without re-rendering.
  document.querySelectorAll(".tl-tile[data-t]").forEach((t) => {
    const url = thumbs.thumbAt(+t.dataset.t);
    if (url) t.style.backgroundImage = `url(${url})`;
  });
});
window.addEventListener("resize", () => render());

(async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get("stub") === "1") settings.stub = true;
  await Promise.all([loadVideos(), checkBridge()]);
  const want = params.get("video");
  const meta = want && state.videos.find((v) => v.id === want);
  if (meta) await openVideo(meta);
  else render();
})();

// Small extra for the toolbar: reset project (exposed in the outline footer).
export { resetProject, fmtTime, roughcutOf };
