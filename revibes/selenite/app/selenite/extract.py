"""Fetch a web page and split it into readable paragraphs.

The paper's Chrome extension read the live DOM of the page. Here a small
readability-style extractor (standard library only) pulls the title and the
text blocks (headings, paragraphs, list items, block quotes) out of the HTML,
skipping navigation, scripts, footers and other boilerplate.
"""
import gzip
import html
import re
import urllib.error
import urllib.request
from html.parser import HTMLParser

USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

SKIP_TAGS = {"script", "style", "noscript", "nav", "footer", "header", "aside", "form",
             "svg", "iframe", "template", "button", "select", "option", "menu", "figure",
             "figcaption", "video", "audio", "canvas", "object"}
BLOCK_TAGS = {"p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "td",
              "th", "dd", "dt", "div", "section", "article"}
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
MIN_WORDS = 6          # shorter blocks are dropped (menus, captions, prices)
MIN_HEADING_WORDS = 2


_BOILER = re.compile(r"^(nav|navigation|menu|footer|sidebar|cookie|comments?|share|sharing|social|"
                     r"newsletter|breadcrumbs?|popup|modal|advert|ads?|promo|related|subscribe|"
                     r"toolbar|widget)$")


def _boilerplate_class(attrs):
    """True if a class or id token names typical page boilerplate (nav, footer...).

    Only short tokens count, split on '-' and '_' (e.g. 'site-footer', 'nav_bar'),
    so long utility classes such as 'vector-feature-main-menu-pinned-disabled'
    do not hide the whole page.
    """
    raw = ((attrs.get("class") or "") + " " + (attrs.get("id") or "")).lower()
    for token in raw.split():
        parts = re.split(r"[-_]", token)
        if len(parts) <= 2 and any(_BOILER.match(x) for x in parts):
            return True
    return False


class _Extractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []        # [(tag, text)]
        self.title = ""
        self._title_parts = []
        self._in_title = False
        self._title_done = False
        self._skip_stack = []
        self._stack = []        # (tag, [text parts])
        self._main_seen = False

    VOID = {"br", "img", "input", "hr", "meta", "link", "area", "base", "col", "embed",
            "source", "track", "wbr", "param"}

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        a = dict(attrs)
        if tag == "title":
            if not self._title_done:
                self._in_title = True
            return
        if self._skip_stack:
            if tag not in self.VOID:
                self._skip_stack.append(tag)
            return
        role = (a.get("role") or "").lower()
        if (tag in SKIP_TAGS or role in ("navigation", "banner", "contentinfo", "complementary")
                or a.get("hidden") is not None or a.get("aria-hidden") == "true"
                or (tag not in ("html", "body", "main", "article") and _boilerplate_class(a))):
            if tag not in self.VOID:
                self._skip_stack.append(tag)
            return
        if tag in BLOCK_TAGS:
            self._stack.append((tag, []))
        elif tag == "br":
            if self._stack:
                self._stack[-1][1].append(" ")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "title":
            self._in_title = False
            self._title_done = True
            return
        if self._skip_stack:
            if tag in self._skip_stack:
                i = len(self._skip_stack) - 1 - self._skip_stack[::-1].index(tag)
                del self._skip_stack[i:]
            return
        if tag in BLOCK_TAGS and self._stack:
            for i in range(len(self._stack) - 1, -1, -1):
                if self._stack[i][0] == tag:
                    t, parts = self._stack.pop(i)
                    self._flush(t, "".join(parts))
                    break

    def handle_data(self, data):
        if self._in_title:
            self._title_parts.append(data)
            return
        if self._skip_stack or not self._stack:
            return
        self._stack[-1][1].append(data)

    def _flush(self, tag, text):
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            return
        words = len(text.split())
        if tag in HEADING_TAGS:
            if words < MIN_HEADING_WORDS or words > 40:
                return
        elif words < MIN_WORDS:
            return
        if tag in ("div", "section", "article") and words < 20:
            return
        self.blocks.append((tag, text))

    def result(self):
        title = re.sub(r"\s+", " ", "".join(self._title_parts)).strip()
        return title, self.blocks


def fetch_url(url):
    if not re.match(r"^https?://", url):
        url = "https://" + url
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT,
                                               "Accept": "text/html,application/xhtml+xml",
                                               "Accept-Language": "en-US,en;q=0.9",
                                               "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=25) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding", "") == "gzip":
            raw = gzip.decompress(raw)
        charset = r.headers.get_content_charset() or "utf-8"
        final_url = r.geturl()
    try:
        text = raw.decode(charset, errors="replace")
    except LookupError:
        text = raw.decode("utf-8", errors="replace")
    return final_url, text


def paragraphs_from_html(html_text):
    p = _Extractor()
    p.feed(html_text)
    p.close()
    title, blocks = p.result()
    # de-duplicate (nested divs may repeat text) and drop blocks contained in others
    seen = set()
    out = []
    for tag, text in blocks:
        key = text[:200]
        if key in seen:
            continue
        seen.add(key)
        out.append({"tag": "h" if tag in HEADING_TAGS else "p", "text": text})
    # drop container blocks that merely concatenate paragraphs we already have
    texts = [b["text"] for b in out]
    final = []
    for i, b in enumerate(out):
        if len(b["text"]) > 600 and any(t != b["text"] and len(t) > 80 and t in b["text"]
                                         for t in texts):
            continue
        final.append(b)
    if not title:
        for b in final:
            if b["tag"] == "h":
                title = b["text"]
                break
    return title, final


def paragraphs_from_text(text):
    """Split pasted plain text into paragraphs (blank-line separated)."""
    text = html.unescape(text.replace("\r\n", "\n"))
    chunks = [c.strip() for c in re.split(r"\n\s*\n|\n(?=\S)", text) if c.strip()]
    out = []
    for c in chunks:
        c = re.sub(r"\s+", " ", c)
        words = len(c.split())
        if words == 0:
            continue
        if words <= 12 and not c.endswith((".", "!", "?")):
            out.append({"tag": "h", "text": c})
        else:
            out.append({"tag": "p", "text": c})
    return out
