"""Fortune-controlled story generation (paper Section 5.2.2).

In the paper, each sketched sentence slot gets a continuous fortune code
between 0 and 1 (the y position of the sketch). A modified GeDi model steers
GPT-Neo toward that code, and the surprise sketch sets the sampling
temperature. The recognition module then rates each new sentence; if the
rating differs from the code by more than 0.2, the sentence is generated
again, one or two more times depending on how slowly the writer drew. The
candidate with the smallest error is kept.

This build keeps that loop but replaces the models with the bridge LLM, which
gets the fortune code and the surprise level as numbers and words. Two
pipelines are offered:

* "batch" (default): every blank slot is written in one call and rated in one
  call; the slots that miss their target are rewritten together. About 10 to
  30 seconds for a whole story.
* "sequential": one sentence at a time, as in the paper. Continuation goes
  left to right; infilling alternates "infill from previous" and "infill from
  next" (Figure 9). Each sentence waits for its own calls, so a six-sentence
  story takes one to three minutes.
"""

import re
import time
from dataclasses import dataclass
from typing import Optional

from . import prompts
from .recognition import CONTEXT_SENTENCES

DEFAULT_THRESHOLD = 0.2   # regenerate when |target - recognized fortune| > 0.2 (paper)
DEFAULT_SURPRISE = 0.5
MAX_REGEN = 2             # the paper regenerates at most twice


class GenerationCancelled(Exception):
    """The browser closed the connection (the writer pressed Stop)."""


@dataclass
class Target:
    fortune: Optional[float]        # None: no target, because the sketch is erased over this slot
    tolerance: Optional[float]      # half-width of the sketched envelope (for display only)
    max_regen: int                  # 1 for fast strokes, 2 for slow strokes, 0 without a target
    surprise: float
    previous: Optional[str] = None  # the slot's earlier text, so the model writes something new


@dataclass
class Slot:
    index: int
    text: str                       # written text; "" for blank slots and slots to generate
    target: Optional[Target] = None


@dataclass
class Candidate:
    text: str
    fortune: Optional[float]
    error: Optional[float]
    attempt: int


@dataclass
class Request:
    protagonist: str
    slots: list
    mode: str = "batch"
    threshold: float = DEFAULT_THRESHOLD


# ---------------------------------------------------------------- request parsing


def number(value):
    if isinstance(value, bool):
        return None
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return None if x != x else x


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def parse_request(body):
    """Validate the JSON body of POST /api/generate."""
    if not isinstance(body, dict):
        raise ValueError("Expected a JSON object.")
    raw_slots = body.get("slots")
    if not isinstance(raw_slots, list) or not raw_slots:
        raise ValueError("slots must be a non-empty list.")
    if len(raw_slots) > 200:
        raise ValueError("A story can have at most 200 sentence slots.")
    slots = []
    for i, raw in enumerate(raw_slots):
        if not isinstance(raw, dict):
            raise ValueError(f"Slot {i} must be an object.")
        text = " ".join(str(raw.get("text") or "").split())
        target = None
        t = raw.get("target")
        if isinstance(t, dict):
            fortune = number(t.get("fortune"))
            surprise = number(t.get("surprise"))
            max_regen = number(t.get("maxRegen"))
            target = Target(
                fortune=None if fortune is None else clamp(fortune),
                tolerance=number(t.get("tolerance")),
                max_regen=0 if fortune is None else int(clamp(1 if max_regen is None else max_regen, 0, MAX_REGEN)),
                surprise=DEFAULT_SURPRISE if surprise is None else clamp(surprise),
                previous=" ".join(str(raw.get("previous") or "").split()) or None,
            )
            text = ""
        slots.append(Slot(i, text, target))
    if not any(s.target for s in slots):
        raise ValueError("There are no sentence slots to generate.")
    mode = body.get("mode") if body.get("mode") in ("batch", "sequential") else "batch"
    threshold = number(body.get("threshold"))
    threshold = DEFAULT_THRESHOLD if threshold is None else clamp(threshold, 0.01, 1.0)
    protagonist = " ".join(str(body.get("protagonist") or "").split())
    return Request(protagonist, slots, mode, threshold)


# ---------------------------------------------------------------- planning


def plan_runs(slots):
    """Group the slots to generate into runs separated by written sentences.

    A run with a written sentence after it is infilling; a run at the end of
    the story is continuation (Figure 9). Blank slots that are not generated
    are skipped, like the visual gaps in the paper's canvas.
    """
    runs, current = [], []
    for s in slots:
        if s.target is not None:
            current.append(s)
        elif s.text and current:
            runs.append(current)
            current = []
    if current:
        runs.append(current)
    planned = []
    for run in runs:
        first, last = run[0].index, run[-1].index
        has_prev = any(s.text and s.target is None for s in slots[:first])
        has_next = any(s.text and s.target is None for s in slots[last + 1:])
        planned.append({"slots": run, "task": "infilling" if has_next else "continuation",
                        "has_prev": has_prev, "has_next": has_next})
    return planned


