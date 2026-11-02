// Generate by sketching (Section 4.2.2).
//
// Which sentence slots are (re)written:
// * After a pen stroke: the slots the stroke covers, plus any blank slot inside the sketched
//   range (so a broken line still gives a complete story).
// * "Generate Again": every slot inside the sketched range, with the same sketch.
// In both cases, sentences the writer typed or edited are kept as context, never replaced.
// Slots inside the sketched range where the line is erased get sentences without a fortune target.

import * as api from "./api.js";
import { DEFAULT_SURPRISE } from "./config.js";
import { saveGenerated, saveUnsaved } from "./history.js";
import { recognitionKey } from "./keys.js";
import { rememberFortune, scheduleRecognition } from "./recognizer.js";
import * as Sk from "./sketch.js";
import { changed, setStatus, state } from "./store.js";

let controller = null;

/** A slot TaleBrush may write: blank, or holding an untouched generated sentence. */
export function isFillable(i) {
  const s = state.sentences[i];
  return !!s && (!s.text.trim() || s.source === "generated");
}

export function sketchExtent() {
  return Sk.extentOf(Sk.fortuneSlots(state.sketch.fortune, state.sentences.length));
}

export function strokeTargets(strokeSlots) {
  const targets = new Set(strokeSlots.filter(isFillable));
  const extent = sketchExtent();
  if (extent) {
    for (let i = extent[0]; i <= extent[1]; i++) if (!state.sentences[i].text.trim()) targets.add(i);
  }
  return [...targets].sort((a, b) => a - b);
}

export function againTargets() {
  const extent = sketchExtent();
  if (!extent) return [];
  const out = [];
  for (let i = extent[0]; i <= extent[1]; i++) if (isFillable(i)) out.push(i);
  return out;
}

export function stopGeneration() {
  controller?.abort();
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function runGeneration(targets) {
  if (state.ui.generating || !targets.length) return;
  const n = state.sentences.length;
  const fortune = Sk.fortuneSlots(state.sketch.fortune, n);
  const surprise = Sk.surpriseSlots(state.sketch.surprise, n);
  const targetSet = new Set(targets);

  saveUnsaved(); // keep the writer's unsaved edits in the history before anything changes

  const slots = state.sentences.map((s, i) => {
    if (!targetSet.has(i)) return { text: s.text, target: null };
    const f = fortune[i];
    const sur = state.surpriseEnabled && surprise[i] !== null ? surprise[i] : DEFAULT_SURPRISE;
    return {
      text: "",
      previous: s.text.trim() || null,
      target: f.sketched
        ? { fortune: f.fortune, tolerance: f.halfWidth, maxRegen: f.maxRegen, surprise: sur }
        : { fortune: null, tolerance: null, maxRegen: 0, surprise: sur },
    };
  });

  const backup = new Map(targets.map((i) => [i, { ...state.sentences[i] }]));
  const finals = new Set();
  let summary = null;
  let failure = null;
  let stopped = false;

  state.ui.generating = true;
  state.ui.targets = targets.slice();
  state.ui.historyOpen = false;
  state.ui.previewId = null;
  setStatus(`Writing ${targets.length} sentence${targets.length === 1 ? "" : "s"}...`, "busy");

  const onEvent = (ev) => {
    const s = state.sentences[ev.slot];
    switch (ev.type) {
      case "status":
        setStatus(ev.message, "busy");
        break;
      case "draft":
        if (s && !finals.has(ev.slot)) {
          Object.assign(s, { text: ev.text, source: "generated", draft: true, fortune: num(ev.fortune), fortuneKey: null });
        }
        break;
      case "sentence":
        if (s) {
          Object.assign(s, { text: ev.text, source: "generated", draft: false, fortune: num(ev.fortune) });
          s.gen = {
            target: num(ev.target),
            tolerance: num(ev.tolerance),
            surprise: num(ev.surprise),
            maxRegen: ev.maxRegen,
            task: ev.task,
            tries: Array.isArray(ev.attempts) ? ev.attempts.length : 1,
          };
          finals.add(ev.slot);
        }
        break;
      case "error":
        failure = ev.message;
        break;
      case "done":
        summary = ev;
        break;
      default:
        break;
    }
    changed({ persist: false });
  };

  controller = new AbortController();
  try {
    await api.generate(
      {
        protagonist: state.protagonist.trim(),
        mode: state.settings.pipeline,
        threshold: state.settings.threshold,
        slots,
      },
      onEvent,
      controller.signal,
    );
  } catch (e) {
    if (e.name === "AbortError") stopped = true;
    else failure = e.message;
  } finally {
    controller = null;
  }

  // Put back every slot that did not get a finished sentence.
  for (const i of targets) {
    if (finals.has(i)) continue;
    const b = backup.get(i);
    Object.assign(state.sentences[i], {
      text: b.text,
      source: b.source,
      fortune: b.fortune,
      fortuneKey: b.fortuneKey,
      gen: b.gen,
      draft: false,
    });
  }
  // The pipeline already rated the new sentences; keep those ratings.
  for (const i of finals) {
    const s = state.sentences[i];
    if (s.fortune !== null) {
      s.fortuneKey = recognitionKey(state.protagonist, state.sentences, i);
      rememberFortune(s.fortuneKey, s.fortune);
    }
  }
  state.ui.generating = false;
  state.ui.targets = [];
  if (finals.size) saveGenerated();

  if (stopped) {
    setStatus(
      finals.size
        ? `Stopped. Kept ${finals.size} finished sentence${finals.size === 1 ? "" : "s"}; the rest were put back.`
        : "Stopped. The story is unchanged.",
      "info",
    );
  } else if (failure) {
    setStatus(`Generation failed: ${failure}`, "error");
  } else if (summary) {
    const parts = [`Wrote ${summary.written} sentence${summary.written === 1 ? "" : "s"} in ${Math.round(summary.seconds)} s`];
    if (summary.retried) {
      parts.push(
        `${summary.retried} rewritten because the first try missed the sketch by more than ${state.settings.threshold.toFixed(2)}`,
      );
    }
    if (summary.missing) parts.push(`${summary.missing} could not be written`);
    setStatus(`${parts.join(" · ")}.`, "done");
  } else {
    setStatus("Generation ended without a result.", "error");
  }
  changed();
  scheduleRecognition(200); // sentences after the new ones have a new context
}
