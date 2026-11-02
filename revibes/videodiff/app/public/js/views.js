// Timeline view and transcript view for one variation (paper §4.2, Figures 2-5).

import { el, fmtTime, hexToRgba, showTip, moveTip, hideTip, escapeRegExp, icon } from "./util.js";
import { editToSource, sourceToEdit, sectionIndexOf, styleLabel } from "./model.js";
import { brollMedia } from "./player.js";

const TILE_W = 64;

function thumbsRow(ctx, times) {
  return el("div", { class: "tip-thumbs" }, times.map((t) => {
    const url = ctx.thumbs.thumbAt(t);
    return el("div", { class: "tip-thumb", style: url ? { backgroundImage: `url(${url})` } : {} });
  }));
}

function spread(a, b, n) {
  return Array.from({ length: n }, (_, k) => a + ((k + 0.5) * (b - a)) / n);
}

// Stagger labels into rows so they do not overlap.
function assignRows(items, minGap, rows = 2) {
  const lastX = Array(rows).fill(-1e9);
  return items.map((it) => {
    let r = lastX.findIndex((x) => it.x - x >= minGap);
    if (r < 0) r = lastX.indexOf(Math.min(...lastX));
    lastX[r] = it.x + (it.w || 0);
    return r;
  });
}

// ===================================================================
// Timeline view
// ===================================================================
export function renderTimeline(ctx, v, lay, player) {
  const { project, mode, pps } = ctx;
  const tr = project.transcript;
  const srcDur = project.duration;
  const isSource = mode === "source";
  const total = isSource ? srcDur : lay.duration;
  const W = Math.max(40, Math.round(total * pps));
  const X = (t) => t * pps;

  const above = el("div", { class: "tl-above" });
  const bar = el("div", { class: "tl-bar" });
  const strip = el("div", { class: "tl-strip" });
  const hl = el("div", { class: "tl-hl" });
  const playhead = el("div", { class: "tl-playhead" });
  const root = el("div", { class: `tl tl-stage-${v.stage}`, style: { width: W + "px" } }, above, bar, strip, hl, playhead);

  const showHL = (a, b, color) => {
    hl.style.display = "block";
    hl.style.left = X(a) + "px";
    hl.style.width = Math.max(4, X(b) - X(a)) + "px";
    hl.style.borderColor = color || "#4a90d9";
  };
  const hideHL = () => (hl.style.display = "none");

  // ---- section bar ----
  if (!isSource) {
    for (const r of lay.runs) {
      const sec = project.sections[r.section];
      bar.append(el("div", { class: "tl-seg", "data-sec": r.section, style: { left: X(r.editStart) + "px", width: Math.max(1, X(r.editEnd) - X(r.editStart)) + "px", background: sec.color } }));
    }
  } else {
    for (const sec of project.sections) {
      const a = tr[sec.start].start;
      const b = tr[sec.end].end;
      bar.append(el("div", { class: "tl-seg excluded", "data-sec": sec.id, style: { left: X(a) + "px", width: Math.max(1, X(b) - X(a)) + "px", background: hexToRgba(sec.color, 0.3) } }));
    }
    for (const c of lay.clips) {
      for (const i of c.segs) {
        const s = tr[i];
        const sec = project.sections[sectionIndexOf(project, i)];
        bar.append(el("div", { class: "tl-seg", style: { left: X(s.start) + "px", width: Math.max(1, X(s.end) - X(s.start)) + "px", background: sec.color } }));
      }
    }
  }

  // ---- thumbnail strip ----
  const nTiles = Math.max(1, Math.ceil(W / TILE_W));
  for (let k = 0; k < nTiles; k++) {
    const t0 = (k * TILE_W) / pps;
    const tm = Math.min(total - 0.01, t0 + TILE_W / pps / 2);
    let src = tm;
    let dim = false;
    if (!isSource) src = editToSource(lay.clips, tm).src;
    else dim = !lay.clips.some((c) => tm >= c.srcStart && tm <= c.srcEnd);
    const url = ctx.thumbs.thumbAt(src);
    strip.append(el("div", { class: "tl-tile" + (dim ? " dim" : ""), "data-t": src.toFixed(2), style: { left: k * TILE_W + "px", width: Math.min(TILE_W, W - k * TILE_W) + "px", backgroundImage: url ? `url(${url})` : "" } }));
  }

  // ---- hover / click on bar and strip ----
  const timeAt = (e) => {
    const r = root.getBoundingClientRect();
    return Math.max(0, Math.min(total, (e.clientX - r.left) / pps));
  };
  const hoverInfo = (t) => {
    if (!isSource) {
      const run = lay.runs.find((r) => t >= r.editStart && t < r.editEnd) || lay.runs[lay.runs.length - 1];
      if (!run) return null;
      const sec = project.sections[run.section];
      const srcA = editToSource(lay.clips, run.editStart).src;
      const srcB = editToSource(lay.clips, run.editEnd - 0.05).src;
      return {
        a: run.editStart, b: run.editEnd, color: sec.color, run,
        tip: el("div", {}, el("div", { class: "tip-title" }, sec.title), el("div", { class: "tip-sub" }, `${fmtTime(run.editStart)} – ${fmtTime(run.editEnd)} in edit · source ${fmtTime(srcA)} – ${fmtTime(srcB)}`), thumbsRow(ctx, spread(run.editStart, run.editEnd, 4).map((x) => editToSource(lay.clips, x).src)), el("div", { class: "tip-hint" }, "Click to play from here")),
      };
    }
    const k = sectionIndexOf(project, segAtTime(tr, t));
    const sec = project.sections[k];
    const included = lay.clips.find((c) => t >= c.srcStart && t <= c.srcEnd);
    if (included) {
      return { a: included.srcStart, b: included.srcEnd, color: sec.color, tip: el("div", {}, el("div", { class: "tip-title" }, sec.title), el("div", { class: "tip-sub" }, `Included · source ${fmtTime(included.srcStart)} – ${fmtTime(included.srcEnd)}`), thumbsRow(ctx, spread(included.srcStart, included.srcEnd, 4)), el("div", { class: "tip-hint" }, "Click to play from here")) };
    }
    // Excluded gap inside this section.
    const secA = tr[sec.start].start;
    const secB = tr[sec.end].end;
    let a = secA;
    let b = secB;
    for (const c of lay.clips) {
      if (c.srcEnd <= t && c.srcEnd > a) a = c.srcEnd;
      if (c.srcStart >= t && c.srcStart < b) b = c.srcStart;
    }
    const kw = [];
    for (let i = sec.start; i <= sec.end; i++) if (tr[i].start < b && tr[i].end > a && !lay.segSet.has(i)) for (const w of project.keywords[i] || []) if (!kw.includes(w)) kw.push(w);
    return {
      a, b, color: "#999",
      tip: el("div", {}, el("div", { class: "tip-title" }, `${sec.title} — not included`), el("div", { class: "tip-sub" }, `source ${fmtTime(a)} – ${fmtTime(b)}`), thumbsRow(ctx, spread(a, b, 4)), kw.length ? el("div", { class: "tip-kw" }, "Topics: ", kw.slice(0, 8).map((w) => el("b", {}, w))) : null),
    };
  };
  for (const target of [bar, strip]) {
    target.addEventListener("mousemove", (e) => {
      const info = hoverInfo(timeAt(e));
      if (!info) return;
      showHL(info.a, info.b, info.color);
      showTip(e, info.tip);
      root.querySelectorAll(".tl-label").forEach((l) => l.classList.toggle("bold", info.run && +l.dataset.run === lay.runs.indexOf(info.run)));
    });
    target.addEventListener("mouseleave", () => {
      hideHL();
      hideTip();
      root.querySelectorAll(".tl-label.bold").forEach((l) => l.classList.remove("bold"));
    });
    target.addEventListener("click", (e) => {
      const t = timeAt(e);
      player.playFrom(isSource ? sourceToEdit(lay.clips, t).edit : t);
    });
  }

  // ---- stage-specific layer above the bar ----
  if (v.stage === "roughcut") {
    const labels = isSource
      ? project.sections.map((sec) => ({ x: X(tr[sec.start].start), w: 0, text: sec.title, sub: `${fmtTime(tr[sec.start].start)} - ${fmtTime(tr[sec.end].end)}`, color: sec.color, inc: lay.runs.some((r) => r.section === sec.id), seek: () => player.playFrom(sourceToEdit(lay.clips, tr[sec.start].start).edit) }))
      : lay.runs.map((r, k) => ({ x: X(r.editStart), w: 0, text: project.sections[r.section].title, color: project.sections[r.section].color, inc: true, run: k, seek: () => player.playFrom(r.editStart) }));
    labels.forEach((l) => (l.w = Math.max(l.text.length * 7.5, l.sub ? 70 : 0) + 6));
    const rows = assignRows(labels, 8, 3);
    const rowH = isSource ? 28 : 17;
    above.style.height = 6 + (Math.max(0, ...rows) + 1) * rowH + "px";
    labels.forEach((l, k) => {
      const top = 4 + rows[k] * rowH;
      const left = Math.max(0, Math.min(l.x, W - l.w));
      const lab = el("div", { class: "tl-label" + (l.inc ? "" : " faded"), "data-run": l.run, style: { left: left + "px", top: top + "px" }, onclick: l.seek, title: "Play from here" }, l.text, l.sub ? el("span", { class: "tl-label-sub" }, l.sub) : null);
      const stem = el("div", { class: "tl-stem", style: { left: l.x + "px", top: top + rowH - 2 + "px", bottom: "0" } });
      above.append(stem, lab);
    });
  } else if (v.stage === "broll") {
    const items = lay.brolls.map((b) => ({ b, x: X(isSource ? b.srcStart : b.editStart), w: 70 }));
    const rows = assignRows(items, 4, 2);
    above.style.height = (Math.max(0, ...rows) + 1) * 52 + 2 + "px";
    items.forEach(({ b, x }, k) => {
      const a = isSource ? b.srcStart : b.editStart;
      const z = isSource ? b.srcEnd : b.editEnd;
      const node = el(
        "div",
        {
          class: "tl-broll", style: { left: Math.max(0, Math.min(x, W - 66)) + "px", top: rows[k] * 50 + "px", zIndex: 10 - rows[k] },
          onmouseenter: (e) => {
            showHL(a, z, "#f0a020");
            showTip(e, el("div", {}, el("div", { class: "tip-title" }, `B-roll: ${b.keyword}`), el("div", { class: "tip-sub" }, `${b.mediaItem ? b.mediaItem.type : "no match"} · covers ${fmtTime(b.editStart)} – ${fmtTime(b.editEnd)}`), el("div", { class: "tip-quote" }, `“${tr[b.seg].text}”`), thumbsRow(ctx, spread(b.srcStart, b.srcEnd, 3))));
          },
          onmousemove: moveTip,
          onmouseleave: () => (hideHL(), hideTip()),
          onclick: () => player.playFrom(b.editStart + 0.05),
        },
        el("div", { class: "tl-broll-kw" }, b.keyword),
        el("div", { class: "tl-broll-img" }, brollMedia(b))
      );
      above.append(node);
    });
  } else {
    // text stage: keywords with quote marks; B-rolls inherited from the base version shown as small insets.
    const items = lay.texts.map((t) => ({ t, x: X(isSource ? t.srcStart : t.editStart), w: 24 + t.text.length * 8.5 }));
    const rows = assignRows(items, 8, 4);
    above.style.height = 8 + (Math.max(0, ...rows) + 1) * 22 + "px";
    items.forEach(({ t, x }, k) => {
      const node = el(
        "div",
        {
          class: "tl-text", style: { left: Math.max(0, Math.min(x, W - 150)) + "px", top: 4 + rows[k] * 22 + "px" },
          onmouseenter: (e) => {
            showHL(isSource ? t.srcStart : t.editStart, isSource ? t.srcEnd : t.editEnd, "#d4a000");
            showTip(e, el("div", { class: "tip-narration" }, el("div", { class: "tip-sub" }, `${styleLabel(t.style)} · ${fmtTime(t.editStart)}`), highlightPhrase(tr[t.seg].text, t.text)));
          },
          onmousemove: moveTip,
          onmouseleave: () => (hideHL(), hideTip()),
          onclick: () => player.playFrom(t.editStart),
        },
        icon("quote", 14),
        t.text
      );
      above.append(node);
    });
    for (const b of lay.brolls) {
      strip.append(el("div", { class: "tl-inset", title: `B-roll: ${b.keyword}`, style: { left: X(isSource ? b.srcStart : b.editStart) + "px", width: Math.max(18, X(b.editEnd) - X(b.editStart)) + "px" } }, brollMedia(b)));
    }
  }

  // ---- playhead ----
  const movePlayhead = (et) => {
    const t = isSource ? editToSource(lay.clips, et).src : et;
    playhead.style.left = X(t) + "px";
    playhead.style.display = et > 0 || player.playing ? "block" : "none";
  };
  ctx.onPlayhead(v.id, movePlayhead);
  movePlayhead(player.editTime);
  return root;
}

