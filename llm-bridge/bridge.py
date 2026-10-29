#!/usr/bin/env python3
"""LLM bridge: lets a revibed system call a language model through the coding
agent you are already signed in to (Claude Code or Codex), so no API key is
needed.

    python3 llm-bridge/bridge.py              # serves http://localhost:8787

It speaks small subsets of two official APIs, so their SDKs work once the
base URL points here (any API key string is accepted):

    POST /v1/chat/completions   OpenAI Chat Completions
    POST /v1/messages           Anthropic Messages
    GET  /health                which backend and model are in use

Each request runs one non-interactive call of the agent CLI (`claude -p`) or
one fresh thread on a long-running `codex app-server` (falling back to `codex
exec`), in an empty temporary folder with tools turned off or read-only. Text and images are supported, and so are system prompts, earlier
turns, JSON output (response_format) and streaming (sent as one chunk). Tool
or function calling, temperature and token limits are not: they are ignored.

Settings, as environment variables:

    BRIDGE_BACKEND    claude or codex (default: claude if installed, else codex)
    BRIDGE_MODEL      model for the agent (default: haiku for claude; for codex, the newest
                      model Codex describes as fast, else Codex's own default)
    BRIDGE_EFFORT     Codex reasoning effort, default low
    BRIDGE_PORT       default 8787
    BRIDGE_PARALLEL   calls allowed at once, default 4
    BRIDGE_TIMEOUT    seconds per call, default 300
    BRIDGE_CACHE      1 to reuse answers to identical requests (kept in .bridge-cache/)

Python 3.7 or later, standard library only.
"""

import base64
import hashlib
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(sys.argv[2] if len(sys.argv) > 2 else os.environ.get("BRIDGE_PORT", "8787"))
TIMEOUT = int(os.environ.get("BRIDGE_TIMEOUT", "300"))
SLOTS = threading.Semaphore(int(os.environ.get("BRIDGE_PARALLEL", "4")))
CACHE = Path(".bridge-cache") if os.environ.get("BRIDGE_CACHE") == "1" else None

DEFAULT_SYSTEM = "You are a language model called through an API. Answer the request directly."
CODEX_PREAMBLE = ("You are being used as a plain language-model API by another program. "
                  "Do not run commands, read files or use any tools. Reply with only the "
                  "response the instructions below ask for, with no preamble or commentary.")
JSON_NOTE = "Respond with only valid JSON: no code fences and no text before or after it."
EXT = {"image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg",
       "image/gif": ".gif", "image/webp": ".webp"}


def pick_backend():
    # python3 llm-bridge/bridge.py codex [port]  (or claude); BRIDGE_BACKEND also works
    want = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("BRIDGE_BACKEND", "")).lower()
    if want in ("claude", "codex"):
        if not shutil.which(want):
            sys.exit(f"The {want} command was not found. Install and sign in to it.")
        return want
    if want:
        sys.exit(f"Unknown backend {want!r}: use claude or codex.")
    for name in ("claude", "codex"):
        if shutil.which(name):
            return name
    sys.exit("Neither the claude nor the codex command was found. Install and sign in to one.")


BACKEND = pick_backend()
# Small, fast models by default: Haiku for Claude Code; for Codex, the newest model
# its model list describes as fast (chosen when the app server starts).
MODEL = os.environ.get("BRIDGE_MODEL") or ("haiku" if BACKEND == "claude" else None)
EFFORT = os.environ.get("BRIDGE_EFFORT", "low")   # Codex reasoning effort
counter = 0


# ---------------------------------------------------------------- requests


def load_image(url):
    """(media_type, bytes) from a data: URL or an http(s) URL."""
    m = re.match(r"data:([^;,]+)?(;base64)?,(.*)", url, re.S)
    if m:
        raw = m.group(3)
        data = base64.b64decode(raw) if m.group(2) else urllib.request.unquote(raw).encode()
        return m.group(1) or "image/png", data
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.headers.get_content_type(), r.read()


