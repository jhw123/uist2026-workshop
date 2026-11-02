#!/usr/bin/env python3
"""TaleBrush back end (revibe).

Serves the web interface in static/ and a small REST API:

    POST /api/recognize   fortune level (0-1) of the protagonist in given sentences
    POST /api/generate    one story sentence for one slot, steered by a fortune target
    GET  /api/health      whether the LLM bridge answers

The paper's models (GPT-Neo with soft prompts for recognition and generation,
a GeDi class-conditional GPT2-medium for steering) are replaced by a prompted
LLM reached through the workshop's LLM bridge. The regeneration loop of the
paper (Section 5.2.2) is kept: a generated sentence is recognized, and if its
fortune is more than 0.2 away from the target it is generated again, 1-2 more
times, and the closest candidate is kept.

Standard library only.

    python3 server.py              # http://localhost:8501
    PORT=8600 BRIDGE_URL=http://localhost:8788 python3 server.py
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else "8501"))
BRIDGE_URL = os.environ.get("BRIDGE_URL", "http://localhost:8787").rstrip("/")
STATIC = Path(__file__).resolve().parent / "static"

ERROR_THRESHOLD = 0.2      # |y - y_hat| > 0.2 triggers regeneration (paper, Section 5.2.2)
RECOGNITION_CONTEXT = 3    # previous sentences given to recognition (paper, Section 5.2.1)

FORTUNE_DEFINITION = (
    "The protagonist's fortune is the level of 'goodness' or 'badness' of the fortune "
    "experienced by the protagonist, as perceived by readers. It is affected by the "
    "character's status, emotional and physical well-being, and spatial, mental and "
    "emotional proximity to the character's goal. It is a number from 0 to 1: "
    "0 = extremely bad fortune, 0.5 = neutral, 1 = extremely good fortune."
)


# ---------------------------------------------------------------- LLM bridge

def call_llm(system, user, temperature=None):
    """One chat call through the LLM bridge, asking for a JSON object back."""
    body = {
        "model": "bridge",
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
        "response_format": {"type": "json_object"},
    }
    if temperature is not None:
        body["temperature"] = temperature   # ignored by the bridge; kept for other back ends
    req = urllib.request.Request(
        BRIDGE_URL + "/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer bridge"},
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        reply = json.loads(r.read())
    text = reply["choices"][0]["message"]["content"]
    return parse_json(text)


def parse_json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            return json.loads(m.group(0))
        raise


def clamp01(v):
    try:
        return max(0.0, min(1.0, float(v)))
    except (TypeError, ValueError):
        return 0.5


# ---------------------------------------------------------------- recognition

RECOGNIZE_SYSTEM = (
    "You are the fortune recognition module of a story writing tool. "
    + FORTUNE_DEFINITION
    + " For each target sentence, estimate the protagonist's fortune in that sentence, "
    "using the previous context only to understand it. Use the whole scale. "
    'Answer with JSON: {"fortunes": [{"id": <id>, "fortune": <number 0-1>}, ...]}.'
)


def recognize(protagonist, sentences, indices):
    """Fortune of sentences[i] for each i in indices, each read with up to three
    previous non-empty sentences as context. One LLM call for all of them."""
    items = []
    for i in indices:
        if not (sentences[i] or "").strip():
            continue
        prev = [s for s in sentences[:i] if (s or "").strip()][-RECOGNITION_CONTEXT:]
        items.append({"id": i, "previous_context": " ".join(prev), "sentence": sentences[i]})
    if not items:
        return {}
    user = json.dumps({"protagonist": protagonist or "(the main character)", "targets": items},
                      ensure_ascii=False)
    out = call_llm(RECOGNIZE_SYSTEM, user)
    result = {}
    for f in out.get("fortunes", []):
        try:
            result[int(f["id"])] = clamp01(f["fortune"])
        except (KeyError, TypeError, ValueError):
            pass
    return result


# ---------------------------------------------------------------- generation

def fortune_words(v):
    if v < 0.12: return "extremely bad"
    if v < 0.3: return "bad"
    if v < 0.43: return "somewhat bad"
    if v <= 0.57: return "neutral"
    if v <= 0.7: return "somewhat good"
    if v <= 0.88: return "good"
    return "extremely good"


def surprise_words(v):
    if v < 0.2: return "very predictable: the most expected next development, staying close to what came before"
    if v < 0.4: return "fairly predictable"
    if v < 0.6: return "moderately unexpected"
    if v < 0.8: return "surprising: an unexpected development"
    return "very surprising: a wild, highly unexpected turn"


GENERATE_SYSTEM = (
    "You are the story generation module of a story co-writing tool. You write ONE sentence "
    "of a short story outline, in the style of five-sentence everyday stories: plain, concrete, "
    "past tense, third person, usually 8 to 25 words. The story is about the given protagonist; "
    "refer to them by name or pronoun and do not introduce random new main characters. "
    "Build on the story so far: keep using the characters, names, places, objects and events that "
    "earlier sentences introduced (the writer may have added some), and follow up on the most recent "
    "development instead of ignoring it. "
    "Never repeat a sentence that is already in the story. "
    'Answer with JSON: {"sentence": "<the one sentence>"}.'
)


def generate_once(protagonist, prev_ctx, next_ctx, mode, gap_before, gap_after,
                  target, surprise, rejected):
    lines = [f"Protagonist: {protagonist}"]
    if mode == "continue":
        lines.append("Task: continue the story with the next sentence.")
        lines.append("Beginning story: " + (" ".join(prev_ctx) if prev_ctx else "(nothing yet: write the opening sentence)"))
        if prev_ctx:
            lines.append("Most recent sentence, which yours directly follows: " + prev_ctx[-1])
    else:
        lines.append("Task: infill. Write a sentence that goes in the missing part between the "
                     "beginning and the ending, so that the story flows from one to the other.")
        lines.append("Beginning story: " + (" ".join(prev_ctx) if prev_ctx else "(none)"))
        lines.append("Ending story: " + " ".join(next_ctx))
        if mode == "infill_prev":
            lines.append(f"Your sentence comes right after the beginning story. "
                         f"{gap_after} more missing sentence(s) will be written between yours and the ending.")
        else:
            lines.append(f"Your sentence comes right before the ending story. "
                         f"{gap_before} more missing sentence(s) will be written between the beginning and yours.")
    if target is None:
        lines.append("Fortune: no constraint; let the protagonist's fortune go wherever suits the story.")
    else:
        lines.append(FORTUNE_DEFINITION)
        lines.append(f"Target fortune for this sentence: {target:.2f} ({fortune_words(target)} fortune "
                     f"for {protagonist}). The sentence must make the protagonist's situation read as "
                     f"{fortune_words(target)}.")
    lines.append(f"Surprise level: {surprise:.2f} ({surprise_words(surprise)}).")
    if rejected:
        lines.append("Write a different sentence from these earlier attempts, which missed the target: "
                     + " | ".join(rejected))
    out = call_llm(GENERATE_SYSTEM, "\n".join(lines), temperature=0.5 + surprise)
    sentence = str(out.get("sentence", "")).strip()
    return re.sub(r"\s+", " ", sentence)


def generate(req):
    """Generate one sentence for slot req['slot'], with the paper's regeneration loop."""
    protagonist = req.get("protagonist") or "the protagonist"
    sentences = list(req.get("sentences") or [])
    slot = int(req["slot"])
    mode = req.get("mode", "continue")
    target = req.get("target")
    target = None if target is None else clamp01(target)
    surprise = clamp01(req.get("surprise", 0.3))
    regenerations = max(0, min(2, int(req.get("regenerations", 1))))

    prev_ctx = [s for s in sentences[:slot] if (s or "").strip()]
    next_ctx = [s for s in sentences[slot + 1:] if (s or "").strip()] if mode != "continue" else []
    if mode != "continue" and not next_ctx:
        mode = "continue"
    gap_before = int(req.get("gap_before", 0))
    gap_after = int(req.get("gap_after", 0))

    attempts = []
    rejected = []
    for attempt in range(1 + regenerations):
        sentence = generate_once(protagonist, prev_ctx, next_ctx, mode, gap_before, gap_after,
                                 target, surprise, rejected)
        trial = sentences[:]
        trial[slot] = sentence
        fortune = recognize(protagonist, trial, [slot]).get(slot, 0.5)
        attempts.append({"sentence": sentence, "fortune": fortune})
        if target is None or abs(fortune - target) <= ERROR_THRESHOLD:
            break
        rejected.append(sentence)
    if target is None:
        best = attempts[-1]
    else:
        best = min(attempts, key=lambda a: abs(a["fortune"] - target))
    return {"slot": slot, "sentence": best["sentence"], "fortune": best["fortune"],
            "target": target, "mode": mode, "attempts": attempts}


