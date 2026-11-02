#!/usr/bin/env python3
"""Selenite revibe: web server.

Serves the reading interface (static/) and a JSON API that fetches pages,
runs the paper's language-model tasks through the LLM bridge and stores
topics, criteria, options and reading progress in data/db.json.

    python3 server.py            # http://localhost:8790
    PORT=8791 python3 server.py
"""
import json
import os
import re
import sys
import threading
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from selenite import extract, llm, pipeline  # noqa: E402
from selenite.store import Store, new_id  # noqa: E402

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")
SAMPLES = os.path.join(ROOT, "samples")
PORT = int(os.environ.get("PORT", "8790"))
STORE = Store(os.path.join(ROOT, "data", "db.json"))
LOCK = threading.RLock()


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def log(msg):
    print(f"[selenite] {msg}", flush=True)


def topic_payload(t):
    return t


def page_payload(p):
    t = STORE.topic(p["topic_id"]) if p.get("topic_id") else None
    return {"page": p, "topic": t}


def find_criterion(topic, cid):
    for c in topic["criteria"]:
        if c["id"] == cid:
            return c
    raise ApiError(404, "criterion not found")


def find_option(topic, oid):
    for o in topic["options"]:
        if o["id"] == oid:
            return o
    raise ApiError(404, "option not found")


def rename_in_annotations(topic, key, old, new):
    """Rename (new) or remove (new=None) a label in all paragraph annotations."""
    for pid in topic["pages"]:
        p = STORE.page(pid)
        if not p:
            continue
        for para in p["paragraphs"]:
            labels = para.get(key) or []
            out = []
            for lab in labels:
                if lab["name"].lower() == old.lower():
                    if new is None:
                        continue
                    lab = dict(lab, name=new)
                out.append(lab)
            para[key] = out
            if key == "criteria" and para.get("zoom"):
                para["zoom"] = [dict(z, criterion=new) if z["criterion"].lower() == old.lower() else z
                                for z in para["zoom"] if not (new is None and z["criterion"].lower() == old.lower())]
        if key == "options":
            p["options"] = [new if o.lower() == old.lower() else o for o in p.get("options", []) if not (new is None and o.lower() == old.lower())]


def add_topic_option(topic, name, page_id=None):
    for o in topic["options"]:
        if o["name"].lower() == name.strip().lower():
            if page_id and page_id not in o["pages"]:
                o["pages"].append(page_id)
            return o
    o = {"id": new_id("opt"), "name": name.strip(), "pinned": False,
         "pages": [page_id] if page_id else []}
    topic["options"].append(o)
    return o


def add_topic_criterion(topic, name, description):
    for c in topic["criteria"]:
        if c["name"].lower() == name.strip().lower():
            return c
    c = {"id": new_id("crit"), "name": name.strip(), "description": description.strip(),
         "pinned": False, "source": "model"}
    topic["criteria"].append(c)
    return c


def load_samples():
    out = []
    if not os.path.isdir(SAMPLES):
        return out
    for fn in sorted(os.listdir(SAMPLES)):
        if fn.endswith(".json"):
            with open(os.path.join(SAMPLES, fn), encoding="utf-8") as f:
                d = json.load(f)
            out.append({"id": fn[:-5], "title": d["title"], "url": d.get("url", ""),
                        "note": d.get("note", "")})
    return out


# --------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------
class Api:
    def __init__(self):
        self.routes = []
        for name in dir(self):
            fn = getattr(self, name)
            if callable(fn) and getattr(fn, "_route", None):
                m, pat = fn._route
                self.routes.append((m, re.compile("^" + pat + "$"), fn))

    def dispatch(self, method, path, body):
        for m, pat, fn in self.routes:
            mo = pat.match(path)
            if mo and m == method:
                return fn(body, **mo.groupdict())
        raise ApiError(404, f"no route for {method} {path}")


def route(method, pattern):
    def deco(fn):
        fn._route = (method, pattern)
        return fn
    return deco


