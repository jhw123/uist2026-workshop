#!/usr/bin/env python3
"""TaleBrush back end (revibed).

Serves the web front end from ./static and a small REST API that plays the
role of the paper's Flask server:

  POST /api/recognize   fortune recognition (paper section 5.2.1)
  POST /api/generate    controlled sentence generation with regeneration (5.2.2)
  GET  /api/health      reports whether the LLM bridge is reachable

The paper used GPT-Neo 2.7B with trained soft prompts and a modified GeDi
(GPT2-medium). Neither the trained prompts nor the CC-LM are available, so both
modules are replaced by prompting a language model through the workshop's LLM
bridge (see README.md, "Substitutions").

Only the Python standard library is used.

Usage: python3 server.py [port]        (default port 8790)
Env:   BRIDGE_URL (default http://localhost:8787)
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

# Paper: regenerate when |y - y_hat| > 0.2 (section 5.2.2).
ERROR_THRESHOLD = 0.2
# Paper: recognition uses at most three previous sentences as context.
RECOGNITION_CONTEXT = 3


# --------------------------------------------------------------------------
# LLM bridge
# --------------------------------------------------------------------------

def llm(messages, json_mode=False, temperature=None, timeout=180):
    body = {"model": "bridge", "messages": messages}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    if temperature is not None:
        # The bridge ignores temperature; it is sent for completeness only.
        body["temperature"] = temperature
    req = urllib.request.Request(
        BRIDGE_URL + "/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer bridge"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"]


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
        v = float(v)
    except (TypeError, ValueError):
        return 0.5
    return max(0.0, min(1.0, v))


# --------------------------------------------------------------------------
# Recognition module (substitute for soft-prompted GPT-Neo regression)
# --------------------------------------------------------------------------

RECOGNITION_SYSTEM = """You estimate the PROTAGONIST'S FORTUNE in single story sentences.

Fortune = how good or bad the situation is for the protagonist in that sentence, as a
reader would perceive it. It reflects the protagonist's status, emotional and physical
well-being, and closeness to their goal. Score on a continuous scale from 0 to 1:
  0.0  extremely bad fortune   (e.g. "Her house burned down and she lost everything.")
  0.25 bad fortune             (e.g. "He failed the exam he had studied for.")
  0.5  neutral                 (e.g. "She walked to the store to buy some milk.")
  0.75 good fortune            (e.g. "He got a compliment from his boss.")
  1.0  extremely good fortune  (e.g. "She won the lottery and married the love of her life.")
