#!/usr/bin/env python3
"""VideoDiff server: serves the web app and the videos, stores projects, and
runs the AI (ai.py) through the workshop's LLM bridge.

    python3 revibes/videodiff/app/server.py          # http://localhost:8030
    python3 revibes/videodiff/app/server.py 8031     # another port

Only the Python 3 standard library is needed.
"""

import json
import mimetypes
import os
import re
import sys
import threading
import traceback
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

import ai

APP_DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(APP_DIR, "..", "..", ".."))
MATERIALS = os.path.join(REPO, "papers", "videodiff", "materials")
STATIC = os.path.join(APP_DIR, "static")
DATA = os.path.join(APP_DIR, "data")
UPLOADS = os.path.join(DATA, "uploads")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8030))
# 127.0.0.1 = this computer only; HOST=0.0.0.0 lets others on the network open it by your IP address
HOST = os.environ.get("HOST", "127.0.0.1")

LOCK = threading.Lock()
BROLL_INDEX = json.load(open(os.path.join(MATERIALS, "broll", "index.json")))

TITLES = {
    "pheasant-howto": "How to cook a pheasant (how-to, 4:58)",
    "cinema-museum-tour": "At the Cinema Museum (tour, 4:28)",
}


# --------------------------------------------------------------------------
# Projects: the provided videos plus uploads
# --------------------------------------------------------------------------

def list_projects():
    out = []
    vids = os.path.join(MATERIALS, "videos")
    for f in sorted(os.listdir(vids)):
        pid = os.path.splitext(f)[0]
        if f.endswith(".mp4") and os.path.exists(os.path.join(MATERIALS, "transcripts", pid + ".json")):
            out.append({"id": pid, "title": TITLES.get(pid, pid), "builtin": True})
    if os.path.isdir(UPLOADS):
        for pid in sorted(os.listdir(UPLOADS)):
            meta = os.path.join(UPLOADS, pid, "meta.json")
            if os.path.exists(meta) and os.path.exists(os.path.join(UPLOADS, pid, "transcript.json")):
                m = json.load(open(meta))
                out.append({"id": pid, "title": m["title"], "builtin": False})
    return out


def project_paths(pid):
    if not re.fullmatch(r"[A-Za-z0-9_-]+", pid):
        raise KeyError(pid)
    up = os.path.join(UPLOADS, pid)
    if os.path.isdir(up):
        m = json.load(open(os.path.join(up, "meta.json")))
        return {"video_url": f"/media/uploads/{pid}/{m['video']}", "transcript": os.path.join(up, "transcript.json"),
                "title": m["title"]}
    t = os.path.join(MATERIALS, "transcripts", pid + ".json")
    if not os.path.exists(t):
        raise KeyError(pid)
    return {"video_url": f"/media/videos/{pid}.mp4", "transcript": t, "title": TITLES.get(pid, pid)}


def load_segments(pid):
    tr = json.load(open(project_paths(pid)["transcript"]))
    segs = []
    for s in tr["segments"]:
        if not s.get("text", "").strip():
            continue
        segs.append({"start": float(s["start"]), "end": float(s["end"]), "text": s["text"].strip(),
                     "words": [{"w": w["word"].strip(), "s": float(w["start"]), "e": float(w["end"])}
                               for w in s.get("words", []) if "start" in w]})
    return segs


def pdir(pid):
    d = os.path.join(DATA, "projects", pid)
    os.makedirs(d, exist_ok=True)
    return d


def read_json(path, default=None):
    try:
        return json.load(open(path))
    except (OSError, ValueError):
        return default


def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=1)
    os.replace(tmp, path)