def openai_request(body):
    """Normalize an OpenAI Chat Completions body to (system, turns, wants_json)."""
    system, turns = [], []
    for msg in body.get("messages", []):
        content = msg.get("content") or ""
        parts = []
        for p in ([{"type": "text", "text": content}] if isinstance(content, str) else content):
            kind = p.get("type")
            if kind in ("text", "input_text"):
                parts.append(("text", p.get("text", "")))
            elif kind == "image_url":
                url = p["image_url"]["url"] if isinstance(p["image_url"], dict) else p["image_url"]
                parts.append(("image",) + load_image(url))
        if msg.get("role") in ("system", "developer"):
            system += [t for k, t, *_ in parts if k == "text"]
        else:
            turns.append(("assistant" if msg.get("role") == "assistant" else "user", parts))
    fmt = (body.get("response_format") or {})
    wants_json = fmt.get("type") in ("json_object", "json_schema")
    if fmt.get("type") == "json_schema":
        schema = fmt.get("json_schema", {}).get("schema")
        if schema:
            system.append("The JSON must match this JSON Schema:\n" + json.dumps(schema))
    return "\n\n".join(system), turns, wants_json


def anthropic_request(body):
    """Normalize an Anthropic Messages body to (system, turns, wants_json)."""
    sys_field = body.get("system") or ""
    system = sys_field if isinstance(sys_field, str) else "\n\n".join(
        b.get("text", "") for b in sys_field if b.get("type") == "text")
    turns = []
    for msg in body.get("messages", []):
        content = msg.get("content") or ""
        parts = []
        for p in ([{"type": "text", "text": content}] if isinstance(content, str) else content):
            if p.get("type") == "text":
                parts.append(("text", p.get("text", "")))
            elif p.get("type") == "image":
                src = p.get("source", {})
                if src.get("type") == "base64":
                    parts.append(("image", src.get("media_type", "image/png"), base64.b64decode(src["data"])))
                elif src.get("type") == "url":
                    parts.append(("image",) + load_image(src["url"]))
        turns.append(("assistant" if msg.get("role") == "assistant" else "user", parts))
    return system, turns, False


def flatten(turns):
    """One user message: the request itself, or a transcript for multi-turn input."""
    if len(turns) == 1 and turns[0][0] == "user":
        return turns[0][1]
    parts = [("text", "Conversation so far:")]
    for role, content in turns:
        parts.append(("text", f"\n\n{'User' if role == 'user' else 'Assistant'}:"))
        parts += content
    parts.append(("text", "\n\nReply as the assistant to the last user message."))
    return parts


# ---------------------------------------------------------------- backends


def run(cmd, stdin, cwd):
    proc = subprocess.run(cmd, input=stdin, capture_output=True, text=True, cwd=cwd, timeout=TIMEOUT)
    return proc


def call_claude(system, parts, cwd):
    blocks = []
    for p in parts:
        if p[0] == "text":
            blocks.append({"type": "text", "text": p[1]})
        else:
            blocks.append({"type": "image", "source": {
                "type": "base64", "media_type": p[1], "data": base64.b64encode(p[2]).decode()}})
    line = json.dumps({"type": "user", "message": {"role": "user", "content": blocks}})
    cmd = ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json",
           "--verbose", "--tools", "", "--system-prompt", system or DEFAULT_SYSTEM,
           "--no-session-persistence", "--strict-mcp-config", "--setting-sources", "user"]
    if MODEL:
        cmd += ["--model", MODEL]
    proc = run(cmd, line + "\n", cwd)
    for out in proc.stdout.splitlines():
        try:
            event = json.loads(out)
        except ValueError:
            continue
        if event.get("type") == "result":
            if event.get("is_error"):
                raise RuntimeError(event.get("result") or "claude reported an error")
            return event.get("result", "")
    raise RuntimeError((proc.stderr or proc.stdout or "no output from claude").strip()[-2000:])