def sequential_order(run):
    """The order in which the paper's pipeline writes a run, with each step's task."""
    slots = run["slots"]
    if run["task"] == "continuation":
        return [(s, "continuation") for s in slots]
    if not run["has_prev"]:
        return [(s, "infill from next") for s in reversed(slots)]
    order, lo, hi, from_prev = [], 0, len(slots) - 1, True
    while lo <= hi:  # switch between the two infilling prompts for every sentence
        if from_prev:
            order.append((slots[lo], "infill from previous"))
            lo += 1
        else:
            order.append((slots[hi], "infill from next"))
            hi -= 1
        from_prev = not from_prev
    return order


# ---------------------------------------------------------------- helpers


_NUMBERING = re.compile(r"^\s*(?:\d+\s*[.):]|[*•>])\s*")
_LABEL = re.compile(r"^(?:BLANK|Line\s*\d+|Sentence)\s*[:.\-–—]\s*", re.I)


def clean_sentence(text):
    if not isinstance(text, str):
        return ""
    t = " ".join(text.split())
    t = _NUMBERING.sub("", t, count=1)
    t = _LABEL.sub("", t, count=1)
    if len(t) >= 2 and t[0] in "\"“" and t[-1] in "\"”":
        t = t[1:-1].strip()
    return t


def error_of(fortune, target):
    if fortune is None or target.fortune is None:
        return None
    return round(abs(fortune - target.fortune), 3)


def pick_best(candidates):
    """The candidate with the smallest fortune error (the last one if there is no target)."""
    if not candidates:
        return None
    scored = [c for c in candidates if c.error is not None]
    if not scored:
        return candidates[-1]
    return min(scored, key=lambda c: (c.error, c.attempt))


def current_story(slots, best, texts):
    """slot index -> text, using this round's new texts, then the best earlier picks."""
    story = {}
    for s in slots:
        if s.target is None:
            if s.text:
                story[s.index] = s.text
        elif s.index in texts:
            story[s.index] = texts[s.index]
        elif s.index in best:
            story[s.index] = best[s.index].text
    return story


def context_before(story, index):
    return [story[i] for i in sorted(story) if i < index][-CONTEXT_SENTENCES:]


def plural(n, word):
    return f"{n} {word}{'' if n == 1 else 's'}"


def final_event(slot, task, chosen, attempts):
    return {
        "type": "sentence", "slot": slot.index, "text": chosen.text, "fortune": chosen.fortune,
        "target": slot.target.fortune, "tolerance": slot.target.tolerance,
        "surprise": slot.target.surprise, "maxRegen": slot.target.max_regen, "task": task,
        "attempts": [{"text": a.text, "fortune": a.fortune} for a in attempts],
    }


# ---------------------------------------------------------------- generator