function segAtTime(tr, t) {
  for (const s of tr) if (t < s.end) return s.i;
  return tr.length - 1;
}

function highlightPhrase(text, phrase) {
  const node = el("div", { class: "tip-quote" });
  const m = phrase ? text.match(new RegExp(escapeRegExp(phrase), "i")) : null;
  if (!m) {
    node.append(`“${text}”`);
    return node;
  }
  node.append("“" + text.slice(0, m.index), el("b", {}, m[0]), text.slice(m.index + m[0].length) + "”");
  return node;
}

// Mini timeline used in the transcript view (Figure 5).
export function renderMiniTimeline(ctx, v, lay, player) {
  const { project } = ctx;
  const bar = el("div", { class: "mini-tl" });
  const total = Math.max(1, lay.duration);
  for (const r of lay.runs) {
    const sec = project.sections[r.section];
    bar.append(el("div", { class: "mini-seg", title: sec.title, style: { left: (100 * r.editStart) / total + "%", width: (100 * (r.editEnd - r.editStart)) / total + "%", background: sec.color }, onclick: () => player.playFrom(r.editStart) }));
  }
  const ph = el("div", { class: "mini-ph" });
  bar.append(ph);
  ctx.onPlayhead(v.id + ":mini", (et) => (ph.style.left = (100 * et) / total + "%"));
  return bar;
}

