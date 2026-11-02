// Fortune recognition for the writer's own sentences (Section 4.2.1: every bullet is a dot
// whose height comes from the recognition module). Sentences are rated in one batch a moment
// after the writer stops typing; answers are cached by recognitionKey.

import { RECOGNITION_DELAY_MS } from "./config.js";
import { contextFor, recognitionKey } from "./keys.js";
import { changed, setStatus, state } from "./store.js";
import * as api from "./api.js";

const cache = new Map();
let timer = 0;
let running = false;
let again = false;

export function rememberFortune(key, fortune) {
  if (typeof fortune === "number") cache.set(key, fortune);
}

export function scheduleRecognition(delay = RECOGNITION_DELAY_MS) {
  clearTimeout(timer);
  timer = setTimeout(runRecognition, delay);
}

async function runRecognition() {
  if (state.ui.generating) return; // generation rates its own sentences, then schedules this again
  if (running) {
    again = true;
    return;
  }
  const items = [];
  state.sentences.forEach((s, i) => {
    const text = s.text.trim();
    if (!text) {
      s.pending = false;
      return;
    }
    const key = recognitionKey(state.protagonist, state.sentences, i);
    if (s.fortuneKey === key) return;
    if (cache.has(key)) {
      s.fortune = cache.get(key);
      s.fortuneKey = key;
      s.pending = false;
      return;
    }
    items.push({ id: s.id, key, context: contextFor(state.sentences, i), sentence: text });
  });
  if (!items.length) {
    changed();
    return;
  }
  const byId = (id) => state.sentences.find((s) => s.id === id);
  items.forEach((it) => (byId(it.id).pending = true));
  running = true;
  state.ui.recognizing = true;
  changed({ persist: false });
  try {
    const fortunes = await api.recognize(
      state.protagonist.trim(),
      items.map(({ context, sentence }) => ({ context, sentence })),
    );
    items.forEach((it, k) => {
      const f = fortunes[k];
      rememberFortune(it.key, f);
      const s = byId(it.id);
      if (!s) return;
      s.pending = false;
      const index = state.sentences.indexOf(s);
      // Apply only if the sentence and its context did not change while we waited.
      if (typeof f === "number" && recognitionKey(state.protagonist, state.sentences, index) === it.key) {
        s.fortune = f;
        s.fortuneKey = it.key;
      }
    });
    if (state.ui.statusKind === "error" && state.ui.status.startsWith("Fortune recognition")) setStatus("");
  } catch (e) {
    items.forEach((it) => {
      const s = byId(it.id);
      if (s) s.pending = false;
    });
    setStatus(`Fortune recognition failed: ${e.message}`, "error");
  } finally {
    running = false;
    state.ui.recognizing = false;
    changed();
    if (again) {
      again = false;
      scheduleRecognition(0);
    }
  }
}