Judge only the target sentence; the previous context is there to help you interpret it.
Use the full range and two decimals."""


def recognize(protagonist, items):
    """items: list of {"context": [str], "sentence": str} -> list of floats."""
    if not items:
        return []
    lines = []
    for i, it in enumerate(items):
        ctx = [c for c in it.get("context", []) if c.strip()][-RECOGNITION_CONTEXT:]
        lines.append(
            f"Item {i}:\n  Previous context: {' '.join(ctx) if ctx else '(none)'}\n"
            f"  Protagonist: {protagonist}\n  Sentence: {it['sentence']}"
        )
    user = (
        "\n\n".join(lines)
        + f'\n\nReturn JSON: {{"fortunes": [<{len(items)} numbers between 0 and 1, one per item, in order>]}}'
    )
    out = parse_json(
        llm([{"role": "system", "content": RECOGNITION_SYSTEM}, {"role": "user", "content": user}], json_mode=True)
    )
    vals = out.get("fortunes", out if isinstance(out, list) else [])
    vals = [clamp01(v) for v in vals]
    if len(vals) < len(items):
        vals += [0.5] * (len(items) - len(vals))
    return vals[: len(items)]


# --------------------------------------------------------------------------
# Generation module (substitute for GPT-Neo + modified GeDi)
# --------------------------------------------------------------------------

GENERATION_SYSTEM = """You write short story outlines one sentence at a time, in the plain style
of the ROCStories corpus: simple, concrete, everyday sentences of 8-25 words, past tense,
each describing one event. Keep the protagonist at the centre of the story and do not
introduce random new main characters. Never use quotation marks around the sentence."""


def fortune_words(v):
    if v < 0.12:
        return "extremely bad fortune (disaster, loss, despair)"
    if v < 0.37:
        return "bad fortune (a setback, trouble, disappointment)"
    if v < 0.63:
        return "neutral fortune (nothing especially good or bad happens)"
    if v < 0.88:
        return "good fortune (progress, success, a pleasant event)"
    return "extremely good fortune (triumph, joy, a dream come true)"


def surprise_words(s):
    if s < 0.2:
        return "Make it the most predictable, expected next event."
    if s < 0.45:
        return "Make it a natural, fairly expected development."
    if s < 0.7:
        return "Make it somewhat unexpected: a fresh development the reader would not guess."
    if s < 0.85:
        return "Make it surprising: an unexpected twist."
    return "Make it highly surprising, even wild or bizarre, while still being a story sentence."


def gap_note(gap):
    if gap <= 0:
        return ("This is the ONLY missing sentence: it must follow directly from the beginning story "
                "AND lead directly and plausibly into the ending story, so the whole story reads smoothly.")
    return (f"After this sentence, {gap} more sentence{'s are' if gap > 1 else ' is'} still missing between "
            "the beginning and the ending; pace the story so it can reach the ending in that many steps.")


def generation_prompt(protagonist, mode, prev, nxt, target, surprise, n, gap=0):
    parts = [f"Story character (protagonist): {protagonist}"]
    if mode == "continue":
        parts.append("Beginning story: " + (" ".join(prev) if prev else "(the story has not started yet)"))
        parts.append(
            "Task: continue the story with the very next sentence."
            if prev
            else "Task: write the first sentence of a new story about the protagonist."
        )
    elif mode == "infill_prev":
        parts.append("Ending story: " + " ".join(nxt))
        parts.append("Beginning story: " + (" ".join(prev) if prev else "(none)"))
        parts.append(
            "Task: write the sentence that comes RIGHT AFTER the beginning story, as a step "
            "towards the ending story (the ending is fixed and must stay consistent). " + gap_note(gap)
        )
    else:  # infill_next
        parts.append("Beginning story: " + (" ".join(prev) if prev else "(none)"))
        parts.append("Ending story: " + " ".join(nxt))
        parts.append(
            "Task: write the sentence that comes RIGHT BEFORE the ending story; it must set up "
            "the ending story so that the ending follows naturally from it. " + gap_note(gap)
        )
    if target is None:
        parts.append("Fortune: no constraint; write whatever suits the story best.")
    else:
        parts.append(
            f"Fortune control code: {target:.2f} on a 0 (extremely bad) to 1 (extremely good) scale, "
            f"i.e. {fortune_words(target)} for {protagonist} in this sentence. "
            "The sentence must make the protagonist's situation feel this good or bad, "
            "regardless of how the previous sentences felt."
        )
    parts.append("Surprise: " + surprise_words(surprise))
    parts.append(
        f"Write {n} alternative candidate sentence{'s' if n > 1 else ''} for this one slot, each a different idea. "
        f'Return JSON: {{"candidates": [<{n} strings>]}}'
    )
    return "\n".join(parts)


def clean_sentence(s):
    s = str(s).strip().strip('"').strip("“”").strip()
    s = re.sub(r"\s+", " ", s)
    return s


def generate(protagonist, mode, prev, nxt, target, surprise, max_regen, gap=0):
    """Generate one sentence. With a target, the recognition module scores the
    candidates and the first one within ERROR_THRESHOLD is used; otherwise the
    one with the smallest error (paper section 5.2.2)."""
    prev = [p for p in prev if p.strip()]
    nxt = [x for x in nxt if x.strip()]
    if mode != "continue" and not nxt:
        mode = "continue"
    n = 1 if target is None else 1 + max(0, min(2, int(max_regen)))
    prompt = generation_prompt(protagonist, mode, prev, nxt, target, surprise, n, gap)
    out = parse_json(
        llm(
            [{"role": "system", "content": GENERATION_SYSTEM}, {"role": "user", "content": prompt}],
            json_mode=True,
            temperature=0.6 + surprise,
        )
    )
    cands = [clean_sentence(c) for c in out.get("candidates", []) if str(c).strip()]
    if not cands:
        raise ValueError("model returned no candidate sentence")
    cands = cands[:n]

    # Recognise the fortune of each candidate in its position in the story.
    fortunes = recognize(protagonist, [{"context": prev, "sentence": c} for c in cands])
    attempts = [{"sentence": c, "fortune": f} for c, f in zip(cands, fortunes)]

    if target is None:
        chosen, used = attempts[0], 1
    else:
        chosen, used = None, len(attempts)
        for i, a in enumerate(attempts):
            if abs(a["fortune"] - target) <= ERROR_THRESHOLD:
                chosen, used = a, i + 1
                break
        if chosen is None:
            chosen = min(attempts, key=lambda a: abs(a["fortune"] - target))
    return {
        "sentence": chosen["sentence"],
        "fortune": chosen["fortune"],
        "mode": mode,
        "target": target,
        "generations_used": used,
        "attempts": attempts,
    }


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            sys.stderr.write("[talebrush] " + (fmt % args) + "\n")

    def send_json(self, obj, status=200):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/api/health"):
            try:
                with urllib.request.urlopen(BRIDGE_URL + "/health", timeout=3) as r:
                    info = json.loads(r.read().decode("utf-8") or "{}")
                return self.send_json({"ok": True, "bridge": BRIDGE_URL, "info": info})
            except Exception as e:  # noqa: BLE001
                return self.send_json({"ok": False, "bridge": BRIDGE_URL, "error": str(e)})
        return super().do_GET()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            protagonist = (body.get("protagonist") or "the protagonist").strip()
            if self.path == "/api/recognize":
                vals = recognize(protagonist, body.get("items", []))
                return self.send_json({"fortunes": vals})
            if self.path == "/api/generate":
                target = body.get("target")
                target = None if target is None else clamp01(target)
                res = generate(
                    protagonist,
                    body.get("mode", "continue"),
                    body.get("prev", []),
                    body.get("next", []),
                    target,
                    clamp01(body.get("surprise", 0.3)),
                    body.get("max_regen", 1),
                    int(body.get("gap", 0) or 0),
                )
                return self.send_json(res)
            return self.send_json({"error": "not found"}, 404)
        except urllib.error.URLError as e:
            return self.send_json({"error": f"LLM bridge not reachable at {BRIDGE_URL}: {e}"}, 502)
        except Exception as e:  # noqa: BLE001
            return self.send_json({"error": f"{type(e).__name__}: {e}"}, 500)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8790))
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"TaleBrush running at http://localhost:{port}  (LLM bridge: {BRIDGE_URL})")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