// ===================================================================
// Transcript view
// ===================================================================
function wrapTerms(text, terms) {
  // Returns DOM nodes where any of `terms` is wrapped in <b>.
  const list = (terms || []).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!list.length) return [text];
  const re = new RegExp("(" + list.map(escapeRegExp).join("|") + ")", "gi");
  const out = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(el("b", { class: "vk" }, m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderTranscript(ctx, v, lay, player) {
  const { project, mode, collapsed } = ctx;
  const tr = project.transcript;
  const isSource = mode === "source";
  const brollBySeg = new Map(lay.brolls.map((b) => [b.seg, b]));
  const textBySeg = new Map(lay.texts.map((t) => [t.seg, t]));

  // Cards: in edited mode one per run of a section (edited order); in source mode one per section.
  const cards = isSource
    ? project.sections.map((sec) => ({ sec, segs: range(sec.start, sec.end) }))
    : lay.runs.map((r) => ({ sec: project.sections[r.section], segs: r.segs, run: r }));

  const body = el("div", { class: "tx-body" });
  cards.forEach((card, ci) => {
    const key = `${isSource ? "s" : "e"}${card.sec.id}:${ci}`;
    const isCollapsed = collapsed.has(key);
    const firstInc = card.segs.find((i) => lay.segSet.has(i));
    const head = el(
      "div",
      { class: "tx-head" },
      el("span", { class: "tx-dot", style: { background: card.sec.color } }),
      el("span", { class: "tx-title", title: "Play from this section", onclick: () => firstInc != null && player.playFrom(lay.segEdit.get(firstInc)) }, card.sec.title),
      isSource ? el("span", { class: "tx-range" }, `${fmtTime(tr[card.sec.start].start)} – ${fmtTime(tr[card.sec.end].end)}`) : null,
      el("button", { class: "tx-caret" + (isCollapsed ? " closed" : ""), title: "Collapse", onclick: () => { isCollapsed ? collapsed.delete(key) : collapsed.add(key); ctx.rerender(); } }, icon("caret", 18))
    );
    const text = el("div", { class: "tx-text" });
    if (!isCollapsed) {
      for (const i of card.segs) {
        const s = tr[i];
        const inc = lay.segSet.has(i);
        const span = el("span", { class: "tx-seg", "data-seg": i });
        if (v.stage === "roughcut") {
          if (inc) {
            span.classList.add("inc");
            span.style.background = hexToRgba(card.sec.color, 0.35);
          } else span.classList.add("exc");
          span.append(...wrapTerms(s.text, project.keywords[i]));
        } else {
          if (!inc) span.classList.add("exc");
          const b = brollBySeg.get(i);
          const t = textBySeg.get(i);
          if (b) {
            span.classList.add("fxhl");
            span.append(...wrapTerms(s.text, []));
            span.addEventListener("mouseenter", (e) => showTip(e, el("div", { class: "tip-broll" }, el("div", { class: "tip-title" }, `B-roll: ${b.keyword}`), brollMedia(b, true))));
            span.addEventListener("mousemove", moveTip);
            span.addEventListener("mouseleave", hideTip);
          } else if (t) {
            span.classList.add("fxhl");
            span.append(...wrapTerms(s.text, [t.text]));
            span.addEventListener("mouseenter", (e) => showTip(e, el("div", { class: `tip-fx fx-${t.style}` }, el("span", {}, t.text))));
            span.addEventListener("mousemove", moveTip);
            span.addEventListener("mouseleave", hideTip);
          } else span.append(s.text);
          if (v.stage === "text" && b && t) span.replaceChildren(...wrapTerms(s.text, [t.text]));
        }
        if (inc) span.addEventListener("click", () => player.playFrom(lay.segEdit.get(i)));
        text.append(span, " ");
      }
    }
    body.append(el("div", { class: "tx-card", style: { borderLeftColor: card.sec.color } }, head, text));
  });

  // B-roll "Content" strip (Figure 5, middle).
  let content = null;
  if (v.stage !== "roughcut" && lay.brolls.length) {
    content = el("div", { class: "tx-content" }, el("span", { class: "tx-content-label" }, "Content"), lay.brolls.map((b) =>
      el("div", {
        class: "tx-content-item", title: b.keyword,
        onclick: () => {
          player.playFrom(b.editStart + 0.05);
          const s = body.querySelector(`[data-seg="${b.seg}"]`);
          if (s) {
            s.scrollIntoView({ block: "center", behavior: "smooth" });
            s.classList.add("flash");
            setTimeout(() => s.classList.remove("flash"), 1200);
          }
        },
      }, brollMedia(b))
    ));
  }
  return { body, content };
}

function range(a, b) {
  return Array.from({ length: b - a + 1 }, (_, k) => a + k);
}
