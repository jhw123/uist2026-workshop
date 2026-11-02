"""Client for the workshop LLM bridge (llm-bridge/bridge.py).

The bridge speaks the OpenAI Chat Completions format and answers with the
model of the coding agent the group is signed in to (Claude Haiku for Claude
Code). It ignores temperature and token limits, and it has no token
probabilities, so every TaleBrush model step is phrased as a prompt that asks
for JSON.
"""

import json
import re
import threading
import urllib.error
import urllib.request

START_HINT = "Start it from the repository root with: python3 llm-bridge/bridge.py claude"


class BridgeError(RuntimeError):
    """The bridge could not be reached, failed, or returned unusable output."""


class BridgeClient:
    def __init__(self, base_url, timeout=240):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._lock = threading.Lock()
        self.calls = 0

    def health(self):
        """Return the bridge's /health answer, e.g. {"ok": true, "backend": "claude", "model": "haiku"}."""
        try:
            with urllib.request.urlopen(self.base_url + "/health", timeout=3) as r:
                return json.loads(r.read() or b"{}")
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise BridgeError(f"The LLM bridge is not reachable at {self.base_url}. {START_HINT}") from e

    def chat_json(self, system, user, retries=1):
        """Send one system + user message and return the parsed JSON answer."""
        body = {
            "model": "talebrush",
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "response_format": {"type": "json_object"},
        }
        problem = None
        for _ in range(retries + 1):
            try:
                return parse_json(self._post(body))
            except ValueError as e:
                problem = f"the model did not return valid JSON ({e})"
            except BridgeError as e:
                # The bridge answers 502 when the agent call itself failed; one retry often helps.
                if "(502)" not in str(e):
                    raise
                problem = str(e)
        raise BridgeError(f"The language model call failed: {problem}")

    def _post(self, body):
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(self.base_url + "/v1/chat/completions", data=data,
                                     headers={"Content-Type": "application/json"})
        with self._lock:
            self.calls += 1
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                out = json.loads(r.read())
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = json.loads(e.read()).get("error", {}).get("message", "")
            except Exception:
                pass
            raise BridgeError(f"The LLM bridge returned an error ({e.code}): {detail or e.reason}") from e
        except TimeoutError as e:
            raise BridgeError(f"The LLM bridge did not answer within {self.timeout} seconds.") from e
        except (urllib.error.URLError, OSError) as e:
            raise BridgeError(f"The LLM bridge is not reachable at {self.base_url}. {START_HINT}") from e
        try:
            return out["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as e:
            raise BridgeError("The LLM bridge sent an answer in an unexpected format.") from e


def parse_json(text):
    """Parse a JSON answer, tolerating code fences or a sentence around the object."""
    t = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", (text or "").strip())
    try:
        return json.loads(t)
    except ValueError:
        m = re.search(r"\{.*\}", t, re.S)
        if m:
            return json.loads(m.group(0))
        raise ValueError(f"no JSON object in {t[:160]!r}")
