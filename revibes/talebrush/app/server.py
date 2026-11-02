#!/usr/bin/env python3
"""Run with python3 server.py. Python standard library only."""
import argparse
import json
import mimetypes
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from story import StoryError, bridge_health, generate, recognize

mimetypes.add_type("text/javascript", ".mjs")
STATIC = Path(__file__).parent / "static"


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def respond(self, status, body):
        raw = json.dumps(body, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == "/api/health":
            self.respond(200, bridge_health())
        elif self.path.startswith("/api/"):
            self.respond(404, {"error": "Unknown endpoint."})
        else:
            super().do_GET()

    def do_POST(self):
        if self.path not in ("/api/generate", "/api/recognize"):
            return self.respond(404, {"error": "Unknown endpoint."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 200_000:
                raise StoryError("Request is empty or too large.")
            if self.headers.get_content_type() != "application/json":
                raise StoryError("Send application/json.")
            origin = self.headers.get("Origin")
            if origin and origin not in (f"http://localhost:{self.server.server_port}", f"http://127.0.0.1:{self.server.server_port}"):
                return self.respond(403, {"error": "Use TaleBrush from its local address."})
            body = json.loads(self.rfile.read(length))
            result = generate(body) if self.path == "/api/generate" else recognize(body)
            self.respond(200, result)
        except (StoryError, json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
            self.respond(400, {"error": str(error)})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self.respond(500, {"error": "The request failed. Your draft is safe. Check the server terminal."})
            raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5173)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(STATIC)))
    print(f"TaleBrush: http://localhost:{args.port}", flush=True)
    print("LLM bridge must use Codex. No API key required.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nTaleBrush stopped.")
    finally:
        server.server_close()
