#!/usr/bin/env python3
"""Convenience launcher. Reuses a healthy Codex bridge and cleans up only children it starts."""
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
import json
import socket
from pathlib import Path
from server import ROOT, BRIDGE

REPO = ROOT.parents[2]
children = []


def health(url):
    try:
        with urllib.request.urlopen(url + '/health', timeout=2) as response:
            return json.load(response)
    except (urllib.error.URLError, ValueError, TimeoutError):
        return None


def main():
    import os
    if not (ROOT / 'public/vendor/babel.js').exists():
        if not shutil.which('npm'):
            raise RuntimeError('Install Node.js 20+ (including npm), then run this launcher again.')
        subprocess.run(['npm', 'ci', '--no-audit', '--no-fund'], cwd=ROOT, check=True)
        subprocess.run(['npm', 'run', 'setup'], cwd=ROOT, check=True)
    existing = health(BRIDGE)
    if existing and existing.get('backend') != 'codex':
        raise RuntimeError('The bridge is running with another backend. Stop it and run python3 llm-bridge/bridge.py codex from the repository root.')
    if not existing:
        if not shutil.which('codex'):
            raise RuntimeError('The codex command is missing. Install and sign in to Codex, then try again.')
        url = urllib.parse.urlparse(BRIDGE)
        port = url.port or 8787
        if url.hostname not in ('127.0.0.1', 'localhost'):
            raise RuntimeError('Start the configured remote bridge yourself before using this launcher.')
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1', port)) == 0:
                raise RuntimeError(f'Port {port} is occupied by another service. Configure a free bridge port in .env.')
        process = subprocess.Popen([sys.executable, str(REPO / 'llm-bridge/bridge.py'), 'codex', str(port)], cwd=REPO)
        children.append(process)
        for _ in range(40):
            if health(BRIDGE): break
            if process.poll() is not None: raise RuntimeError('The bridge could not start. Read its error above.')
            time.sleep(.25)
        else: raise RuntimeError('The bridge did not become ready. Try starting it manually.')
    port = int(os.environ.get('MISTY_PORT', '5173'))
    host = os.environ.get('MISTY_HOST', '127.0.0.1')
    process = subprocess.Popen([sys.executable, str(ROOT / 'server.py')], cwd=ROOT)
    children.append(process)
    url = f'http://{host}:{port}'
    for _ in range(30):
        if process.poll() is not None: raise RuntimeError('The app could not start. Try another MISTY_PORT in .env.')
        try:
            with urllib.request.urlopen(url, timeout=1): break
        except urllib.error.URLError: time.sleep(.2)
    print(f'Open {url}. Keep this terminal open. Press Ctrl+C to stop.', flush=True)
    if '--no-browser' not in sys.argv:
        webbrowser.open(url)
    process.wait()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as error:
        print(f'Misty could not launch: {error}', file=sys.stderr)
        sys.exitcode = 1
    finally:
        for process in reversed(children):
            if process.poll() is None:
                process.terminate()
                try: process.wait(timeout=5)
                except subprocess.TimeoutExpired: process.kill()
    sys.exit(getattr(sys, 'exitcode', 0))
