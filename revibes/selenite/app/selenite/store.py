"""A tiny JSON-file store that stands in for the paper's Firebase database.

Everything (topics, criteria, options, pages, paragraph annotations and reading
progress) lives in one JSON file so the group can inspect or reset it easily.
"""
import json
import os
import threading
import time
import uuid

_LOCK = threading.RLock()


def new_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


class Store:
    def __init__(self, path):
        self.path = path
        self.data = {"topics": {}, "pages": {}}
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
            except Exception:
                pass
        self.data.setdefault("topics", {})
        self.data.setdefault("pages", {})

    # ---- persistence -------------------------------------------------
    def save(self):
        with _LOCK:
            tmp = self.path + ".tmp"
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.data, f, indent=1, ensure_ascii=False)
            os.replace(tmp, self.path)

    # ---- topics --------------------------------------------------------
    def topics(self):
        return list(self.data["topics"].values())

    def topic(self, tid):
        return self.data["topics"].get(tid)

    def create_topic(self, name):
        with _LOCK:
            tid = new_id("topic")
            t = {"id": tid, "name": name, "created": time.time(),
                 "criteria": [], "options": [], "pages": [],
                 "criteria_status": "none"}
            self.data["topics"][tid] = t
            self.save()
            return t

    def delete_topic(self, tid):
        with _LOCK:
            t = self.data["topics"].pop(tid, None)
            if t:
                for pid in t["pages"]:
                    self.data["pages"].pop(pid, None)
            self.save()

    # ---- pages ---------------------------------------------------------
    def pages(self):
        return list(self.data["pages"].values())

    def page(self, pid):
        return self.data["pages"].get(pid)

    def create_page(self, page):
        with _LOCK:
            page["id"] = new_id("page")
            page["created"] = time.time()
            page.setdefault("topic_id", None)
            page.setdefault("options", [])
            page.setdefault("read", [])
            self.data["pages"][page["id"]] = page
            self.save()
            return page

    def delete_page(self, pid):
        with _LOCK:
            p = self.data["pages"].pop(pid, None)
            if p and p.get("topic_id"):
                t = self.topic(p["topic_id"])
                if t and pid in t["pages"]:
                    t["pages"].remove(pid)
            self.save()

    def assign_page(self, pid, tid):
        """Move a page to a topic (and out of its old one)."""
        with _LOCK:
            p = self.page(pid)
            old = p.get("topic_id")
            if old and old != tid:
                ot = self.topic(old)
                if ot and pid in ot["pages"]:
                    ot["pages"].remove(pid)
            p["topic_id"] = tid
            t = self.topic(tid)
            if pid not in t["pages"]:
                t["pages"].append(pid)
            self.save()
