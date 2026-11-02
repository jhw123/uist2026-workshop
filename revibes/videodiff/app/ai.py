"""VideoDiff's AI: prompt engineering on top of the transcript.

Every model call goes through the workshop's LLM bridge (OpenAI Chat
Completions format, JSON output). The paper used GPT-4o; the bridge answers
with the small model of the coding agent the group is signed in to.

Three jobs, as in the paper (Section 4.3):
 1. segment the transcript into sections and find visually concrete keywords
 2. generate alternatives for rough cuts, B-rolls and text effects, steered by
    the augmentation prompts of Appendix B
 3. carry out the user's own prompts (new / recombine / surprise / edit) and
    summarise the changes
"""

import json
import os
import random
import re
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BRIDGE_URL = os.environ.get("BRIDGE_URL", "http://localhost:8787").rstrip("/")


class LLMError(Exception):
    pass


# --------------------------------------------------------------------------
# Bridge call
# --------------------------------------------------------------------------

def parse_json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except ValueError:
        a, b = text.find("{"), text.rfind("}")
        if a >= 0 and b > a:
            return json.loads(text[a:b + 1])
        raise


def chat(system, user, retries=1):
    body = {
        "model": "gpt-4o",  # ignored by the bridge; kept to mirror the paper
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
        "response_format": {"type": "json_object"},
    }
    last = None
    for _ in range(retries + 1):
        req = urllib.request.Request(
            BRIDGE_URL + "/v1/chat/completions",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.loads(r.read())
            text = data["choices"][0]["message"]["content"]
            out = parse_json(text)
            if not isinstance(out, dict):
                raise ValueError("expected a JSON object")
            return out
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:300]
            last = f"bridge error {e.code}: {msg}"
        except urllib.error.URLError as e:
            raise LLMError(
                f"Cannot reach the LLM bridge at {BRIDGE_URL} ({e.reason}). "
                "Start it from the repository root with: python3 llm-bridge/bridge.py claude")
        except (ValueError, KeyError, IndexError) as e:
            last = f"the model did not return valid JSON ({e})"
    raise LLMError(str(last))


# --------------------------------------------------------------------------
# Transcript helpers
# --------------------------------------------------------------------------

def fmt_t(s):
    s = max(0, int(round(s)))
    return f"{s // 60}:{s % 60:02d}"


def runs_of(keep):
    keep = sorted(set(keep))
    runs = []
    for i in keep:
        if runs and i == runs[-1][1] + 1:
            runs[-1][1] = i
        else:
            runs.append([i, i])
    return runs


def dur_of(keep, segs):
    return sum(segs[b]["end"] - segs[a]["start"] for a, b in runs_of(keep))


def section_index(i, sections):
    for k, s in enumerate(sections):
        if s["start"] <= i <= s["end"]:
            return k
    return 0


def sections_in(keep, sections):
    return sorted({section_index(i, sections) for i in keep})


def parse_keep(raw, n):
    out = set()
    for item in raw or []:
        try:
            if isinstance(item, (list, tuple)) and len(item) == 2:
                a, b = int(item[0]), int(item[1])
                out.update(range(min(a, b), max(a, b) + 1))
            elif isinstance(item, dict) and "start" in item:
                a, b = int(item["start"]), int(item.get("end", item["start"]))
                out.update(range(min(a, b), max(a, b) + 1))
            else:
                out.add(int(item))
        except (TypeError, ValueError):
            continue
    return sorted(i for i in out if 0 <= i < n)


def source_listing(segs, sections, idxs=None, times=False):
    """Transcript grouped by section, one sentence per line."""
    allowed = None if idxs is None else set(idxs)
    lines = []
    for k, s in enumerate(sections):
        ids = [i for i in range(s["start"], s["end"] + 1) if allowed is None or i in allowed]
        if not ids:
            continue
        d = sum(segs[i]["end"] - segs[i]["start"] for i in ids)
        lines.append(f'## Section {k + 1} "{s["title"]}" (sentences {s["start"]}-{s["end"]}, {d:.0f}s)')
        for i in ids:
            g = segs[i]
            tag = f"at {fmt_t(g['start'])}, " if times else ""
            lines.append(f"[{i}] ({tag}{g['end'] - g['start']:.1f}s) {g['text'].strip()}")
    return "\n".join(lines)


