"""Fortune recognition (paper Section 5.2.1).

The paper's recognition model reads up to three previous sentences, the
protagonist's name and a target sentence, and predicts the protagonist's
fortune as a number between 0 and 1. It is GPT-Neo 2.7B with soft prompts
trained on crowdsourced fortune labels.

Here the same input goes to the bridge LLM as a prompt, anchored by the
paper's three calibration sentences. Several sentences are rated in one call,
because each call through the bridge takes about five seconds. Answers are
cached by (protagonist, previous context, sentence), so unchanged sentences are
never rated twice.
"""

import json
import threading

from . import prompts

CONTEXT_SENTENCES = 3      # the paper found three previous sentences worked best
MAX_ITEMS_PER_CALL = 16


class Recognizer:
    def __init__(self, llm):
        self.llm = llm
        self._cache = {}
        self._lock = threading.Lock()

    @staticmethod
    def cache_key(protagonist, context, sentence):
        return json.dumps([protagonist.strip(), list(context), sentence.strip()])

    def recognize(self, protagonist, items):
        """Rate a list of items, each {"context": [previous sentences], "sentence": str}.

        Returns one fortune (float in [0, 1]) per item, or None where the model
        gave no usable number.
        """
        results = [None] * len(items)
        todo = []
        for i, item in enumerate(items):
            sentence = " ".join(str(item.get("sentence") or "").split())
            if not sentence:
                continue
            context = [" ".join(str(c).split()) for c in (item.get("context") or [])]
            context = [c for c in context if c][-CONTEXT_SENTENCES:]
            key = self.cache_key(protagonist, context, sentence)
            with self._lock:
                cached = self._cache.get(key)
            if cached is not None:
                results[i] = cached
            else:
                todo.append((i, key, context, sentence))
        for start in range(0, len(todo), MAX_ITEMS_PER_CALL):
            chunk = todo[start:start + MAX_ITEMS_PER_CALL]
            values = self._call(protagonist, [(context, sentence) for _, _, context, sentence in chunk])
            for (i, key, _, _), value in zip(chunk, values):
                results[i] = value
                if value is not None:
                    with self._lock:
                        self._cache[key] = value
        return results

    def _call(self, protagonist, items):
        system = prompts.recognition_system()
        user = prompts.recognition_user(protagonist, items)
        values = []
        for _ in range(2):  # ask again once if the model returns the wrong number of values
            values = ratings_of(self.llm.chat_json(system, user))
            if len(values) == len(items):
                break
        return [normalize(values[k]) if k < len(values) else None for k in range(len(items))]


def ratings_of(data):
    """The list of ratings in a model answer: {"ratings": [{"item", "reason", "fortune"}]} or {"fortunes": [...]}."""
    values = data
    if isinstance(data, dict):
        values = data.get("ratings", data.get("fortunes"))
    if not isinstance(values, list):
        return []
    if all(isinstance(v, dict) and isinstance(v.get("item"), int) for v in values):
        values = sorted(values, key=lambda v: v["item"])
    return values


def normalize(value):
    """Turn a model answer into a fortune in [0, 1]; accept 0-10 or 0-100 scales too."""
    if isinstance(value, dict):
        value = value.get("fortune")
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    if x != x:  # NaN
        return None
    if 1 < x <= 10:
        x /= 10
    elif 10 < x <= 100:
        x /= 100
    return round(min(1.0, max(0.0, x)), 3)
