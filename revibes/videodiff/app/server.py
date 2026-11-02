#!/usr/bin/env python3
"""VideoDiff server.

Python standard library only. It
  * serves the browser app in public/,
  * serves the sample videos, transcripts and B-roll library from
    papers/videodiff/materials/ (with HTTP range requests so videos can seek),
  * accepts uploaded videos and transcripts (stored in data/uploads/),
  * saves each project's state (sections, keywords, all variations) in data/projects/,
  * searches the B-roll library by keyword (stand-in for a stock media API),
  * forwards LLM calls to the workshop LLM bridge (OpenAI chat format).

Usage:  python3 server.py [port]          (default port 8420)
Env:    BRIDGE_URL   default http://localhost:8787
"""
import json
import mimetypes
import os
import re
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

APP_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(APP_DIR, "public")
DATA_DIR = os.environ.get("VIDEODIFF_DATA", os.path.join(APP_DIR, "data"))
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
PROJECT_DIR = os.path.join(DATA_DIR, "projects")
REPO_ROOT = os.path.abspath(os.path.join(APP_DIR, "..", "..", ".."))
MATERIALS_DIR = os.environ.get(
    "VIDEODIFF_MATERIALS", os.path.join(REPO_ROOT, "papers", "videodiff", "materials")
)
BRIDGE_URL = os.environ.get("BRIDGE_URL", "http://localhost:8787").rstrip("/")

for d in (UPLOAD_DIR, PROJECT_DIR):
    os.makedirs(d, exist_ok=True)

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("video/mp4", ".mp4")
mimetypes.add_type("video/webm", ".webm")

SAFE_ID = re.compile(r"^[A-Za-z0-9_.-]+$")


def load_broll_index():
    path = os.path.join(MATERIALS_DIR, "broll", "index.json")
    try:
        with open(path) as f:
            return json.load(f)
    except OSError:
        return []


BROLL = load_broll_index()


def list_videos():
    """Bundled sample videos plus uploads. A video is usable when it has a transcript."""
    videos = []
    vdir = os.path.join(MATERIALS_DIR, "videos")
    tdir = os.path.join(MATERIALS_DIR, "transcripts")
    if os.path.isdir(vdir):
        for name in sorted(os.listdir(vdir)):
            stem, ext = os.path.splitext(name)
            if ext.lower() not in (".mp4", ".webm", ".mov"):
                continue
            videos.append({
                "id": stem,
                "title": stem.replace("-", " ").title(),
                "url": "/materials/videos/" + name,
                "transcriptUrl": "/materials/transcripts/" + stem + ".json",
                "hasTranscript": os.path.exists(os.path.join(tdir, stem + ".json")),
                "sample": True,
            })
    for name in sorted(os.listdir(UPLOAD_DIR)):
        stem, ext = os.path.splitext(name)
        if ext.lower() in (".json", ".srt"):
            continue
        tpath = os.path.join(UPLOAD_DIR, stem + ".json")
        videos.append({
            "id": stem,
            "title": stem.replace("-", " ").replace("_", " ").title(),
            "url": "/uploads/" + name,
            "transcriptUrl": "/uploads/" + stem + ".json",
            "hasTranscript": os.path.exists(tpath),
            "sample": False,
        })
    return videos


def parse_srt(text):
    """SRT -> Whisper-shaped JSON (segments without word timings)."""
    def ts(s):
        h, m, rest = s.strip().replace(",", ".").split(":")
        return int(h) * 3600 + int(m) * 60 + float(rest)

    segments = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = [l for l in block.strip().splitlines() if l.strip()]
        if len(lines) < 2:
            continue
        idx = 1 if "-->" in lines[1] else 0
        if "-->" not in lines[idx]:
            continue
        a, b = lines[idx].split("-->")
        segments.append({"start": ts(a), "end": ts(b), "text": " " + " ".join(lines[idx + 1:])})
    return {"text": "".join(s["text"] for s in segments), "segments": segments}