# ---------------------------------------------------------------- HTTP

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(STATIC), **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            sys.stderr.write("%s\n" % (fmt % args))

    def send_json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/api/health":
            try:
                with urllib.request.urlopen(BRIDGE_URL + "/health", timeout=5) as r:
                    info = json.loads(r.read() or b"{}")
                return self.send_json(200, {"ok": True, "bridge": BRIDGE_URL, "info": info})
            except Exception as e:
                return self.send_json(200, {"ok": False, "bridge": BRIDGE_URL, "error": str(e)})
        return super().do_GET()

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n) or b"{}")
            if self.path == "/api/recognize":
                sentences = req.get("sentences") or []
                indices = req.get("indices")
                if indices is None:
                    indices = list(range(len(sentences)))
                f = recognize(req.get("protagonist"), sentences, [int(i) for i in indices])
                return self.send_json(200, {"fortunes": {str(k): v for k, v in f.items()}})
            if self.path == "/api/generate":
                return self.send_json(200, generate(req))
            return self.send_json(404, {"error": "unknown endpoint"})
        except urllib.error.HTTPError as e:
            try:
                detail = json.loads(e.read()).get("error", {}).get("message", "")
            except Exception:
                detail = ""
            return self.send_json(502, {"error": f"The LLM bridge returned an error: {detail or e}"})
        except urllib.error.URLError as e:
            return self.send_json(502, {"error": f"Cannot reach the LLM bridge at {BRIDGE_URL} ({e.reason}). "
                                                 "Start it with: python3 llm-bridge/bridge.py claude"})
        except Exception as e:
            return self.send_json(500, {"error": f"{type(e).__name__}: {e}"})


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"TaleBrush: http://localhost:{PORT}   (LLM bridge: {BRIDGE_URL})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
