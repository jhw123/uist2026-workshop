// TaleBrush front end: wires the editor, the canvases, the history and the controls together.

import * as api from "./api.js";
import { SketchCanvas } from "./canvas.js";
import { Editor } from "./editor.js";
import { EXAMPLES } from "./examples.js";
import { againTargets, runGeneration, sketchExtent, stopGeneration, strokeTargets } from "./generator.js";
import { HistoryMenu, saveUnsaved } from "./history.js";
import { scheduleRecognition } from "./recognizer.js";
import * as Sk from "./sketch.js";
import { changed, newStory, renderNow, restore, setStatus, state, subscribe } from "./store.js";

const $ = (id) => document.getElementById(id);

restore();

// ---------------------------------------------------------------- what a stroke or an erasure does

function onStroke(kind, slots) {
  if (kind === "surprise") {
    setStatus("Surprise sketch updated. Press Generate Again to use it.", "info");
    return;
  }
  if (!slots.length) return;
  const targets = strokeTargets(slots);
  if (!targets.length) {
    setStatus(
      "You wrote or edited every sentence under this stroke, so TaleBrush kept them. " +
        "Clear a sentence (leave its bullet empty) to let TaleBrush rewrite it.",
      "info",
    );
    return;
  }
  runGeneration(targets);
}

function onErase(kind, erased) {
  if (!erased) return;
  setStatus(
    kind === "fortune"
      ? "Sketch erased. Press Generate Again to rewrite the sketched part; where the line is erased, sentences are written without a fortune target."
      : "Surprise line erased. Those sentences use the default surprise.",
    "info",
  );
}

// ---------------------------------------------------------------- components

const editor = new Editor($("editor"), $("preview"));
const fortuneCanvas = new SketchCanvas({ svg: $("fortuneCanvas"), wrap: $("fortuneWrap"), kind: "fortune", onStroke, onErase });
const surpriseCanvas = new SketchCanvas({ svg: $("surpriseCanvas"), wrap: $("surpriseWrap"), kind: "surprise", onStroke, onErase });
const historyMenu = new HistoryMenu($("historyBtn"), $("historyMenu"));

// ---------------------------------------------------------------- controls

$("title").addEventListener("input", (e) => {
  state.title = e.target.value;
  changed();
});

$("protagonist").addEventListener("input", (e) => {
  state.protagonist = e.target.value;
  changed();
  scheduleRecognition(1300); // every fortune depends on who the protagonist is
});

$("surpriseToggle").addEventListener("change", (e) => {
  state.surpriseEnabled = e.target.checked;
  changed();
});

for (const button of document.querySelectorAll(".tool")) {
  button.addEventListener("click", () => {
    state.tool = button.dataset.tool;
    changed();
  });
}

document.addEventListener("keydown", (e) => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "b" || e.key === "p") state.tool = "pen";
  else if (e.key === "e") state.tool = "eraser";
  else return;
  changed();
});

$("generateAgain").addEventListener("click", () => {
  if (state.ui.generating) return;
  const targets = againTargets();
  if (!targets.length) {
    setStatus(
      sketchExtent()
        ? "Every sentence under the sketch was written or edited by you, so there is nothing to regenerate. Clear a sentence to let TaleBrush rewrite it."
        : "Sketch the protagonist's fortune on the canvas first.",
      "info",
    );
    return;
  }
  runGeneration(targets);
});

$("stopBtn").addEventListener("click", () => stopGeneration());

// New story and examples keep the current story in the history first.
function startStory(options) {
  if (state.ui.generating) return;
  saveUnsaved();
  newStory(options);
  setStatus("");
  changed();
  renderNow();
  scheduleRecognition(100);
}

$("newStory").addEventListener("click", () => startStory({}));

const examplesMenu = $("examplesMenu");
examplesMenu.innerHTML = Object.entries(EXAMPLES)
  .map(([key, ex]) => `<button class="menu-item" data-example="${key}">${ex.label}</button>`)
  .join("");
examplesMenu.addEventListener("click", (e) => {
  const key = e.target.closest("[data-example]")?.dataset.example;
  if (!key) return;
  examplesMenu.hidden = true;
  startStory(EXAMPLES[key]);
});