def srt_to_segments(text):
    segs = []
    for block in re.split(r"\n\s*\n", text.replace("\r", "").strip()):
        lines = block.strip().split("\n")
        for k, line in enumerate(lines):
            m = re.match(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)", line)
            if m:
                g = [int(x) for x in m.groups()]
                st = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
                en = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
                txt = " ".join(lines[k + 1:]).strip()
                if txt:
                    segs.append({"start": st, "end": en, "text": " " + txt, "words": []})
                break
    return segs


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if "/media/" not in (args[0] if args else ""):
            sys.stderr.write("%s\n" % (fmt % args))

    # helpers
    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def send_file(self, path):
        if not os.path.isfile(path):
            return self.send_json({"error": "not found"}, 404)
        size = os.path.getsize(path)
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        rng = self.headers.get("Range")
        start, end = 0, size - 1
        code = 200
        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)", rng)
            if m:
                if m.group(1):
                    start = int(m.group(1))
                    if m.group(2):
                        end = min(int(m.group(2)), size - 1)
                elif m.group(2):
                    start = max(0, size - int(m.group(2)))
                code = 206
        if start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if code == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        if path.startswith(STATIC):
            self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        try:
            with open(path, "rb") as f:
                f.seek(start)
                left = end - start + 1
                while left > 0:
                    chunk = f.read(min(1 << 16, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def safe_join(self, root, rel):
        p = os.path.abspath(os.path.join(root, unquote(rel)))
        if not p.startswith(os.path.abspath(root) + os.sep):
            raise KeyError(rel)
        return p

    # routes
    def do_GET(self):
        u = urlparse(self.path)
        path = u.path
        try:
            if path in ("/", "/index.html"):
                return self.send_file(os.path.join(STATIC, "index.html"))
            if path.startswith("/static/"):
                return self.send_file(self.safe_join(STATIC, path[len("/static/"):]))
            if path.startswith("/media/videos/"):
                return self.send_file(self.safe_join(os.path.join(MATERIALS, "videos"), path[len("/media/videos/"):]))
            if path.startswith("/media/broll/"):
                return self.send_file(self.safe_join(os.path.join(MATERIALS, "broll"), path[len("/media/broll/"):]))
            if path.startswith("/media/uploads/"):
                return self.send_file(self.safe_join(UPLOADS, path[len("/media/uploads/"):]))
            if path == "/api/projects":
                return self.send_json(list_projects())
            if path == "/api/health":
                try:
                    with urllib.request.urlopen(ai.BRIDGE_URL + "/health", timeout=3) as r:
                        return self.send_json({"bridge": json.loads(r.read()), "url": ai.BRIDGE_URL})
                except Exception as e:  # noqa: BLE001
                    return self.send_json({"bridge": None, "url": ai.BRIDGE_URL, "error": str(e)})
            m = re.fullmatch(r"/api/project/([\w-]+)", path)
            if m:
                pid = m.group(1)
                pp = project_paths(pid)
                d = pdir(pid)
                return self.send_json({
                    "id": pid, "title": pp["title"], "videoUrl": pp["video_url"],
                    "segments": load_segments(pid),
                    "analysis": read_json(os.path.join(d, "analysis.json")),
                    "state": read_json(os.path.join(d, "state.json")),
                })
            return self.send_json({"error": "not found"}, 404)
        except KeyError:
            return self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        u = urlparse(self.path)
        path = u.path
        q = parse_qs(u.query)
        try:
            m = re.fullmatch(r"/api/project/([\w-]+)/(analyze|state|reset)", path)
            if m:
                pid, action = m.groups()
                project_paths(pid)
                d = pdir(pid)
                if action == "analyze":
                    a = read_json(os.path.join(d, "analysis.json"))
                    if not a:
                        a = ai.analyze(load_segments(pid))
                        write_json(os.path.join(d, "analysis.json"), a)
                    return self.send_json(a)
                if action == "state":
                    state = json.loads(self.body() or b"{}")
                    with LOCK:
                        write_json(os.path.join(d, "state.json"), state)
                    return self.send_json({"ok": True})
                if action == "reset":
                    keep_analysis = q.get("analysis", ["keep"])[0] == "keep"
                    for f in ("state.json",) + (() if keep_analysis else ("analysis.json",)):
                        try:
                            os.remove(os.path.join(d, f))
                        except OSError:
                            pass
                    return self.send_json({"ok": True})
            if path == "/api/generate":
                req = json.loads(self.body())
                pid = req["project"]
                segs = load_segments(pid)
                analysis = read_json(os.path.join(pdir(pid), "analysis.json"))
                if not analysis:
                    return self.send_json({"error": "Analyse the video first."}, 400)
                secs = analysis["sections"]
                stage = req["stage"]
                if stage == "roughcut":
                    out = ai.gen_roughcut(segs, secs, req)
                elif stage == "broll":
                    out = ai.gen_broll(segs, secs, req, pid, BROLL_INDEX)
                else:
                    out = ai.gen_text(segs, secs, req)
                return self.send_json(out)
            if path == "/api/plan":
                req = json.loads(self.body())
                return self.send_json(ai.augment_plan(req["stage"]))
            if path == "/api/upload":
                # raw body upload: ?kind=video&name=...  then ?kind=transcript&id=...&name=...
                kind = q.get("kind", [""])[0]
                name = os.path.basename(q.get("name", ["file"])[0])
                if kind == "video":
                    pid = "upload-" + uuid.uuid4().hex[:8]
                    d = os.path.join(UPLOADS, pid)
                    os.makedirs(d, exist_ok=True)
                    ext = os.path.splitext(name)[1].lower() or ".mp4"
                    with open(os.path.join(d, "video" + ext), "wb") as f:
                        f.write(self.body())
                    title = q.get("title", [os.path.splitext(name)[0]])[0]
                    write_json(os.path.join(d, "meta.json"), {"title": title, "video": "video" + ext})
                    return self.send_json({"id": pid})
                if kind == "transcript":
                    pid = q["id"][0]
                    d = self.safe_join(UPLOADS, pid)
                    raw = self.body().decode("utf-8", errors="replace")
                    if name.lower().endswith(".srt"):
                        segs = srt_to_segments(raw)
                    else:
                        segs = json.loads(raw).get("segments", [])
                    if not segs:
                        return self.send_json({"error": "No transcript segments found. Use a Whisper JSON or SRT file."}, 400)
                    write_json(os.path.join(d, "transcript.json"), {"segments": segs})
                    return self.send_json({"id": pid, "segments": len(segs)})
            return self.send_json({"error": "not found"}, 404)
        except ai.LLMError as e:
            return self.send_json({"error": str(e)}, 502)
        except KeyError as e:
            return self.send_json({"error": f"missing or unknown: {e}"}, 400)
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            return self.send_json({"error": f"{type(e).__name__}: {e}"}, 500)


def main():
    os.makedirs(DATA, exist_ok=True)
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"VideoDiff running at http://localhost:{PORT}  (LLM bridge: {ai.BRIDGE_URL})")
    if HOST != "127.0.0.1":
        print(f"Listening on {HOST}: others on your network can open http://<your IP>:{PORT}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