class Handler(BaseHTTPRequestHandler):
    server_version = "VideoDiff/1.0"

    def log_message(self, fmt, *args):
        if os.environ.get("VIDEODIFF_QUIET"):
            return
        sys.stderr.write("[videodiff] " + (fmt % args) + "\n")

    # ---------- helpers ----------
    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def send_file(self, path):
        if not os.path.isfile(path):
            return self.send_json({"error": "not found"}, 404)
        size = os.path.getsize(path)
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        rng = self.headers.get("Range")
        start, end = 0, size - 1
        status = 200
        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)", rng)
            if m:
                if m.group(1):
                    start = int(m.group(1))
                    if m.group(2):
                        end = min(int(m.group(2)), size - 1)
                elif m.group(2):
                    start = max(0, size - int(m.group(2)))
                status = 206
        if start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return
        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        if path.startswith(PUBLIC_DIR):
            self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        try:
            with open(path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(1 << 16, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    @staticmethod
    def safe_join(base, rel):
        p = os.path.abspath(os.path.join(base, rel))
        return p if p.startswith(os.path.abspath(base) + os.sep) else None

    # ---------- routes ----------
    def do_GET(self):
        url = urlparse(self.path)
        path = unquote(url.path)
        qs = parse_qs(url.query)

        if path == "/api/videos":
            return self.send_json(list_videos())
        if path == "/api/health":
            return self.send_json(self.bridge_health())
        if path == "/api/broll":
            video = (qs.get("video") or [""])[0]
            items = [b for b in BROLL if not video or b.get("video") == video]
            return self.send_json(items)
        if path.startswith("/api/projects/"):
            pid = path[len("/api/projects/"):]
            if not SAFE_ID.match(pid):
                return self.send_json({"error": "bad id"}, 400)
            p = os.path.join(PROJECT_DIR, pid + ".json")
            if not os.path.exists(p):
                return self.send_json(None)
            with open(p) as f:
                return self.send_json(json.load(f))
        if path.startswith("/materials/"):
            p = self.safe_join(MATERIALS_DIR, path[len("/materials/"):])
            return self.send_file(p) if p else self.send_json({"error": "bad path"}, 400)
        if path.startswith("/uploads/"):
            p = self.safe_join(UPLOAD_DIR, path[len("/uploads/"):])
            return self.send_file(p) if p else self.send_json({"error": "bad path"}, 400)

        rel = "index.html" if path in ("", "/") else path.lstrip("/")
        p = self.safe_join(PUBLIC_DIR, rel)
        return self.send_file(p) if p else self.send_json({"error": "bad path"}, 400)

    def do_PUT(self):
        path = urlparse(self.path).path
        if path.startswith("/api/projects/"):
            pid = path[len("/api/projects/"):]
            if not SAFE_ID.match(pid):
                return self.send_json({"error": "bad id"}, 400)
            data = json.loads(self.read_body() or b"null")
            tmp = os.path.join(PROJECT_DIR, pid + ".json.tmp")
            with open(tmp, "w") as f:
                json.dump(data, f)
            os.replace(tmp, os.path.join(PROJECT_DIR, pid + ".json"))
            return self.send_json({"ok": True})
        self.send_json({"error": "not found"}, 404)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith("/api/projects/"):
            pid = path[len("/api/projects/"):]
            if SAFE_ID.match(pid):
                p = os.path.join(PROJECT_DIR, pid + ".json")
                if os.path.exists(p):
                    os.remove(p)
            return self.send_json({"ok": True})
        self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        url = urlparse(self.path)
        path = url.path
        qs = parse_qs(url.query)

        if path == "/api/llm":
            return self.proxy_llm(self.read_body())

        if path == "/api/upload":
            # Raw body upload: /api/upload?name=my-video.mp4
            name = os.path.basename((qs.get("name") or ["video.mp4"])[0])
            stem, ext = os.path.splitext(name)
            stem = re.sub(r"[^A-Za-z0-9_-]+", "-", stem).strip("-") or "video"
            ext = ext.lower() if ext.lower() in (".mp4", ".webm", ".mov") else ".mp4"
            dest = os.path.join(UPLOAD_DIR, stem + ext)
            remaining = int(self.headers.get("Content-Length") or 0)
            with open(dest, "wb") as f:
                while remaining > 0:
                    chunk = self.rfile.read(min(1 << 20, remaining))
                    if not chunk:
                        break
                    f.write(chunk)
                    remaining -= len(chunk)
            return self.send_json({"id": stem})

        if path == "/api/upload-transcript":
            # /api/upload-transcript?id=<video id>&format=json|srt
            vid = (qs.get("id") or [""])[0]
            fmt = (qs.get("format") or ["json"])[0]
            if not SAFE_ID.match(vid):
                return self.send_json({"error": "bad id"}, 400)
            raw = self.read_body().decode("utf-8", "replace")
            try:
                data = parse_srt(raw) if fmt == "srt" else json.loads(raw)
                assert isinstance(data.get("segments"), list) and data["segments"]
            except Exception:
                return self.send_json({"error": "Transcript must be Whisper JSON (with segments) or SRT."}, 400)
            with open(os.path.join(UPLOAD_DIR, vid + ".json"), "w") as f:
                json.dump(data, f)
            return self.send_json({"ok": True})

        self.send_json({"error": "not found"}, 404)

    # ---------- LLM bridge ----------
    def bridge_health(self):
        try:
            with urllib.request.urlopen(BRIDGE_URL + "/health", timeout=3) as r:
                info = json.loads(r.read() or b"{}")
            return {"ok": True, "bridge": BRIDGE_URL, "info": info}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "bridge": BRIDGE_URL, "error": str(e)}

    def proxy_llm(self, body):
        req = urllib.request.Request(
            BRIDGE_URL + "/v1/chat/completions",
            data=body,
            headers={"Content-Type": "application/json", "Authorization": "Bearer bridge"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=330) as r:
                data = r.read()
                status = r.status
        except urllib.error.HTTPError as e:
            data, status = e.read(), e.code
        except Exception as e:  # noqa: BLE001
            return self.send_json({"error": f"LLM bridge not reachable at {BRIDGE_URL}: {e}"}, 502)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8420))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"VideoDiff running at http://localhost:{port}")
    print(f"  materials: {MATERIALS_DIR}")
    print(f"  LLM bridge: {BRIDGE_URL}  (start it with: python3 llm-bridge/bridge.py claude)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
