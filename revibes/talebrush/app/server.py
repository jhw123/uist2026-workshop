#!/usr/bin/env python3
"""TaleBrush revibe: back end.

Serves the web interface from ./static and two JSON endpoints that play the
roles of the paper's two technical modules (Section 5):

  POST /api/recognize   fortune recognition: sentence (+ previous context,
                        protagonist) -> fortune level in [0, 1]
  POST /api/generate    controlled generation: a fortune target per sentence
                        slot (+ surprise level) -> sentences, with the paper's
                        recognize-and-regenerate loop

The paper uses GPT-Neo 2.7B with trained soft prompts and a modified GeDi
(GPT2-medium). Neither the trained prompts nor the crowdsourced fortune data are
available, so both modules are substituted by prompting the language model that
answers on the workshop LLM bridge (llm-bridge/, OpenAI chat format).

Only the Python 3 standard library is used.

    python3 server.py            # uses the bridge at http://localhost:8787
    python3 server.py --stub     # no language model: canned, clearly labelled
"""
import json
import os
import random
import re
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("TALEBRUSH_PORT", "5177"))
BRIDGE = os.environ.get("BRIDGE_URL", "http://localhost:8787").rstrip("/")
STUB = "--stub" in sys.argv or os.environ.get("TALEBRUSH_STUB") == "1"
STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

# Paper, Section 5.2.2: regenerate when |y - y_hat| > 0.2, 1-2 more times.
DEFAULT_THRESHOLD = 0.2
CONTEXT_SENTENCES = 3  # Section 5.2.1: at most three previous sentences


# --------------------------------------------------------------------------
# Language model access (bridge)
# --------------------------------------------------------------------------

class ModelError(Exception):
    pass