const settingsMenu = $("settingsMenu");
function toggleMenu(menu, others) {
  const show = menu.hidden;
  others.forEach((m) => (m.hidden = true));
  menu.hidden = !show;
}
$("examplesBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMenu(examplesMenu, [settingsMenu]);
});
$("settingsBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMenu(settingsMenu, [examplesMenu]);
});
document.addEventListener("pointerdown", (e) => {
  for (const [menu, button] of [
    [examplesMenu, $("examplesBtn")],
    [settingsMenu, $("settingsBtn")],
  ]) {
    if (!menu.hidden && !menu.contains(e.target) && !button.contains(e.target)) menu.hidden = true;
  }
});

for (const radio of document.querySelectorAll('input[name="pipeline"]')) {
  radio.addEventListener("change", () => {
    state.settings.pipeline = radio.value;
    changed();
  });
}
$("threshold").addEventListener("change", (e) => {
  const v = parseFloat(e.target.value);
  if (Number.isFinite(v) && v > 0 && v <= 1) state.settings.threshold = Math.round(v * 100) / 100;
  changed();
});

// ---------------------------------------------------------------- page chrome

function setValue(input, value) {
  if (document.activeElement !== input && input.value !== value) input.value = value;
}

function renderChrome() {
  const busy = state.ui.generating;
  setValue($("title"), state.title);
  setValue($("protagonist"), state.protagonist);
  $("title").disabled = busy;
  $("protagonist").disabled = busy;
  $("surpriseToggle").checked = state.surpriseEnabled;
  $("surpriseToggle").disabled = busy;
  $("surpriseWrap").hidden = !state.surpriseEnabled;
  for (const button of document.querySelectorAll(".tool")) {
    const active = button.dataset.tool === state.tool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  const again = $("generateAgain");
  again.disabled = busy || !Sk.hasSamples(state.sketch.fortune);
  again.classList.toggle("busy", busy);
  $("newStory").disabled = busy;
  $("examplesBtn").disabled = busy;

  for (const radio of document.querySelectorAll('input[name="pipeline"]')) radio.checked = radio.value === state.settings.pipeline;
  setValue($("threshold"), state.settings.threshold.toFixed(2));

  const status = $("status");
  const bridge = state.ui.bridge;
  let message = state.ui.status;
  let kind = state.ui.statusKind;
  if (bridge && !bridge.ok && !busy) {
    message = `${bridge.error || "The LLM bridge is not reachable."}`;
    kind = "error";
  }
  status.className = `status ${kind || ""}`;
  $("statusText").textContent = message || "";
  $("stopBtn").hidden = !busy;

  const badge = $("bridgeStatus");
  if (!bridge) {
    badge.className = "bridge-status";
    badge.textContent = "Checking the LLM bridge...";
  } else if (bridge.ok) {
    badge.className = "bridge-status ok";
    badge.textContent = `Model: ${bridge.backend || "?"} · ${bridge.model || "default"} via LLM bridge`;
    badge.title = `LLM bridge at ${bridge.url}`;
  } else {
    badge.className = "bridge-status down";
    badge.textContent = "LLM bridge offline";
    badge.title = bridge.error || "";
  }
}

subscribe(() => {
  editor.render();
  fortuneCanvas.render();
  surpriseCanvas.render();
  historyMenu.render();
  renderChrome();
});

// ---------------------------------------------------------------- bridge status

async function pollBridge() {
  const before = state.ui.bridge?.ok;
  try {
    const health = await api.getHealth();
    state.ui.bridge = health.bridge;
  } catch {
    state.ui.bridge = { ok: false, error: "The TaleBrush server is not reachable. Start it with: python3 server.py" };
  }
  if (state.ui.bridge.ok && before === false) scheduleRecognition(100); // the bridge came back
  changed({ persist: false });
  setTimeout(pollBridge, state.ui.bridge.ok ? 30000 : 6000);
}

// For developers: inspect the state from the browser console as `talebrush.state`.
window.talebrush = { state };

renderNow();
pollBridge();
scheduleRecognition(400);