def keep_desc(keep, segs, sections):
    titles = [sections[k]["title"] for k in sections_in(keep, sections)]
    return (f"keep {json.dumps(runs_of(keep))} "
            f"({fmt_t(dur_of(keep, segs))}; sections: {', '.join(titles)})")


# --------------------------------------------------------------------------
# 1. Analysis: sections and visually concrete keywords
# --------------------------------------------------------------------------

SECTION_SYS = ("You segment narrated video transcripts into thematically coherent sections "
               "for a video editor. Answer with JSON only.")

KEYWORD_SYS = ("You find visually concrete keywords in video narration. Answer with JSON only.")

KEYWORD_SHOTS = """Visually concrete keywords are short phrases from the narration that name something a viewer could see on screen: objects, foods, places, people, animals, tools, or actions with a clear look. Abstract words (idea, time, really, way, video) are not visually concrete.

Examples:
"I had a late night last night. We went to a baseball game with some friends." -> ["baseball game"]
"I'm at food line and I did not do a pickup order, but I did make a list. I did not want to get in bulk at Sam's club." -> ["food line", "Sam's club"]
"It was only 79 cents. I thought that'd be good for the pool. Probably not watermelon." -> ["pool", "watermelon"]
"I am a sophomore at Columbia College studying film, and I'm originally from Dallas, Texas." -> ["Columbia College", "Dallas, Texas"]
"So I think that's basically it for today, thanks for watching." -> []"""


def analyze(segs):
    n = len(segs)
    listing = "\n".join(f"[{i}] ({fmt_t(g['start'])}) {g['text'].strip()}" for i, g in enumerate(segs))

    def get_sections():
        user = (f"Transcript sentences (index, start time, text):\n{listing}\n\n"
                f"Split all {n} sentences into 4 to 8 consecutive sections by topic. Every sentence "
                "belongs to exactly one section; sections are in order and do not overlap.\n"
                "For each section give a short title (2-4 words, e.g. \"Breaking Down the Bird\" or "
                "\"Dining and Housing\") and 3-5 topic keywords.\n"
                'Return: {"sections": [{"title": "...", "start": first sentence index, '
                '"end": last sentence index, "keywords": ["..."]}]}')
        return chat(SECTION_SYS, user)

    def get_keywords():
        text = "\n".join(g["text"].strip() for g in segs)
        user = (f"{KEYWORD_SHOTS}\n\nNarration:\n{text}\n\n"
                "List the visually concrete keywords of this narration, written exactly as in the "
                "narration, about one for every one or two sentences.\n"
                'Return: {"keywords": ["..."]}')
        return chat(KEYWORD_SYS, user)

    with ThreadPoolExecutor(2) as ex:
        fs, fk = ex.submit(get_sections), ex.submit(get_keywords)
        sec_raw, kw_raw = fs.result(), fk.result()
    sections = normalize_sections(sec_raw, n)
    keywords = []
    full = " ".join(g["text"] for g in segs).lower()
    for k in kw_raw.get("keywords", []):
        k = str(k).strip().strip(".,")
        if 1 < len(k) < 40 and k.lower() in full and k.lower() not in [x.lower() for x in keywords]:
            keywords.append(k)
    return {"sections": sections, "keywords": keywords}


