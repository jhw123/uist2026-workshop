#!/usr/bin/env python3
"""TaleBrush backend: serves the web interface and a small REST API.

The paper runs GPT-Neo with soft prompts (recognition, continuation, infilling)
and a modified GeDi model behind a Flask API. Those trained models are not
available, so this backend substitutes a language model reached through the
workshop's LLM bridge (llm-bridge/), prompted to do the same three tasks.

Only the Python 3 standard library is used.

    python3 server.py [port]           # default 5175
    BRIDGE_URL=http://localhost:8787   # where the LLM bridge listens
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(HERE, "static")
BRIDGE_URL = os.environ.get("BRIDGE_URL", "http://localhost:8787").rstrip("/")

# Paper, Section 5.2.2: regenerate when |y - y_hat| > 0.2.
ERROR_THRESHOLD = 0.2
# Paper, Section 5.2.1: recognition sees at most three previous sentences.
RECOG_CONTEXT = 3

# Small cache so unchanged sentences are not re-recognized on every edit.
_recog_cache = {}


# --------------------------------------------------------------------------
# LLM bridge
# --------------------------------------------------------------------------

class BridgeError(Exception):
    pass


def llm_json(system, user):
    """One call to the bridge, asking for a JSON object back."""
    body = json.dumps({
        "model": "bridge",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
    }).encode()
    req = urllib.request.Request(
        BRIDGE_URL + "/v1/chat/completions", data=body,
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.loads(r.read().decode())
    except urllib.error.URLError as e:
        raise BridgeError(
            "Could not reach the LLM bridge at %s (%s). Start it with: "
            "python3 llm-bridge/bridge.py claude" % (BRIDGE_URL, e))
    text = data["choices"][0]["message"]["content"]
    return parse_json(text)


def parse_json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    try:
        return json.loads(text)
    except ValueError:
        m = re.search(r"\{.*\}", text, flags=re.S)
        if m:
            return json.loads(m.group(0))
        raise BridgeError("The model did not answer in JSON: %r" % text[:200])


def clamp01(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return 0.5
    return max(0.0, min(1.0, v))


# --------------------------------------------------------------------------
# Recognition module (paper Section 5.2.1)
# --------------------------------------------------------------------------

RECOG_SYSTEM = """You estimate the PROTAGONIST'S FORTUNE in one sentence of a short story.

Fortune is how good or bad things are for the protagonist in that sentence, as a reader would perceive it. It reflects the protagonist's status, emotional and physical well-being, and closeness to their goals.

Scale (a real number from 0 to 1):
- 0.0 = extremely bad fortune (disaster, loss, grief, danger)
- 0.25 = bad fortune
- 0.5 = neutral (nothing good or bad happens to the protagonist)
- 0.75 = good fortune
- 1.0 = extremely good fortune (triumph, joy, success)

Rate only the TARGET sentence; previous sentences are context. Answer with JSON only."""


def recognize_many(protagonist, items):
    """items: list of (prev_context_list, target_sentence). Returns list of floats."""
    results = [None] * len(items)
    todo = []
    for i, (prev, target) in enumerate(items):
        key = (protagonist, tuple(prev), target)
        if key in _recog_cache:
            results[i] = _recog_cache[key]
        else:
            todo.append(i)
    if todo:
        blocks = []
        for n, i in enumerate(todo):
            prev, target = items[i]
            ctx = " ".join(prev) if prev else "(none)"
            blocks.append("Item %d\nPrevious context: %s\nTarget sentence: %s"
                          % (n, ctx, target))
        user = ("Protagonist: %s\n\n%s\n\nReturn {\"fortunes\": [one number per item, "
                "in order]} with %d numbers." % (protagonist or "(unnamed)",
                                                 "\n\n".join(blocks), len(todo)))
        out = llm_json(RECOG_SYSTEM, user)
        vals = out.get("fortunes") if isinstance(out, dict) else out
        if not isinstance(vals, list):
            vals = [out.get("fortune", 0.5)] if isinstance(out, dict) else []
        for n, i in enumerate(todo):
            v = clamp01(vals[n]) if n < len(vals) else 0.5
            prev, target = items[i]
            _recog_cache[(protagonist, tuple(prev), target)] = v
            results[i] = v
    return results


def prev_context(story, index):
    prev = [s for s in story[:index] if s and s.strip()]
    return prev[-RECOG_CONTEXT:]


# --------------------------------------------------------------------------
# Generation module (paper Section 5.2.2)
# --------------------------------------------------------------------------

GEN_SYSTEM = """You are the story generation model of TaleBrush, a story ideation tool. You write ONE sentence of a short story outline at a time.