def call_codex(system, parts, cwd):
    text, cmd, n = [], ["codex", "exec", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only"], 0
    for p in parts:
        if p[0] == "text":
            text.append(p[1])
        else:
            n += 1
            path = Path(cwd) / f"image-{n}{EXT.get(p[1], '.png')}"
            path.write_bytes(p[2])
            cmd += ["--image", str(path)]
            text.append(f"[image {n}]")
    out = Path(cwd) / "answer.txt"
    cmd += ["-o", str(out)]
    if MODEL:
        cmd += ["-m", MODEL]
    cmd.append("-")
    prompt = f"{CODEX_PREAMBLE}\n\n# System instructions\n\n{system or DEFAULT_SYSTEM}\n\n# Request\n\n{''.join(text)}"
    proc = run(cmd, prompt, cwd)
    if proc.returncode != 0 or not out.exists():
        raise RuntimeError((proc.stderr or proc.stdout or "no output from codex").strip()[-2000:])
    return out.read_text().strip()


class CodexServer:
    """One long-running `codex app-server`, so calls skip Codex's few seconds of
    startup. Each call is a fresh, ephemeral thread. If the server cannot be
    used (it is experimental), calls fall back to `codex exec`."""

    def __init__(self):
        self.proc, self.lock, self.next_id = None, threading.Lock(), 0
        self.waiting, self.threads, self.failed = {}, {}, False

    def start(self):
        self.proc = subprocess.Popen(["codex", "app-server"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL, text=True, bufsize=1)
        threading.Thread(target=self.read, args=(self.proc,), daemon=True).start()
        self.request("initialize", {"clientInfo": {"name": "revibe-llm-bridge", "version": "1"}}, 30)
        self.send({"jsonrpc": "2.0", "method": "initialized"})
        global MODEL
        if not MODEL:
            try:
                models = self.request("model/list", {}, 30).get("data", [])
                fast = [m for m in models if not m.get("hidden")
                        and "image" in m.get("inputModalities", ["image"])
                        and re.search(r"\b(fast|affordable|efficient|mini|small)\b", m.get("description", ""), re.I)]
                if fast:
                    MODEL = fast[0]["id"]
                    log(f"codex model: {MODEL} ({fast[0].get('description', '')})")
            except Exception as e:
                log(f"could not list codex models ({e}); using Codex's default model")

    def send(self, msg):
        with self.lock:
            self.proc.stdin.write(json.dumps(msg) + "\n")
            self.proc.stdin.flush()

    def read(self, proc):
        for line in proc.stdout:
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            if "id" in msg and "method" in msg:   # the server asks for approval: refuse
                self.send({"jsonrpc": "2.0", "id": msg["id"],
                           "error": {"code": -32601, "message": "not supported by the bridge"}})
            elif "id" in msg:
                box = self.waiting.pop(msg["id"], None)
                if box:
                    box.put(msg)
            else:
                box = self.threads.get((msg.get("params") or {}).get("threadId"))
                if box:
                    box.put(msg)
        for box in list(self.waiting.values()) + list(self.threads.values()):
            box.put({"error": {"message": "codex app-server stopped"}})

    def request(self, method, params, timeout=TIMEOUT):
        box = queue.Queue()
        with self.lock:
            self.next_id += 1
            rid = self.next_id
            self.waiting[rid] = box
        self.send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
        msg = box.get(timeout=timeout)
        if "error" in msg:
            raise RuntimeError(msg["error"].get("message", str(msg["error"])))
        return msg["result"]

    def call(self, system, parts, cwd):
        if self.proc is None or self.proc.poll() is not None:
            self.start()
        inputs, n = [], 0
        for p in parts:
            if p[0] == "text":
                inputs.append({"type": "text", "text": p[1]})
            else:
                n += 1
                path = Path(cwd) / f"image-{n}{EXT.get(p[1], '.png')}"
                path.write_bytes(p[2])
                inputs.append({"type": "localImage", "path": str(path)})
        thread = self.request("thread/start", {
            "baseInstructions": f"{CODEX_PREAMBLE}\n\n{system or DEFAULT_SYSTEM}",
            "ephemeral": True, "sandbox": "read-only", "approvalPolicy": "never", "cwd": cwd,
            "model": MODEL}, 60)
        tid = thread["thread"]["id"]
        box = self.threads[tid] = queue.Queue()
        try:
            self.request("turn/start", {"threadId": tid, "input": inputs, "effort": EFFORT}, 60)
            answer, deadline = None, time.time() + TIMEOUT
            while True:
                msg = box.get(timeout=max(1, deadline - time.time()))
                method, params = msg.get("method"), msg.get("params") or {}
                if "error" in msg and not method:
                    raise RuntimeError(msg["error"]["message"])
                if method == "item/completed" and params.get("item", {}).get("type") == "agentMessage":
                    answer = params["item"].get("text", "")
                elif method == "error" and not params.get("willRetry"):
                    raise RuntimeError(json.dumps(params.get("error"))[:500])
                elif method == "turn/completed":
                    turn = params.get("turn") or {}
                    if turn.get("status") != "completed":
                        raise RuntimeError(json.dumps(turn.get("error") or turn.get("status"))[:500])
                    return (answer or "").strip()
        finally:
            self.threads.pop(tid, None)
            try:
                self.send({"jsonrpc": "2.0", "id": 0, "method": "thread/unsubscribe", "params": {"threadId": tid}})
            except Exception:
                pass


CODEX_SERVER = CodexServer()


def call_codex_fast(system, parts, cwd):
    if not CODEX_SERVER.failed:
        try:
            return CODEX_SERVER.call(system, parts, cwd)
        except queue.Empty:
            raise RuntimeError(f"codex did not answer within {TIMEOUT} seconds")
        except Exception as e:
            if CODEX_SERVER.proc is None or CODEX_SERVER.proc.poll() is not None or "not supported" in str(e):
                CODEX_SERVER.failed = True
                log(f"codex app-server unavailable ({e}); using codex exec from now on")
            else:
                raise
    return call_codex(system, parts, cwd)


def clean_json(text):
    t = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", text.strip())
    try:
        json.loads(t)
        return t
    except ValueError:
        m = re.search(r"[\[{].*[\]}]", t, re.S)
        return m.group(0) if m else t


def complete(system, turns, wants_json):
    parts = flatten(turns)
    if wants_json:
        system = (system + "\n\n" if system else "") + JSON_NOTE
    key = None
    if CACHE:
        h = hashlib.sha256(json.dumps([BACKEND, MODEL, system]).encode())
        for p in parts:
            h.update(p[1].encode() if p[0] == "text" else p[2])
        key = CACHE / (h.hexdigest() + ".txt")
        if key.exists():
            return key.read_text(), True
    with SLOTS:
        cwd = tempfile.mkdtemp(prefix="llm-bridge-")
        try:
            text = (call_claude if BACKEND == "claude" else call_codex_fast)(system, parts, cwd)
        finally:
            shutil.rmtree(cwd, ignore_errors=True)
    if wants_json:
        text = clean_json(text)
    if key:
        CACHE.mkdir(exist_ok=True)
        key.write_text(text)
    return text, False


# ---------------------------------------------------------------- responses


def openai_response(text, stream):
    rid, now, model = f"chatcmpl-bridge-{counter}", int(time.time()), MODEL or BACKEND
    if not stream:
        return {"id": rid, "object": "chat.completion", "created": now, "model": model,
                "choices": [{"index": 0, "message": {"role": "assistant", "content": text},
                             "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}
    chunk = {"id": rid, "object": "chat.completion.chunk", "created": now, "model": model}
    return [dict(chunk, choices=[{"index": 0, "delta": {"role": "assistant", "content": text},
                                  "finish_reason": None}]),
            dict(chunk, choices=[{"index": 0, "delta": {}, "finish_reason": "stop"}]),
            "[DONE]"]


def anthropic_response(text, stream):
    msg = {"id": f"msg_bridge_{counter}", "type": "message", "role": "assistant",
           "model": MODEL or BACKEND, "content": [{"type": "text", "text": text}],
           "stop_reason": "end_turn", "stop_sequence": None,
           "usage": {"input_tokens": 0, "output_tokens": 0}}
    if not stream:
        return msg
    start = dict(msg, content=[], stop_reason=None)
    return [("message_start", {"type": "message_start", "message": start}),
            ("content_block_start", {"type": "content_block_start", "index": 0,
                                     "content_block": {"type": "text", "text": ""}}),
            ("content_block_delta", {"type": "content_block_delta", "index": 0,
                                     "delta": {"type": "text_delta", "text": text}}),
            ("content_block_stop", {"type": "content_block_stop", "index": 0}),
            ("message_delta", {"type": "message_delta", "delta": {"stop_reason": "end_turn",
                               "stop_sequence": None}, "usage": {"output_tokens": 0}}),
            ("message_stop", {"type": "message_stop"})]


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def send_json(self, status, obj):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.cors()
        self.end_headers()
        self.wfile.write(data)

    def send_events(self, events, named):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.cors()
        self.end_headers()
        for e in events:
            if named:
                self.wfile.write(f"event: {e[0]}\ndata: {json.dumps(e[1])}\n\n".encode())
            else:
                self.wfile.write(f"data: {e if isinstance(e, str) else json.dumps(e)}\n\n".encode())
        self.wfile.flush()

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip("/").endswith("/health"):
            self.send_json(200, {"ok": True, "backend": BACKEND, "model": MODEL or "default"})
        else:
            self.send_json(404, {"error": {"message": "Use POST /v1/chat/completions or /v1/messages"}})

    def do_POST(self):
        global counter
        path = self.path.split("?")[0].rstrip("/")
        if path.endswith("/chat/completions"):
            parse, respond, named = openai_request, openai_response, False
        elif path.endswith("/messages"):
            parse, respond, named = anthropic_request, anthropic_response, True
        else:
            return self.send_json(404, {"error": {"message": f"Unknown path {self.path}"}})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            system, turns, wants_json = parse(body)
            if not turns:
                raise ValueError("The request has no messages.")
        except Exception as e:
            return self.send_json(400, {"error": {"message": str(e), "type": "invalid_request_error"}})
        if body.get("tools") or body.get("functions"):
            log("tool definitions in the request are ignored; the model replies in text")
        started = time.time()
        try:
            text, cached = complete(system, turns, wants_json)
        except Exception as e:
            log(f"{BACKEND} call failed: {e}")
            return self.send_json(502, {"error": {"message": f"{BACKEND} call failed: {e}",
                                                  "type": "bridge_error"}})
        counter += 1
        log(f"{BACKEND} {'cache' if cached else f'{time.time() - started:.1f}s'}, {len(text)} characters")
        out = respond(text, bool(body.get("stream")))
        if body.get("stream"):
            self.send_events(out, named)
        else:
            self.send_json(200, out)

    def log_message(self, *args):
        pass


def log(msg):
    print(f"[bridge {time.strftime('%H:%M:%S')}] {msg}", flush=True)


def main():
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        sys.exit(f"Port {PORT} is in use. A bridge may already be running "
                 f"(check http://localhost:{PORT}/health), or give another port: python3 llm-bridge/bridge.py {BACKEND} 8788")
    if BACKEND == "codex":
        try:
            CODEX_SERVER.start()
        except Exception as e:
            CODEX_SERVER.failed = True
            log(f"codex app-server unavailable ({e}); using codex exec")
    log(f"http://localhost:{PORT}  backend={BACKEND}  model={MODEL or 'default'}")
    log(f"OpenAI SDK: base URL http://localhost:{PORT}/v1   Anthropic SDK: base URL http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