def llm_json(system, user):
    """One chat call through the bridge, answered as a JSON object."""
    body = json.dumps({
        "model": "bridge",
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
        "response_format": {"type": "json_object"},
    }).encode()
    req = urllib.request.Request(BRIDGE + "/v1/chat/completions", data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise ModelError(f"bridge answered {e.code}: {e.read()[:300].decode(errors='replace')}")
    except (urllib.error.URLError, OSError) as e:
        raise ModelError(f"cannot reach the LLM bridge at {BRIDGE} ({e}). "
                         "Start it from the repository root: python3 llm-bridge/bridge.py claude")
    text = data["choices"][0]["message"]["content"]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            return json.loads(m.group(0))
        raise ModelError("model did not answer with JSON: " + text[:200])


def bridge_health():
    if STUB:
        return {"ok": True, "stub": True, "model": "STUB (no language model)"}
    try:
        with urllib.request.urlopen(BRIDGE + "/health", timeout=3) as r:
            h = json.loads(r.read())
        return {"ok": True, "stub": False, "bridge": h,
                "model": f"{h.get('backend', '?')} / {h.get('model', '?')}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "stub": False, "error": f"LLM bridge not reachable at {BRIDGE}: {e}"}


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def clamp01(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return 0.5
    return max(0.0, min(1.0, v))


def fortune_words(v):
    if v < 0.12:
        return "terrible (disaster, loss, despair)"
    if v < 0.3:
        return "bad (setback, trouble, sadness)"
    if v < 0.43:
        return "slightly bad"
    if v <= 0.57:
        return "neutral (nothing clearly good or bad)"
    if v <= 0.7:
        return "slightly good"
    if v <= 0.88:
        return "good (progress, success, happiness)"
    return "wonderful (triumph, joy, dream come true)"


def surprise_words(s):
    if s is None:
        return None
    if s < 0.25:
        return "low: predictable, the most natural next event"
    if s < 0.5:
        return "moderate: a little unexpected"
    if s < 0.75:
        return "high: an unexpected turn the reader would not guess"
    return "very high: a wild, startling twist (but still about the story)"


def previous_context(sentences, i):
    prev = [s for s in sentences[:i] if s and s.strip()]
    return prev[-CONTEXT_SENTENCES:]


RECOGNIZE_SYSTEM = """You are TaleBrush's fortune recognition module.
For each item you get the protagonist, up to three previous sentences of the story
(context), and a target sentence. Rate the PROTAGONIST'S FORTUNE in the target
sentence: how good or bad the protagonist's situation is at that point, as a reader
would perceive it (status, emotional and physical well-being, closeness to their goal).

Scale (real number between 0 and 1):
  0.0  extremely bad fortune (death, disaster, utter despair)
  0.25 bad fortune (failure, injury, conflict, sadness)
  0.5  neutral (setting, plans, nothing clearly good or bad)
  0.75 good fortune (progress, success, happiness)
  1.0  extremely good fortune (triumph, dream come true)
Use the whole range and two decimals. Rate the target sentence, using the context only
to understand it.
Answer with JSON only: {"scores": [{"id": <id>, "fortune": <number>}, ...]} with one
entry per item."""


def recognize_items(name, items):
    """items: [{id, context: [str], sentence: str}] -> {id: fortune}"""
    if not items:
        return {}
    if STUB:
        return {it["id"]: stub_fortune(it["sentence"]) for it in items}
    lines = [f"Protagonist: {name or 'the protagonist'}", ""]
    for it in items:
        ctx = " ".join(it["context"]) if it["context"] else "(story start)"
        lines.append(f'Item {it["id"]}:\n  Previous context: {ctx}\n  Target sentence: {it["sentence"]}')
    out = llm_json(RECOGNIZE_SYSTEM, "\n".join(lines))
    scores = {}
    for e in out.get("scores", []):
        try:
            scores[str(e["id"])] = clamp01(e["fortune"])
        except (KeyError, TypeError):
            continue
    return {it["id"]: scores.get(str(it["id"]), 0.5) for it in items}


def recognize_story(name, sentences, indices):
    items = [{"id": str(i), "context": previous_context(sentences, i), "sentence": sentences[i]}
             for i in indices if sentences[i] and sentences[i].strip()]
    res = recognize_items(name, items)
    return {int(k): v for k, v in res.items()}


GENERATE_SYSTEM = """You are TaleBrush's controlled story generation module. A writer is
co-writing a short story outline, one sentence per numbered line. Some lines are already
written; lines marked [WRITE] are slots you must fill with exactly ONE new sentence each.

Rules:
- Each slot gives a target for the PROTAGONIST'S FORTUNE (0 = terrible, 0.5 = neutral,
  1 = wonderful). The sentence must put the protagonist at that fortune level. Fortune
  should change between slots the way the targets change (going down = things get worse,
  going up = things get better). "no target" means any fortune that fits the story.
- Continue naturally from the sentences before each slot, and if written sentences come
  after a slot, lead plausibly into them (infilling).
- Keep the same protagonist; refer to them by name or pronoun. Do not introduce a new
  protagonist.
- If a slot gives a surprise level, follow it: low = predictable next event, high = an
  unexpected, surprising event.
- One plain sentence per slot, 8 to 25 words, past tense unless the story uses another.
Answer with JSON only: {"sentences": [{"line": <line number>, "text": "<sentence>"}, ...]}
with one entry per [WRITE] slot."""


def slot_line(slot):
    parts = []
    t = slot.get("target")
    if t is None:
        parts.append("fortune: no target")
    else:
        parts.append(f"fortune target {t:.2f} = {fortune_words(t)}")
    sw = surprise_words(slot.get("surprise"))
    if sw:
        parts.append(f"surprise {sw}")
    return "[WRITE] (" + "; ".join(parts) + ")"


def build_outline(name, sentences, fortunes, slots, alternatives=0, avoid=None):
    by_index = {s["index"]: s for s in slots}
    last = max([i for i, s in enumerate(sentences) if s and s.strip()] + [s["index"] for s in slots] + [0])
    lines = [f"Protagonist: {name or 'the protagonist'}", "", "Story outline:"]
    for i in range(last + 1):
        if i in by_index:
            lines.append(f"{i + 1}. {slot_line(by_index[i])}")
        elif i < len(sentences) and sentences[i] and sentences[i].strip():
            f = fortunes.get(i)
            tag = f"  [fortune {f:.2f}]" if f is not None else ""
            lines.append(f"{i + 1}. {sentences[i].strip()}{tag}")
        else:
            lines.append(f"{i + 1}. (left blank by the writer; ignore)")
    if avoid:
        lines += ["", "Earlier versions of these slots that the writer wants to move away from "
                  "(write something different):"]
        for i, texts in sorted(avoid.items()):
            for t in texts[:4]:
                lines.append(f"- line {i + 1}: {t}")
    if alternatives:
        lines += ["", f"Give {alternatives} different alternative sentences for EACH [WRITE] slot "
                  "(each one on its own entry, repeating the line number). Each alternative is "
                  "judged on its own, with the other lines as they are, so every alternative must "
                  "hit the slot's fortune target."]
    lines += ["", f"Random seed for variety: {random.randint(1000, 9999)}"]
    return "\n".join(lines)


def generate_once(name, sentences, fortunes, slots, alternatives=0, avoid=None):
    """-> {index: [text, ...]}"""
    if STUB:
        return {s["index"]: [stub_sentence(name, s.get("target"), s.get("surprise"))
                             for _ in range(max(1, alternatives))] for s in slots}
    out = llm_json(GENERATE_SYSTEM, build_outline(name, sentences, fortunes, slots, alternatives, avoid))
    res = {}
    for e in out.get("sentences", []):
        try:
            i = int(e["line"]) - 1
            text = str(e["text"]).strip()
        except (KeyError, TypeError, ValueError):
            continue
        if text:
            res.setdefault(i, []).append(text)
    return res


def generate(payload):
    """The paper's generation loop (Section 5.2.2):
    generate for every sketched slot, recognize the result, and regenerate the
    slots whose fortune misses the target by more than the slot's tolerance,
    up to the slot's number of retries (set by sketching speed), keeping the
    candidate with the smallest fortune error."""
    name = payload.get("name", "").strip()
    sentences = [(s or "").strip() for s in payload.get("sentences", [])]
    slots = payload.get("slots", [])
    avoid = {int(k): v for k, v in (payload.get("avoid") or {}).items()}
    if not slots:
        return {"sentences": []}
    n = max(len(sentences), max(s["index"] for s in slots) + 1)
    sentences += [""] * (n - len(sentences))
    for s in slots:
        s["index"] = int(s["index"])
        s["target"] = None if s.get("target") is None else clamp01(s["target"])
        s["surprise"] = None if s.get("surprise") is None else clamp01(s["surprise"])
        s["tol"] = float(s.get("tol") or DEFAULT_THRESHOLD)
        s["retries"] = int(s.get("retries", 1))
        sentences[s["index"]] = ""  # slots are rewritten

    fortunes = {int(k): v for k, v in (payload.get("fortunes") or {}).items() if v is not None}
    calls = 0

    first = generate_once(name, sentences, fortunes, slots, avoid=avoid)
    calls += 1
    for s in slots:
        sentences[s["index"]] = (first.get(s["index"]) or ["..."])[0]
    idx = [s["index"] for s in slots]
    scores = recognize_story(name, sentences, idx)
    calls += 1
    attempts = {i: 1 for i in idx}

    for _round in range(2):
        bad = [s for s in slots if s["target"] is not None and s["retries"] > _round
               and abs(scores.get(s["index"], 0.5) - s["target"]) > s["tol"]]
        if not bad:
            break
        fixed_fortunes = dict(fortunes)
        for i in idx:
            if i in scores:
                fixed_fortunes[i] = scores[i]
        ctx_sentences = list(sentences)
        for s in bad:
            ctx_sentences[s["index"]] = ""
            fixed_fortunes.pop(s["index"], None)
        alts = generate_once(name, ctx_sentences, fixed_fortunes, bad, alternatives=2)
        calls += 1
        items = []
        for s in bad:
            i = s["index"]
            attempts[i] += 1
            for k, text in enumerate(alts.get(i, [])[:3]):
                trial = list(sentences)
                trial[i] = text
                items.append({"id": f"{i}_{k}", "context": previous_context(trial, i),
                              "sentence": text, "_i": i, "_text": text})
        rec = recognize_items(name, items)
        calls += 1
        for it in items:
            i = it["_i"]
            target = next(s["target"] for s in bad if s["index"] == i)
            if abs(rec[it["id"]] - target) < abs(scores.get(i, 0.5) - target):
                sentences[i] = it["_text"]
                scores[i] = rec[it["id"]]

    return {
        "sentences": [{"index": s["index"], "text": sentences[s["index"]],
                       "fortune": scores.get(s["index"]), "target": s["target"],
                       "attempts": attempts[s["index"]]} for s in slots],
        "calls": calls,
        "stub": STUB,
    }


def recognize(payload):
    name = payload.get("name", "").strip()
    sentences = [(s or "").strip() for s in payload.get("sentences", [])]
    indices = [int(i) for i in payload.get("indices", range(len(sentences)))]
    return {"scores": {str(k): v for k, v in recognize_story(name, sentences, indices).items()},
            "stub": STUB}


# --------------------------------------------------------------------------
# Stub (only with --stub: no language model available)
# --------------------------------------------------------------------------

GOOD = "win won award success happy joy love great best celebrat proud famous thrill delight succeed hired praise".split()
BAD = "lose lost broke break fail sad hurt injur die dead fire fired cry pain alone reject angry ruin crash sick cannot".split()


def stub_fortune(sentence):
    s = sentence.lower()
    g = sum(w in s for w in GOOD)
    b = sum(w in s for w in BAD)
    return clamp01(0.5 + 0.2 * (g - b))


def stub_sentence(name, target, surprise):
    who = name or "The hero"
    if target is None:
        pool = [f"{who} spent the afternoon thinking about what to do next.",
                f"{who} walked through the city without a clear plan."]
    elif target < 0.3:
        pool = [f"{who} failed badly and felt sad and alone.", f"{who} lost everything in a fire."]
    elif target < 0.6:
        pool = [f"{who} went home and made dinner.", f"{who} talked with a neighbor about the weather."]
    else:
        pool = [f"{who} won a great award and felt happy.", f"{who} had a huge success and celebrated with friends."]
    s = random.choice(pool)
    if surprise is not None and surprise > 0.6:
        s = s[:-1] + ", and then a dragon appeared."
    return "[stub] " + s


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            sys.stderr.write("[talebrush] " + fmt % args + "\n")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/status"):
            return self._json(200, bridge_health())
        return super().do_GET()

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self._json(400, {"error": "bad JSON"})
        routes = {"/api/recognize": recognize, "/api/generate": generate}
        fn = routes.get(self.path.split("?")[0])
        if not fn:
            return self._json(404, {"error": "not found"})
        try:
            return self._json(200, fn(payload))
        except ModelError as e:
            return self._json(502, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"error": f"{type(e).__name__}: {e}"})


def main():
    h = bridge_health()
    print(f"TaleBrush revibe on http://localhost:{PORT}")
    if STUB:
        print("STUB MODE: canned sentences and keyword fortune scores, no language model.")
    elif h["ok"]:
        print(f"LLM bridge: {BRIDGE} ({h['model']})")
    else:
        print("WARNING: " + h["error"])
        print("  Start it from the repository root:  python3 llm-bridge/bridge.py claude")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
