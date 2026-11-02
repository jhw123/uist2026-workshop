"""Client for the workshop LLM bridge (OpenAI Chat Completions format).

The paper used GPT-4 directly; at the workshop the same calls go through
`llm-bridge/bridge.py`, which answers with a small, fast model. The paper's
"graceful error handling & retry" (Appendix E) is reproduced: on an error we
wait a random 1 to 5 seconds and retry, up to 5 attempts.
"""
import json
import os
import random
import re
import time
import urllib.error
import urllib.request

BRIDGE_URL = os.environ.get("BRIDGE_URL", "http://localhost:8787").rstrip("/")
TIMEOUT = int(os.environ.get("BRIDGE_TIMEOUT", "300"))
MAX_ATTEMPTS = 5

DEFAULT_SYSTEM = ("You are a helpful assistant that performs content analysis according to "
                  "user requests. Follow the user's requirements carefully and to the letter.")


class LLMError(Exception):
    pass


def health():
    try:
        with urllib.request.urlopen(BRIDGE_URL + "/health", timeout=5) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


def chat(messages, system=DEFAULT_SYSTEM, json_mode=False, temperature=0.3):
    """Send a conversation to the bridge and return the assistant text."""
    body = {"model": "gpt-4", "temperature": temperature,
            "messages": [{"role": "system", "content": system}] + messages}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    data = json.dumps(body).encode("utf-8")
    last = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            req = urllib.request.Request(BRIDGE_URL + "/v1/chat/completions", data=data,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                reply = json.loads(r.read().decode("utf-8"))
            text = reply["choices"][0]["message"]["content"]
            if text is None or not str(text).strip():
                raise LLMError("empty reply from the bridge")
            return str(text)
        except urllib.error.URLError as e:
            last = LLMError(f"cannot reach the LLM bridge at {BRIDGE_URL}: {e.reason}. "
                            "Start it from the repository root with "
                            "`python3 llm-bridge/bridge.py claude`.")
        except Exception as e:  # noqa: BLE001
            last = LLMError(str(e))
        time.sleep(random.uniform(1, 5))
    raise last


def chat_json(messages, system=DEFAULT_SYSTEM, temperature=0.3):
    """Ask for JSON and parse it, tolerating code fences and stray prose."""
    text = chat(messages, system=system, json_mode=True, temperature=temperature)
    return parse_json(text)


def parse_json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # take the first {...} or [...] block
    for opener, closer in (("{", "}"), ("[", "]")):
        s = text.find(opener)
        e = text.rfind(closer)
        if s != -1 and e > s:
            try:
                return json.loads(text[s:e + 1])
            except json.JSONDecodeError:
                continue
    raise LLMError("the model did not return valid JSON: " + text[:200])