class SeleniteApi(Api):
    # ---- general ----------------------------------------------------------
    @route("GET", "/api/health")
    def health(self, body):
        return {"ok": True, "bridge": llm.health(), "bridge_url": llm.BRIDGE_URL}

    @route("GET", "/api/state")
    def state(self, body):
        pages = [{"id": p["id"], "title": p["title"], "url": p.get("url", ""),
                  "topic_id": p.get("topic_id"), "created": p["created"],
                  "n_paragraphs": len(p["paragraphs"]), "n_read": len(p.get("read", []))}
                 for p in STORE.pages()]
        return {"topics": STORE.topics(), "pages": pages, "samples": load_samples()}

    # ---- pages ------------------------------------------------------------
    @route("POST", "/api/pages")
    def create_page(self, body):
        url, title, source = "", body.get("title") or "", "url"
        if body.get("sample"):
            fn = os.path.join(SAMPLES, re.sub(r"[^a-z0-9_-]", "", body["sample"]) + ".json")
            if not os.path.exists(fn):
                raise ApiError(404, "sample not found")
            with open(fn, encoding="utf-8") as f:
                d = json.load(f)
            title, url, source = d["title"], d.get("url", ""), "sample"
            paras = [{"tag": p.get("tag", "p"), "text": p["text"]} if isinstance(p, dict)
                     else {"tag": "p", "text": p} for p in d["paragraphs"]]
        elif body.get("url"):
            url = body["url"].strip()
            try:
                url, html_text = extract.fetch_url(url)
            except Exception as e:  # noqa: BLE001
                raise ApiError(502, f"could not fetch the page ({e}). You can paste its text instead.")
            t, paras = extract.paragraphs_from_html(html_text)
            title = title or t or url
        elif body.get("text"):
            source = "text"
            text = body["text"]
            if "<html" in text.lower() or "<body" in text.lower() or "<p" in text.lower():
                t, paras = extract.paragraphs_from_html(text)
                title = title or t
            else:
                paras = extract.paragraphs_from_text(text)
            title = title or (paras[0]["text"] if paras else "Untitled page")
            url = body.get("url", "")
        else:
            raise ApiError(400, "give a url, text or sample")
        if not paras:
            raise ApiError(422, "no readable paragraphs were found on that page")
        paragraphs = [{"index": i, "tag": p["tag"], "text": p["text"], "criteria": [],
                       "options": [], "annotated": False, "zoom": None}
                      for i, p in enumerate(paras)]
        page = STORE.create_page({"url": url, "title": title, "source": source,
                                  "paragraphs": paragraphs})
        log(f"page {page['id']}: '{title}' with {len(paragraphs)} paragraphs")
        return page_payload(page)

    @route("GET", r"/api/pages/(?P<pid>[^/]+)")
    def get_page(self, body, pid):
        p = STORE.page(pid)
        if not p:
            raise ApiError(404, "page not found")
        return page_payload(p)

    @route("DELETE", r"/api/pages/(?P<pid>[^/]+)")
    def delete_page(self, body, pid):
        with LOCK:
            STORE.delete_page(pid)
        return {"ok": True}

    @route("POST", r"/api/pages/(?P<pid>[^/]+)/topic")
    def page_topic(self, body, pid):
        """Recognize the page's topic (D.1) and cluster it with existing topics,
        or assign it to the topic given in body.topic_id / body.new_topic."""
        p = STORE.page(pid)
        if not p:
            raise ApiError(404, "page not found")
        if body.get("topic_id"):
            t = STORE.topic(body["topic_id"])
            if not t:
                raise ApiError(404, "topic not found")
        elif body.get("new_topic"):
            t = STORE.create_topic(body["new_topic"].strip())
        else:
            texts = [q["text"] for q in p["paragraphs"] if q["tag"] == "p"][:5] or \
                    [q["text"] for q in p["paragraphs"]][:5]
            phrase, about = pipeline.recognize_topic(p["title"], texts)
            p["topic_about"] = about
            p["recognized_topic"] = phrase
            existing = [t["name"] for t in STORE.topics()]
            match = pipeline.match_topic(phrase, existing)
            if match:
                t = next(t for t in STORE.topics() if t["name"] == match)
                log(f"page {pid}: topic '{phrase}' clustered into '{match}'")
            else:
                t = STORE.create_topic(phrase)
                log(f"page {pid}: new topic '{phrase}'")
        with LOCK:
            old = p.get("topic_id")
            if old and old != t["id"]:
                # moving pages between topics: forget old annotations (criteria differ)
                ot = STORE.topic(old)
                if ot:
                    for o in ot["options"]:
                        if pid in o["pages"]:
                            o["pages"].remove(pid)
                for q in p["paragraphs"]:
                    q["criteria"], q["options"], q["annotated"], q["zoom"] = [], [], False, None
                p["recommendations"] = []
                for name in p.get("options", []):
                    add_topic_option(t, name, pid)
            STORE.assign_page(pid, t["id"])
        return page_payload(p)

    @route("POST", r"/api/pages/(?P<pid>[^/]+)/options")
    def page_options(self, body, pid):
        p = STORE.page(pid)
        t = STORE.topic(p.get("topic_id") or "")
        if not t:
            raise ApiError(400, "assign the page to a topic first")
        options, verdict = pipeline.extract_options(p["title"], [q["text"] for q in p["paragraphs"]])
        with LOCK:
            p["options"] = options
            p["options_verdict"] = verdict
            for name in options:
                add_topic_option(t, name, pid)
            STORE.save()
        log(f"page {pid}: {len(options)} options")
        return page_payload(p)

    @route("POST", r"/api/pages/(?P<pid>[^/]+)/annotate")
    def page_annotate(self, body, pid):
        """Annotate the given paragraph indices (default: all not yet annotated).
        body.criteria_ids restricts to a subset of criteria (used after adding
        criteria) and merges the result with existing labels."""
        p = STORE.page(pid)
        t = STORE.topic(p.get("topic_id") or "")
        if not t:
            raise ApiError(400, "assign the page to a topic first")
        indices = body.get("indices")
        if indices is None:
            indices = [q["index"] for q in p["paragraphs"] if not q["annotated"]]
        criteria = t["criteria"]
        subset = body.get("criteria_ids")
        if subset:
            criteria = [c for c in criteria if c["id"] in set(subset)]
        options = [o["name"] for o in t["options"]]
        batch = [(i, p["paragraphs"][i]["text"]) for i in indices if 0 <= i < len(p["paragraphs"])]
        if not batch:
            return {"paragraphs": []}
        result = pipeline.annotate_paragraphs(batch, criteria, options)
        with LOCK:
            for i, labels in result.items():
                para = p["paragraphs"][i]
                if subset:
                    keep = [c for c in para["criteria"] if c["name"] not in {x["name"] for x in labels["criteria"]}]
                    para["criteria"] = sorted(keep + labels["criteria"], key=lambda x: -x["score"])
                else:
                    para["criteria"] = labels["criteria"]
                    para["options"] = labels["options"]
                para["annotated"] = True
                for lab in labels["options"]:
                    if lab["name"].lower() not in {o.lower() for o in p["options"]}:
                        p["options"].append(lab["name"])
                        add_topic_option(t, lab["name"], pid)
            STORE.save()
        return {"paragraphs": [p["paragraphs"][i] for i in result], "topic": t,
                "page_options": p["options"]}

    @route("POST", r"/api/pages/(?P<pid>[^/]+)/paragraphs/(?P<idx>\d+)/zoom")
    def page_zoom(self, body, pid, idx):
        p = STORE.page(pid)
        t = STORE.topic(p.get("topic_id") or "")
        para = p["paragraphs"][int(idx)]
        if para.get("zoom") and not body.get("force"):
            return {"paragraph": para}
        names = {c["name"] for c in para["criteria"]}
        criteria = [c for c in t["criteria"] if c["name"] in names] or t["criteria"]
        options = p.get("options") or [o["name"] for o in t["options"]]
        phrases = pipeline.zoom_in(para["text"], criteria, options)
        with LOCK:
            para["zoom"] = phrases
            STORE.save()
        return {"paragraph": para}

    @route("POST", r"/api/pages/(?P<pid>[^/]+)/reading")
    def page_reading(self, body, pid):
        p = STORE.page(pid)
        with LOCK:
            p["read"] = sorted({int(i) for i in body.get("read", [])})
            STORE.save()
        return {"ok": True}

    @route("POST", r"/api/pages/(?P<pid>[^/]+)/recommend")
    def page_recommend(self, body, pid):
        """Summary block: criteria to search for next (D3)."""
        p = STORE.page(pid)
        t = STORE.topic(p.get("topic_id") or "")
        if not t:
            raise ApiError(400, "no topic")
        seen = set()
        for other_id in t["pages"]:
            op = STORE.page(other_id)
            if op:
                for q in op["paragraphs"]:
                    seen.update(c["name"] for c in q["criteria"])
        candidates = [c["name"] for c in t["criteria"] if c["name"] not in seen]
        cared, skipped = body.get("cared", []), body.get("skipped", [])
        rec = pipeline.recommend(t["name"], t["criteria"], cared, skipped, candidates, n=2)
        with LOCK:
            p["recommendations"] = rec
            STORE.save()
        return {"recommended": rec, "unseen": candidates}

    # ---- topics -----------------------------------------------------------
    @route("POST", "/api/topics")
    def create_topic(self, body):
        name = (body.get("name") or "").strip()
        if not name:
            raise ApiError(400, "name required")
        return STORE.create_topic(name)

    @route("PATCH", r"/api/topics/(?P<tid>[^/]+)")
    def rename_topic(self, body, tid):
        t = STORE.topic(tid)
        if not t:
            raise ApiError(404, "topic not found")
        with LOCK:
            if body.get("name", "").strip():
                t["name"] = body["name"].strip()
            STORE.save()
        return t

    @route("DELETE", r"/api/topics/(?P<tid>[^/]+)")
    def delete_topic(self, body, tid):
        with LOCK:
            STORE.delete_topic(tid)
        return {"ok": True}

    @route("POST", r"/api/topics/(?P<tid>[^/]+)/criteria/generate")
    def generate_criteria(self, body, tid):
        t = STORE.topic(tid)
        if t["criteria"] and not body.get("force"):
            return t
        with LOCK:
            t["criteria_status"] = "generating"
        try:
            crits = pipeline.generate_criteria(t["name"], log=log)
            order = pipeline.rank_criteria(t["name"], crits)
            rank = {n: i for i, n in enumerate(order)}
            crits.sort(key=lambda c: rank.get(c["name"], 999))
            with LOCK:
                manual = [c for c in t["criteria"] if c.get("source") == "user"]
                t["criteria"] = []
                for c in crits:
                    add_topic_criterion(t, c["name"], c["description"])
                for c in manual:
                    if c["name"].lower() not in {x["name"].lower() for x in t["criteria"]}:
                        t["criteria"].append(c)
                t["criteria_status"] = "ready"
                STORE.save()
        except Exception:
            with LOCK:
                t["criteria_status"] = "error"
                STORE.save()
            raise
        log(f"topic '{t['name']}': {len(t['criteria'])} criteria")
        return t

    @route("POST", r"/api/topics/(?P<tid>[^/]+)/criteria/more")
    def more_criteria(self, body, tid):
        t = STORE.topic(tid)
        new = pipeline.more_criteria(t["name"], t["criteria"])
        added = []
        with LOCK:
            for c in new:
                before = len(t["criteria"])
                cc = add_topic_criterion(t, c["name"], c["description"])
                if len(t["criteria"]) > before:
                    added.append(cc)
            STORE.save()
        return {"topic": t, "added": added}

    @route("POST", r"/api/topics/(?P<tid>[^/]+)/criteria")
    def add_criterion(self, body, tid):
        t = STORE.topic(tid)
        name = (body.get("name") or "").strip()
        if not name:
            raise ApiError(400, "name required")
        with LOCK:
            before = len(t["criteria"])
            c = add_topic_criterion(t, name, body.get("description") or "")
            if len(t["criteria"]) > before:
                c["source"] = "user"
            STORE.save()
        return {"topic": t, "added": [c] if len(t["criteria"]) > before else []}

    @route("PATCH", r"/api/topics/(?P<tid>[^/]+)/criteria/(?P<cid>[^/]+)")
    def edit_criterion(self, body, tid, cid):
        t = STORE.topic(tid)
        c = find_criterion(t, cid)
        with LOCK:
            if "name" in body and body["name"].strip() and body["name"].strip() != c["name"]:
                rename_in_annotations(t, "criteria", c["name"], body["name"].strip())
                c["name"] = body["name"].strip()
            if "description" in body:
                c["description"] = body["description"].strip()
            if "pinned" in body:
                c["pinned"] = bool(body["pinned"])
            STORE.save()
        return t

    @route("DELETE", r"/api/topics/(?P<tid>[^/]+)/criteria/(?P<cid>[^/]+)")
    def delete_criterion(self, body, tid, cid):
        t = STORE.topic(tid)
        c = find_criterion(t, cid)
        with LOCK:
            rename_in_annotations(t, "criteria", c["name"], None)
            t["criteria"] = [x for x in t["criteria"] if x["id"] != cid]
            STORE.save()
        return t

    @route("POST", r"/api/topics/(?P<tid>[^/]+)/criteria/reorder")
    def reorder_criteria(self, body, tid):
        t = STORE.topic(tid)
        ids = body.get("ids", [])
        with LOCK:
            by_id = {c["id"]: c for c in t["criteria"]}
            ordered = [by_id[i] for i in ids if i in by_id]
            ordered += [c for c in t["criteria"] if c["id"] not in set(ids)]
            t["criteria"] = ordered
            STORE.save()
        return t

    @route("POST", r"/api/topics/(?P<tid>[^/]+)/options")
    def add_option(self, body, tid):
        t = STORE.topic(tid)
        name = (body.get("name") or "").strip()
        if not name:
            raise ApiError(400, "name required")
        with LOCK:
            add_topic_option(t, name, body.get("page_id"))
            if body.get("page_id"):
                p = STORE.page(body["page_id"])
                if p and name.lower() not in {o.lower() for o in p["options"]}:
                    p["options"].append(name)
            STORE.save()
        return t

    @route("PATCH", r"/api/topics/(?P<tid>[^/]+)/options/(?P<oid>[^/]+)")
    def edit_option(self, body, tid, oid):
        t = STORE.topic(tid)
        o = find_option(t, oid)
        with LOCK:
            if "name" in body and body["name"].strip() and body["name"].strip() != o["name"]:
                rename_in_annotations(t, "options", o["name"], body["name"].strip())
                o["name"] = body["name"].strip()
            if "pinned" in body:
                o["pinned"] = bool(body["pinned"])
            STORE.save()
        return t

    @route("DELETE", r"/api/topics/(?P<tid>[^/]+)/options/(?P<oid>[^/]+)")
    def delete_option(self, body, tid, oid):
        t = STORE.topic(tid)
        o = find_option(t, oid)
        with LOCK:
            rename_in_annotations(t, "options", o["name"], None)
            t["options"] = [x for x in t["options"] if x["id"] != oid]
            STORE.save()
        return t

    @route("POST", r"/api/topics/(?P<tid>[^/]+)/options/reorder")
    def reorder_options(self, body, tid):
        t = STORE.topic(tid)
        ids = body.get("ids", [])
        with LOCK:
            by_id = {o["id"]: o for o in t["options"]}
            ordered = [by_id[i] for i in ids if i in by_id]
            ordered += [o for o in t["options"] if o["id"] not in set(ids)]
            t["options"] = ordered
            STORE.save()
        return t


API = SeleniteApi()


# --------------------------------------------------------------------------
# HTTP handler
# --------------------------------------------------------------------------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)

    def _json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _api(self, method):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        body = {}
        if length:
            try:
                body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            except json.JSONDecodeError:
                return self._json(400, {"error": "invalid JSON body"})
        try:
            self._json(200, API.dispatch(method, path, body))
        except ApiError as e:
            self._json(e.status, {"error": str(e)})
        except llm.LLMError as e:
            self._json(503, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            self._json(500, {"error": f"{type(e).__name__}: {e}"})

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            return self._api("GET")
        if path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        return self._api("POST")

    def do_PATCH(self):
        return self._api("PATCH")

    def do_DELETE(self):
        return self._api("DELETE")


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    h = llm.health()
    log(f"Selenite at http://localhost:{PORT}")
    if h.get("ok"):
        log(f"LLM bridge at {llm.BRIDGE_URL}: backend={h.get('backend')} model={h.get('model')}")
    else:
        log(f"LLM bridge not reachable at {llm.BRIDGE_URL}. Start it from the repository root: "
            "python3 llm-bridge/bridge.py claude")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