Rules:
- Write exactly one sentence, in plain past-tense narration, about 10 to 25 words, in the style of a simple five-sentence story.
- Keep {protagonist} as the protagonist; do not introduce random new main characters.
- The sentence must fit where it is placed: follow from the sentences before it and, if there are sentences after it, lead into them.
- Make the protagonist's FORTUNE in your sentence match the requested level (0 = extremely bad, 0.5 = neutral, 1 = extremely good). Fortune is how good or bad things are for the protagonist: status, well-being, closeness to goals.
- Match the requested SURPRISE level: low surprise means the most expected, ordinary next event; high surprise means an unexpected, inventive twist (still about the protagonist).
Answer with JSON only: {{"sentence": "..."}}"""


def fortune_words(v):
    if v is None:
        return "no specific target (any fortune level that suits the story)"
    if v < 0.12:
        w = "extremely bad"
    elif v < 0.37:
        w = "bad"
    elif v < 0.63:
        w = "neutral"
    elif v < 0.88:
        w = "good"
    else:
        w = "extremely good"
    return "%.2f (%s)" % (v, w)


def surprise_words(s):
    if s < 0.2:
        return "%.2f (very low: the most predictable continuation)" % s
    if s < 0.45:
        return "%.2f (low: an expected, natural continuation)" % s
    if s < 0.7:
        return "%.2f (medium: somewhat unexpected)" % s
    if s < 0.9:
        return "%.2f (high: a surprising turn)" % s
    return "%.2f (very high: a wild, very unexpected twist)" % s


def generate_sentence(protagonist, story, index, mode, target, surprise, rejected):
    lines = []
    for i, s in enumerate(story):
        if i == index:
            lines.append("%d. >>> [WRITE THIS SENTENCE] <<<" % (i + 1))
        elif s and s.strip():
            lines.append("%d. %s" % (i + 1, s.strip()))
        else:
            lines.append("%d. [blank, to be written later]" % (i + 1))
    has_after = any(s and s.strip() for s in story[index + 1:])
    if mode == "infill_next":
        task = ("Infilling from the next context: write the sentence so it leads "
                "naturally into the sentences that come after it.")
    elif mode == "infill_prev" or has_after:
        task = ("Infilling from the previous context: write the sentence so it "
                "follows the sentences before it and still allows the later "
                "sentences to happen.")
    else:
        task = "Continuation: continue the story from the sentences before it."
    user = ("Protagonist: %s\n\nStory so far (sentence slots in order):\n%s\n\n"
            "Task: %s\nRequested protagonist fortune: %s\nRequested surprise: %s"
            % (protagonist or "the protagonist", "\n".join(lines), task,
               fortune_words(target), surprise_words(surprise)))
    if rejected:
        user += ("\n\nEarlier attempts for this slot missed the fortune target, so "
                 "write a different sentence:\n" + "\n".join(
                     "- \"%s\" (read as fortune %.2f)" % (t, f) for t, f in rejected))
    out = llm_json(GEN_SYSTEM.format(protagonist=protagonist or "the protagonist"), user)
    sent = out.get("sentence") if isinstance(out, dict) else None
    if not sent:
        raise BridgeError("The model returned no sentence.")
    return " ".join(str(sent).split())


def generate_controlled(req):
    """Generate one sentence; regenerate while the recognized fortune misses
    the target by more than 0.2, up to `retries` extra times, then keep the
    attempt with the smallest error (paper Section 5.2.2)."""
    protagonist = req.get("protagonist", "")
    story = list(req.get("story", []))
    index = int(req["index"])
    mode = req.get("mode", "continue")
    target = req.get("target")
    target = None if target is None else clamp01(target)
    surprise = clamp01(req.get("surprise", 0.3))
    retries = max(0, min(2, int(req.get("retries", 1))))

    attempts = []
    tries = 1 + (retries if target is not None else 0)
    for _ in range(tries):
        text = generate_sentence(protagonist, story, index, mode, target, surprise,
                                 [(a["text"], a["fortune"]) for a in attempts])
        fortune = recognize_many(protagonist, [(prev_context(story, index), text)])[0]
        attempts.append({"text": text, "fortune": fortune})
        if target is None or abs(fortune - target) <= ERROR_THRESHOLD:
            break
    if target is None:
        best = attempts[0]
    else:
        best = min(attempts, key=lambda a: abs(a["fortune"] - target))
    return {"text": best["text"], "fortune": best["fortune"], "attempts": attempts}


def recognize_story(req):
    protagonist = req.get("protagonist", "")
    story = list(req.get("story", []))
    indices = [int(i) for i in req.get("indices", range(len(story)))]
    indices = [i for i in indices if 0 <= i < len(story) and story[i].strip()]
    items = [(prev_context(story, i), story[i].strip()) for i in indices]
    vals = recognize_many(protagonist, items) if items else []
    return {"fortunes": {str(i): v for i, v in zip(indices, vals)}}


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("%s\n" % (fmt % args))

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/health":
            try:
                with urllib.request.urlopen(BRIDGE_URL + "/health", timeout=3) as r:
                    bridge = json.loads(r.read().decode())
                return self.send_json(200, {"ok": True, "bridge": bridge})
            except Exception as e:  # noqa: BLE001
                return self.send_json(200, {"ok": False, "bridge_url": BRIDGE_URL,
                                            "error": str(e)})
        return super().do_GET()

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        try:
            req = json.loads(self.rfile.read(n).decode() or "{}")
            if self.path == "/api/recognize":
                return self.send_json(200, recognize_story(req))
            if self.path == "/api/generate":
                return self.send_json(200, generate_controlled(req))
            return self.send_json(404, {"error": "unknown endpoint"})
        except BridgeError as e:
            return self.send_json(502, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            return self.send_json(500, {"error": "%s: %s" % (type(e).__name__, e)})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 5175))
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("TaleBrush running at http://localhost:%d  (LLM bridge: %s)" % (port, BRIDGE_URL))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