class Generator:
    def __init__(self, llm, recognizer, log=print):
        self.llm = llm
        self.recognizer = recognizer
        self.log = log

    def run(self, req, emit):
        """Generate every target slot of the request. emit(event) streams progress to the browser."""
        started = time.time()
        calls_before = self.llm.calls
        runs = plan_runs(req.slots)
        emit({"type": "plan", "mode": req.mode, "threshold": req.threshold,
              "runs": [{"slots": [s.index for s in r["slots"]], "task": r["task"]} for r in runs]})
        if req.mode == "sequential":
            stats = self._sequential(req, runs, emit)
        else:
            stats = self._batch(req, runs, emit)
        seconds = round(time.time() - started, 1)
        calls = self.llm.calls - calls_before
        self.log(f"generated {stats['written']} sentence(s) ({req.mode}) in {seconds}s with {calls} model call(s)")
        emit({"type": "done", "seconds": seconds, "calls": calls, **stats})

    # ---------------------------------------------------------------- batch pipeline

    def _batch(self, req, runs, emit):
        task_of = {s.index: r["task"] for r in runs for s in r["slots"]}
        targets = [s for r in runs for s in r["slots"]]
        attempts = {s.index: [] for s in targets}
        best = {}
        pending = list(targets)
        round_no = 0
        while pending:
            if round_no == 0:
                tasks = " and ".join(sorted({task_of[s.index] for s in pending}))
                emit({"type": "status", "message": f"Writing {plural(len(pending), 'sentence')} ({tasks})..."})
            else:
                emit({"type": "status", "message":
                      f"Rewriting {plural(len(pending), 'sentence')} whose fortune missed the sketch by more "
                      f"than {req.threshold:.2f} (retry {round_no})..."})
            texts = self._write_batch(req, pending, best, attempts)
            written = [s for s in pending if texts.get(s.index)]
            if written:
                emit({"type": "status", "message":
                      f"Checking the protagonist's fortune in {plural(len(written), 'new sentence')}..."})
            story = current_story(req.slots, best, texts)
            fortunes = self.recognizer.recognize(
                req.protagonist,
                [{"context": context_before(story, s.index), "sentence": texts[s.index]} for s in written])
            fortune_of = {s.index: f for s, f in zip(written, fortunes)}
            next_pending = []
            for s in pending:
                text = texts.get(s.index)
                if not text:  # the model skipped this line: ask again while tries remain
                    if round_no < max(1, s.target.max_regen):
                        next_pending.append(s)
                    continue
                f = fortune_of.get(s.index)
                err = error_of(f, s.target)
                attempts[s.index].append(Candidate(text, f, err, round_no + 1))
                best[s.index] = pick_best(attempts[s.index])
                emit({"type": "draft", "slot": s.index, "text": best[s.index].text,
                      "fortune": best[s.index].fortune, "attempt": round_no + 1})
                if err is not None and err > req.threshold and round_no < s.target.max_regen:
                    next_pending.append(s)
            pending = next_pending
            round_no += 1

        written = retried = missing = 0
        for run in runs:
            for s in run["slots"]:
                chosen = best.get(s.index)
                if not chosen:
                    missing += 1
                    emit({"type": "missing", "slot": s.index})
                    continue
                written += 1
                retried += len(attempts[s.index]) > 1
                emit(final_event(s, run["task"], chosen, attempts[s.index]))
        return {"written": written, "retried": retried, "missing": missing}

    def _write_batch(self, req, pending, best, attempts):
        """One call that writes every pending slot. Returns slot index -> text."""
        pending_ids = {s.index for s in pending}
        lines, slot_of_line = [], {}
        number_ = 0
        for s in req.slots:
            if s.index in pending_ids:
                number_ += 1
                slot_of_line[number_] = s.index
                lines.append(("blank", number_, s))
            elif s.target is not None:
                if s.index in best:
                    number_ += 1
                    lines.append(("fixed", number_, best[s.index].text))
            elif s.text:
                number_ += 1
                lines.append(("fixed", number_, s.text))
        data = self.llm.chat_json(prompts.generation_system(),
                                  prompts.batch_user(req.protagonist, lines, attempts))
        items = data.get("sentences") if isinstance(data, dict) else data
        if not isinstance(items, list):
            items = []
        texts, unnumbered = {}, []
        for item in items:
            if isinstance(item, str):
                unnumbered.append(clean_sentence(item))
                continue
            if not isinstance(item, dict):
                continue
            text = clean_sentence(item.get("text"))
            try:
                line = int(item.get("line"))
            except (TypeError, ValueError):
                unnumbered.append(text)
                continue
            if line in slot_of_line and text:
                texts[slot_of_line[line]] = text
        # The model left out the line numbers but wrote one sentence per blank: use them in order.
        if not texts and unnumbered and len(unnumbered) == len(slot_of_line):
            for (_, slot_index), text in zip(sorted(slot_of_line.items()), unnumbered):
                if text:
                    texts[slot_index] = text
        return texts

    # ---------------------------------------------------------------- sequential pipeline

    def _sequential(self, req, runs, emit):
        story = {s.index: s.text for s in req.slots if s.text and s.target is None}
        written = retried = missing = 0
        for run in runs:
            for slot, task in sequential_order(run):
                remaining = sum(1 for s in run["slots"] if s.index not in story)
                prev = [story[i] for i in sorted(story) if i < slot.index]
                nxt = [story[i] for i in sorted(story) if i > slot.index]
                attempts = []
                for k in range(1 + slot.target.max_regen):
                    emit({"type": "status", "message":
                          f"Sentence {slot.index + 1}: {task}" + (f", retry {k}" if k else "") + "..."})
                    text = self._write_one(req, task, prev, nxt, remaining, slot.target, attempts)
                    if not text:
                        continue
                    f = self.recognizer.recognize(
                        req.protagonist, [{"context": prev[-CONTEXT_SENTENCES:], "sentence": text}])[0]
                    err = error_of(f, slot.target)
                    attempts.append(Candidate(text, f, err, k + 1))
                    emit({"type": "draft", "slot": slot.index, "text": text, "fortune": f, "attempt": k + 1})
                    if err is None or err <= req.threshold:
                        break
                chosen = pick_best(attempts)
                if not chosen:
                    missing += 1
                    emit({"type": "missing", "slot": slot.index})
                    continue
                story[slot.index] = chosen.text
                written += 1
                retried += len(attempts) > 1
                emit(final_event(slot, task, chosen, attempts))
        return {"written": written, "retried": retried, "missing": missing}

    def _write_one(self, req, task, prev, nxt, missing, target, attempts):
        data = self.llm.chat_json(prompts.generation_system(),
                                  prompts.single_user(task, req.protagonist, prev, nxt, missing, target, attempts))
        if isinstance(data, dict):
            return clean_sentence(data.get("text") or data.get("sentence") or "")
        return ""