def normalize_sections(raw, n):
    secs = []
    for s in raw.get("sections", []):
        try:
            a, b = int(s["start"]), int(s["end"])
        except (KeyError, TypeError, ValueError):
            continue
        secs.append({
            "title": (str(s.get("title") or "Section").strip()[:40]) or "Section",
            "start": max(0, min(n - 1, a)),
            "end": max(0, min(n - 1, b)),
            "keywords": [str(k) for k in (s.get("keywords") or [])][:6],
        })
    secs.sort(key=lambda s: s["start"])
    out = []
    for s in secs:
        if out and s["start"] <= out[-1]["start"]:
            continue
        out.append(s)
    if not out:
        step = max(1, n // 6)
        out = [{"title": f"Part {k + 1}", "start": a, "end": 0, "keywords": []}
               for k, a in enumerate(range(0, n, step))]
    out[0]["start"] = 0
    for k in range(len(out)):
        out[k]["end"] = out[k + 1]["start"] - 1 if k + 1 < len(out) else n - 1
    return out


# --------------------------------------------------------------------------
# 2. Augmentation prompts (Appendix B, Table 5)
# --------------------------------------------------------------------------

RC_LENGTH = {
    "short": ("Make the total duration to be less than 2 minutes.", 40, 120, "< 2 min"),
    "medium": ("Make the total duration to be 2-4 minutes.", 120, 240, "2–4 min"),
    "long": ("Make the total duration to be 4-5 minutes.", 240, 300, "4–5 min"),
}
RC_FOCUS = {
    "few": ("Focus on 1-2 sections for a coherent summary, minimize additional sections.", "Focused (1–2)"),
    "some": ("Focus on 3-4 sections, minimize additional sections.", "Balanced (3–4)"),
    "diverse": ("Extract short parts from many sections for diversity.", "Diverse"),
}
BR_MEDIA = {"illustration": "Illustration", "photo": "Photo", "video": "Video"}
BR_FREQ = {
    "few": ("Limit B-Rolls to 2-3.", 2, 3),
    "some": ("Limit B-Rolls to 4-5.", 4, 5),
    "many": ("Limit B-Rolls to 7-10.", 7, 10),
}
TX_STYLE = {"lower": "Lower third", "title": "Title", "subtitle": "Subtitle"}
TX_FREQ = {
    "few": ("Limit pull quote sentences to 2-3.", 2, 3),
    "some": ("Limit pull quote sentences to 4-5.", 4, 5),
    "many": ("Limit pull quote sentences to 7-10.", 7, 10),
}


def augment_plan(stage):
    """The ten augmentation combinations for a stage: all 3x3 pairs plus one random pair."""
    if stage == "roughcut":
        pairs = [{"length": a, "focus": b} for a in RC_LENGTH for b in RC_FOCUS]
        pairs.append({"length": random.choice(list(RC_LENGTH)), "focus": random.choice(list(RC_FOCUS))})
    elif stage == "broll":
        pairs = [{"media": a, "freq": b} for a in BR_MEDIA for b in BR_FREQ]
        pairs.append({"media": random.choice(list(BR_MEDIA)), "freq": random.choice(list(BR_FREQ))})
    else:
        pairs = [{"style": a, "freq": b} for a in TX_STYLE for b in TX_FREQ]
        pairs.append({"style": random.choice(list(TX_STYLE)), "freq": random.choice(list(TX_FREQ))})
    random.shuffle(pairs)
    return pairs


EDITOR_SYS = ("You are an expert video editor working on narrated videos (vlogs, how-to, tours). "
              "You edit by choosing transcript sentences, B-roll and text effects. Answer with JSON only.")


# --------------------------------------------------------------------------
# Rough cuts
# --------------------------------------------------------------------------

def repair_duration(keep, segs, sections, lo, hi):
    """Nudge a rough cut into the requested duration range (small models are poor at adding up times)."""
    keep = sorted(set(keep))
    total = dur_of(range(len(segs)), segs)
    hi = min(hi, total)
    lo = min(lo, hi * 0.85)
    guard = 0
    while keep and dur_of(keep, segs) > hi and len(keep) > 1 and guard < 1000:
        guard += 1
        per = {}
        for i in keep:
            k = section_index(i, sections)
            per[k] = per.get(k, 0) + segs[i]["end"] - segs[i]["start"]
        k = max(per, key=per.get)
        ids = [i for i in keep if section_index(i, sections) == k]
        keep.remove(ids[-1] if len(ids) > 1 else keep[-1])
    kept_secs = set(sections_in(keep, sections))
    while dur_of(keep, segs) < lo and guard < 1000:
        guard += 1
        ks = set(keep)
        cands = [i for i in range(len(segs)) if i not in ks and ((i - 1) in ks or (i + 1) in ks)]
        pref = [i for i in cands if section_index(i, sections) in kept_secs]
        pool = pref or cands or [i for i in range(len(segs)) if i not in ks]
        if not pool:
            break
        keep.append(random.choice(pool))
        keep.sort()
    return keep


def gen_roughcut(segs, sections, req):
    mode = req.get("mode", "augment")
    n = len(segs)
    total = dur_of(range(n), segs)
    listing = source_listing(segs, sections)
    head = f"Source transcript, grouped into sections. Each line: [sentence index] (duration) text.\n{listing}\nTotal source speech: {total:.0f}s.\n\n"
    fmt = ('Return JSON: {"keep": [[first, last], ...] (inclusive ranges of sentence indices, in source order), '
           '"summary": "%s"}')
    versions = req.get("versions") or []
    vlist = "\n".join(f'#{v["id"]}: {keep_desc(v.get("keep", []), segs, sections)}' for v in versions)

    if mode == "augment":
        aug = req["augment"]
        L, F = RC_LENGTH[aug["length"]], RC_FOCUS[aug["focus"]]
        lo, hi = L[1], min(L[2], total)
        user = (head + "Task: create a rough cut by choosing which sentences to keep. Sentences stay in source order.\n"
                f"- {L[0]} (Kept sentence durations should add up to about {lo:.0f}-{hi:.0f} seconds.)\n"
                f"- {F[0]}\n"
                "- Tell a compelling story: open clearly, keep complete thoughts, end on a natural close.\n"
                f"- This is variation {req.get('variant', 1)} of 10: make choices of your own rather than the most obvious ones.\n"
                + fmt % "one short sentence describing this storyline")
        out = chat(EDITOR_SYS, user)
        keep = parse_keep(out.get("keep"), n) or list(range(min(n, 5)))
        keep = repair_duration(keep, segs, sections, lo, hi)
        return {"keep": keep, "summary": str(out.get("summary", "")),
                "label": f"Length: {L[3]} · Coverage: {F[1]}"}

    if mode == "edit":
        tgt = req["target"]
        user = (head + f"Current version #{tgt['id']}: {keep_desc(tgt['keep'], segs, sections)}\n\n"
                f"The user's edit request: \"{req['prompt']}\"\n"
                "Change the current version to carry out the request, and change nothing else.\n"
                + fmt % "one sentence naming the specific change and the section it affected, e.g. Shortened the description of dining halls within the 'Dining and Housing' section.")
    elif mode == "surprise":
        user = (head + f"Existing rough cut versions:\n{vlist}\n\n"
                "Create one new rough cut that is clearly different from all existing versions: a different "
                "storyline, length, or choice of sections, that would still make a good video.\n"
                + fmt % "one sentence saying what this version does and how it differs from the existing ones")
    else:  # prompt (new or recombine)
        user = (head + f"Existing rough cut versions:\n{vlist}\n\n"
                f"The user asks for a new version: \"{req['prompt']}\"\n"
                "If the request names versions like #3, combine or reuse their kept sentences as instructed.\n"
                + fmt % "one sentence summarising what you made, naming the versions or sections used")
    out = chat(EDITOR_SYS, user)
    keep = parse_keep(out.get("keep"), n)
    if not keep:
        raise LLMError("The model returned an empty rough cut. Try rephrasing the request.")
    return {"keep": keep, "summary": str(out.get("summary", ""))}


# --------------------------------------------------------------------------
# B-roll
# --------------------------------------------------------------------------

STOP = {"the", "a", "an", "of", "and", "in", "on", "to", "for", "with"}


def words(s):
    return set(re.findall(r"[a-z0-9']+", s.lower())) - STOP


def search_broll(keyword, mtype, video_id, index, used):
    """Keyword search over the local B-roll library, standing in for a stock media API."""
    kw = keyword.lower().strip()
    best, best_s = None, 0
    for item in index:
        s = 0
        for k in item["keywords"]:
            k = k.lower()
            if k == kw:
                s = max(s, 10)
            elif k in kw or kw in k:
                s = max(s, 6)
            else:
                ov = words(k) & words(kw)
                if ov:
                    s = max(s, 3 + len(ov))
        if s == 0:
            continue
        if item["video"] == video_id:
            s += 2
        if mtype and item["type"] == mtype:
            s += 4
        if item["file"] in used:
            s -= 3
        if s > best_s:
            best, best_s = item, s
    if not best:
        return None
    return {k: best[k] for k in ("file", "type", "keywords", "title", "credit", "license", "source")}


def library_terms(index, video_id):
    own = [i for i in index if i["video"] == video_id] or index
    terms = {}
    for i in own:
        for k in i["keywords"]:
            terms.setdefault(k.lower(), set()).add(i["type"])
    return "; ".join(f"{k} ({'/'.join(sorted(t))})" for k, t in sorted(terms.items()))


def finish_brolls(raw, keep, default_type, video_id, index, max_n=None):
    ks = set(keep)
    seen, out, used = set(), [], set()
    for b in raw or []:
        try:
            i = int(b["sentence"])
        except (KeyError, TypeError, ValueError):
            continue
        kw = str(b.get("keyword") or "").strip()
        if i not in ks or i in seen or not kw:
            continue
        t = str(b.get("type") or default_type or "").lower()
        t = t if t in BR_MEDIA else (default_type or "photo")
        media = search_broll(kw, t, video_id, index, used)
        if media:
            used.add(media["file"])
        seen.add(i)
        out.append({"sentence": i, "keyword": kw, "type": t, "media": media})
    out.sort(key=lambda b: b["sentence"])
    if max_n:
        out = out[:max_n]
    return out


def broll_desc(v):
    items = ", ".join(f'[sentence {b["sentence"]}: "{b["keyword"]}" ({b["type"]})]' for b in v.get("brolls", []))
    return f'#{v["id"]}: {items or "no B-roll"}'


def gen_broll(segs, sections, req, video_id, index):
    mode = req.get("mode", "augment")
    keep = req["base"]["keep"]
    listing = source_listing(segs, sections, keep, times=True)
    head = (f"The rough cut's transcript. Each line: [sentence index] (time, duration) text.\n{listing}\n\n"
            f"Stock media library search terms (media types): {library_terms(index, video_id)}\n\n")
    item = '{"sentence": index, "keyword": "1-3 word search keyword", "type": "photo|illustration|video"}'
    fmt = 'Return JSON: {"brolls": [%s, ...], "summary": "%s"}'
    versions = req.get("versions") or []
    rules = ("B-roll is shown full-frame over the narration of the chosen sentence. Pick sentences where a "
             "visual illustrates what is being said, prefer the library's search terms, and use at most one "
             "B-roll per sentence. Only use sentence indices listed above.\n")
    if mode == "augment":
        aug = req["augment"]
        F = BR_FREQ[aug["freq"]]
        media = BR_MEDIA[aug["media"]]
        user = (head + "Task: suggest B-roll for this rough cut.\n" + rules +
                f"- Media type: {media}.\n- {F[0]}\n"
                f"- This is variation {req.get('variant', 1)} of 10: make choices of your own.\n"
                + fmt % (item, "one short sentence describing this B-roll plan"))
        out = chat(EDITOR_SYS, user)
        brolls = finish_brolls(out.get("brolls"), keep, aug["media"], video_id, index, F[2])
        return {"brolls": brolls, "summary": str(out.get("summary", "")),
                "label": f"Media: {media} · Frequency: {F[1]}–{F[2]}"}
    vlist = "\n".join(broll_desc(v) for v in versions)
    if mode == "edit":
        tgt = req["target"]
        user = (head + rules + f"Current version {broll_desc(tgt)}\n\nThe user's edit request: \"{req['prompt']}\"\n"
                "Change the current B-roll to carry out the request, and keep the rest as it is.\n"
                + fmt % (item, "one sentence naming the specific changes you made"))
    elif mode == "surprise":
        user = (head + rules + f"Existing B-roll versions:\n{vlist}\n\n"
                "Create one new B-roll version that is clearly different from all existing ones (other moments, "
                "media types or amount).\n" + fmt % (item, "one sentence on what this version does differently"))
    else:
        user = (head + rules + f"Existing B-roll versions:\n{vlist}\n\nThe user asks for a new version: \"{req['prompt']}\"\n"
                "If the request names versions like #3, reuse their B-rolls (same sentence, keyword and type) as instructed.\n"
                + fmt % (item, "one sentence summarising what you made, naming the versions used"))
    out = chat(EDITOR_SYS, user)
    brolls = finish_brolls(out.get("brolls"), keep, None, video_id, index)
    return {"brolls": brolls, "summary": str(out.get("summary", ""))}


# --------------------------------------------------------------------------
# Text effects
# --------------------------------------------------------------------------

def finish_texts(raw, keep, segs, default_style, max_n=None):
    ks = set(keep)
    seen, out = set(), []
    for t in raw or []:
        try:
            i = int(t["sentence"])
        except (KeyError, TypeError, ValueError):
            continue
        txt = str(t.get("text") or "").strip().strip('"')
        if i not in ks or i in seen or not txt:
            continue
        style = str(t.get("style") or default_style or "").lower()
        style = style if style in TX_STYLE else (default_style or "title")
        seen.add(i)
        out.append({"sentence": i, "text": txt[:60], "style": style})
    out.sort(key=lambda t: t["sentence"])
    if max_n:
        out = out[:max_n]
    return out


def text_desc(v):
    items = ", ".join(f'[sentence {t["sentence"]}: "{t["text"]}" ({t["style"]})]' for t in v.get("texts", []))
    return f'#{v["id"]}: {items or "no text effects"}'


def gen_text(segs, sections, req):
    mode = req.get("mode", "augment")
    keep = req["base"]["keep"]
    listing = source_listing(segs, sections, keep, times=True)
    head = f"The edited video's transcript. Each line: [sentence index] (time, duration) text.\n{listing}\n\n"
    item = '{"sentence": index, "text": "a 1-5 word phrase copied exactly from that sentence", "style": "title|subtitle|lower"}'
    fmt = 'Return JSON: {"texts": [%s, ...], "summary": "%s"}'
    rules = ("Text effects are animated pull quotes that emphasise a key phrase of the narration while it is "
             "spoken. Styles: title (large, centred), subtitle (caption at the bottom), lower (lower-third banner). "
             "Use at most one effect per sentence and only sentence indices listed above.\n")
    versions = req.get("versions") or []
    if mode == "augment":
        aug = req["augment"]
        F = TX_FREQ[aug["freq"]]
        style = TX_STYLE[aug["style"]]
        user = (head + "Task: suggest text effects for this video.\n" + rules +
                f"- Style: {style} (use \"{aug['style']}\").\n- {F[0]}\n"
                f"- This is variation {req.get('variant', 1)} of 10: make choices of your own.\n"
                + fmt % (item, "one short sentence describing this text plan"))
        out = chat(EDITOR_SYS, user)
        texts = finish_texts(out.get("texts"), keep, segs, aug["style"], F[2])
        return {"texts": texts, "summary": str(out.get("summary", "")),
                "label": f"Style: {style} · Frequency: {F[1]}–{F[2]}"}
    vlist = "\n".join(text_desc(v) for v in versions)
    if mode == "edit":
        tgt = req["target"]
        user = (head + rules + f"Current version {text_desc(tgt)}\n\nThe user's edit request: \"{req['prompt']}\"\n"
                "Change the current text effects to carry out the request, and keep the rest as it is.\n"
                + fmt % (item, "one sentence naming the specific changes you made"))
    elif mode == "surprise":
        user = (head + rules + f"Existing text effect versions:\n{vlist}\n\n"
                "Create one new version that is clearly different from all existing ones (other phrases, styles "
                "or amount).\n" + fmt % (item, "one sentence on what this version does differently"))
    else:
        user = (head + rules + f"Existing text effect versions:\n{vlist}\n\nThe user asks for a new version: \"{req['prompt']}\"\n"
                "If the request names versions like #3, reuse their effects as instructed.\n"
                + fmt % (item, "one sentence summarising what you made, naming the versions used"))
    out = chat(EDITOR_SYS, user)
    texts = finish_texts(out.get("texts"), keep, segs, None)
    return {"texts": texts, "summary": str(out.get("summary", ""))}
