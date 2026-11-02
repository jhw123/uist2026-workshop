"""The language-model tasks of Selenite, with the prompts from Appendix D.

Substitutions versus the paper (all through the LLM bridge, see README):
- GPT-4 -> the bridge's model (a small fast model) for every prompt.
- bart-large-mnli zero-shot NLI for per-paragraph criteria/options -> one
  bridge call per batch of paragraphs that returns JSON labels with a score.
- SentenceBERT topic clustering -> one bridge call that decides whether a new
  topic matches an existing one.
- GPT-2 perplexity relevance + SentenceBERT diversity for next-step
  recommendations -> bridge relevance scores + local TF-IDF cosine distance,
  then the paper's greedy peeling.
"""
import math
import re
from collections import Counter

from . import llm

TARGET_CRITERIA = 20
CHUNK_WORDS = 3000          # for option extraction on long pages
ANNOTATE_BATCH = 6          # paragraphs per annotation call
SCORE_THRESHOLD = 0.5       # paper: 0.96 on NLI probabilities; our scores are model-given


# --------------------------------------------------------------------------
# D.1  Topic recognition
# --------------------------------------------------------------------------
def recognize_topic(title, first_paragraphs):
    """Two-step prompt: summarize the article, then give a search phrase."""
    content = "\n\n".join(first_paragraphs[:5])
    step1 = (f"Step 1\n\nGiven the following information of an article:\n\nTitle:\n{title}\n\n"
             f"First few paragraphs:\n{content}\n\nWhat is this article about?")
    about = llm.chat([{"role": "user", "content": step1}])
    step2 = ("Step 2\n\nI want to find articles similar to this one in terms of the general "
             "topic. What should I search for? Output one search phrase (in double quotes).")
    reply = llm.chat([{"role": "user", "content": step1},
                      {"role": "assistant", "content": about},
                      {"role": "user", "content": step2}], temperature=0)
    m = re.findall(r'"([^"\n]{3,80})"', reply)
    phrase = m[-1] if m else reply.strip().splitlines()[-1]
    phrase = phrase.strip(" .\"'")
    return _title_case(phrase), about.strip()


def match_topic(new_topic, existing):
    """Stand-in for SentenceBERT clustering: does the topic match an existing one?"""
    if not existing:
        return None
    listing = "\n".join(f"- {t}" for t in existing)
    prompt = (f"A new web page has the topic \"{new_topic}\".\n\nHere are existing topics:\n"
              f"{listing}\n\nIs the new topic about the same general subject as one of the "
              "existing topics (for example, \"React vs Svelte\" and \"Comparison of JavaScript "
              "frameworks\" are the same general subject, but \"best baby strollers\" and "
              "\"best car seats\" are not)? Output JSON: {\"match\": \"<existing topic exactly as "
              "written>\" or null, \"reason\": \"...\"}")
    try:
        out = llm.chat_json([{"role": "user", "content": prompt}], temperature=0)
    except llm.LLMError:
        return None
    m = out.get("match") if isinstance(out, dict) else None
    if not m:
        return None
    for t in existing:
        if t.strip().lower() == str(m).strip().lower():
            return t
    return None


# --------------------------------------------------------------------------
# D.3  Commonly considered criteria (Self-Refine until ~20, then rank)
# --------------------------------------------------------------------------
STEP1_CRITERIA = ("What are some common aspects, criteria, or dimensions that people consider on "
                  "the topic of {topic}? Note that the criteria should be **most relevant to the "
                  "topic**, **frequently considered**, and can **cover a broad range of "
                  "perspectives**. Output should be a single bulleted list in the format of:\n\n"
                  "- Criterion: short description.\n\nDo not output anything else.")
STEP2_CRITERIA = ("Give me five more that are different from, more diverse than, and possibly as "
                  "important as the ones listed above. Output in the same format.")


def _parse_bullets(text):
    out = []
    for line in text.splitlines():
        line = line.strip()
        m = re.match(r"^(?:[-*•]|\d+[.)])\s*\**([^:*]{2,60})\**\s*:\s*(.+)$", line)
        if m:
            name = m.group(1).strip(" -*")
            desc = m.group(2).strip().rstrip("*")
            if name and desc:
                out.append({"name": _title_case(name), "description": desc})
    return out


def _dedupe(items, existing_names=()):
    seen = {n.strip().lower() for n in existing_names}
    out = []
    for it in items:
        k = it["name"].strip().lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(it)
    return out


def generate_criteria(topic, target=TARGET_CRITERIA, log=None):
    """Initial set, then 'five more' rounds (Self-Refine) until about 20."""
    messages = [{"role": "user", "content": STEP1_CRITERIA.format(topic=topic)}]
    reply = llm.chat(messages)
    criteria = _dedupe(_parse_bullets(reply))
    rounds = 0
    while len(criteria) < target and rounds < 4:
        rounds += 1
        if log:
            log(f"criteria: {len(criteria)} so far, asking for five more")
        messages += [{"role": "assistant", "content": reply},
                     {"role": "user", "content": STEP2_CRITERIA}]
        reply = llm.chat(messages)
        new = _dedupe(_parse_bullets(reply), [c["name"] for c in criteria])
        if not new:
            break
        criteria += new
    return criteria


def more_criteria(topic, existing, n=5):
    """'Request more criteria' (Figure 1 c3): five more, without repetition."""
    listing = "\n".join(f"- {c['name']}: {c['description']}" for c in existing)
    messages = [{"role": "user", "content": STEP1_CRITERIA.format(topic=topic)},
                {"role": "assistant", "content": listing},
                {"role": "user", "content": STEP2_CRITERIA + (
                    " Do not repeat any criterion already listed above, even under another name.")}]
    reply = llm.chat(messages)
    return _dedupe(_parse_bullets(reply), [c["name"] for c in existing])[:n]


def rank_criteria(topic, criteria):
    """Ask the model to rank criteria by importance; returns the names in order."""
    listing = "\n".join(f"- {c['name']}: {c['description']}" for c in criteria)
    prompt = (f"Here are criteria that people consider on the topic of {topic}:\n\n{listing}\n\n"
              "Rank them from most to least important for a typical person exploring this "
              "topic. Output JSON: {\"ranked\": [\"criterion name\", ...]} using the exact names "
              "above, each exactly once.")
    try:
        out = llm.chat_json([{"role": "user", "content": prompt}], temperature=0)
        ranked = [str(x) for x in out.get("ranked", [])]
    except llm.LLMError:
        return [c["name"] for c in criteria]
    by_lower = {c["name"].lower(): c["name"] for c in criteria}
    order = []
    for r in ranked:
        k = r.strip().lower()
        if k in by_lower and by_lower[k] not in order:
            order.append(by_lower[k])
    for c in criteria:
        if c["name"] not in order:
            order.append(c["name"])
    return order


# --------------------------------------------------------------------------
# D.2  Options encountered on a page
# --------------------------------------------------------------------------
STEP1_OPTIONS = ("Step 1\n\nGiven the following information of an article:\n\nTitle:\n{title}\n\n"
                 "Is the article likely to be discussing one or more aspects of \"one specific "
                 "option\" (e.g., a single javascript framework, for example, React, or a single "
                 "baby stroller option, or a specific Airbnb listing) or \"multiple "
                 "options/topics\"? Output in the following format:\n\nReasoning: your reasoning "
                 "process.\n\nVerdict: \"one specific option / multiple options\"")
STEP2_OPTIONS = ("Step 2\n\nNow, given the content of the article below, what is/are the "
                 "options?\n\nContent:\n\n{content}\n\nOutput should be in the following format: "
                 "[\"option_1\", \"option_2\", ...]")


def _chunks(paragraphs, max_words=CHUNK_WORDS):
    chunks, cur, n = [], [], 0
    for p in paragraphs:
        w = len(p.split())
        if cur and n + w > max_words:
            chunks.append(cur)
            cur, n = [], 0
        cur.append(p)
        n += w
    if cur:
        chunks.append(cur)
    return chunks


def extract_options(title, paragraphs):
    step1 = STEP1_OPTIONS.format(title=title)
    verdict = llm.chat([{"role": "user", "content": step1}], temperature=0)
    options = []
    for chunk in _chunks(paragraphs):
        content = "\n\n".join(chunk)
        reply = llm.chat([{"role": "user", "content": step1},
                          {"role": "assistant", "content": verdict},
                          {"role": "user", "content": STEP2_OPTIONS.format(content=content)}],
                         temperature=0)
        try:
            arr = llm.parse_json(reply)
            if isinstance(arr, dict):
                arr = arr.get("options") or next((v for v in arr.values() if isinstance(v, list)), [])
        except llm.LLMError:
            arr = re.findall(r'"([^"]{2,80})"', reply)
        for o in arr:
            if isinstance(o, str) and o.strip():
                options.append(o.strip())
    seen, out = set(), []
    for o in options:
        if o.lower() not in seen:
            seen.add(o.lower())
            out.append(o)
    return out, verdict


# --------------------------------------------------------------------------
# Paragraph-level annotation (stand-in for bart-large-mnli zero-shot NLI)
# --------------------------------------------------------------------------
def annotate_paragraphs(paragraphs, criteria, options):
    """Label each paragraph with the criteria and options it discusses.

    `paragraphs` is a list of (index, text). Returns {index: {"criteria": [...],
    "options": [...]}} where each entry is {"name", "score"} sorted by score.
    """
    crit = "\n".join(f"- {c['name']}: {c['description']}" for c in criteria) or "(none)"
    opts = "\n".join(f"- {o}" for o in options) or "(none)"
    body = "\n\n".join(f"[Paragraph {i}]\n{t}" for i, t in paragraphs)
    prompt = (
        "You perform zero-shot text classification. For EACH paragraph below, decide which of "
        "the listed **criteria** it discusses (explicitly or implicitly, e.g. \"I bought it for "
        "almost nothing\" discusses Price) and which of the listed **options** it mentions or is "
        "about. Give a score from 0 to 1 for how likely the paragraph discusses that criterion / "
        "option. Only include criteria and options with score >= 0.5. Use the exact names given.\n\n"
        f"**Criteria (with definitions)**:\n{crit}\n\n**Options**:\n{opts}\n\n"
        f"**Paragraphs**:\n\n{body}\n\n"
        "Output JSON only, in this format:\n"
        "{\"paragraphs\": [{\"index\": <paragraph number>, "
        "\"criteria\": [{\"name\": \"...\", \"score\": 0.9}], "
        "\"options\": [{\"name\": \"...\", \"score\": 0.8}]}, ...]}")
    out = llm.chat_json([{"role": "user", "content": prompt}], temperature=0)
    cnames = {c["name"].lower(): c["name"] for c in criteria}
    onames = {o.lower(): o for o in options}
    result = {i: {"criteria": [], "options": []} for i, _ in paragraphs}
    items = out.get("paragraphs", []) if isinstance(out, dict) else out
    for item in items or []:
        try:
            idx = int(item.get("index"))
        except (TypeError, ValueError, AttributeError):
            continue
        if idx not in result:
            continue
        for key, names in (("criteria", cnames), ("options", onames)):
            labels = []
            for lab in item.get(key, []) or []:
                if isinstance(lab, str):
                    lab = {"name": lab, "score": 0.8}
                name = names.get(str(lab.get("name", "")).strip().lower())
                try:
                    score = float(lab.get("score", 0.8))
                except (TypeError, ValueError):
                    score = 0.8
                if name and score >= SCORE_THRESHOLD and name not in [x["name"] for x in labels]:
                    labels.append({"name": name, "score": round(score, 2)})
            labels.sort(key=lambda x: -x["score"])
            result[idx][key] = labels
    return result


# --------------------------------------------------------------------------
# D.4  Zoom in: detailed analysis of one paragraph
# --------------------------------------------------------------------------
def zoom_in(content, criteria, options):
    crit = "\n".join(f"- {c['name']}: {c['description']}" for c in criteria)
    prompt1 = (
        f"Given the following **content** and list of **criteria**:\n\n**Content**:\n\n{content}\n\n"
        f"**Criteria (with definitions)**:\n\n{crit}\n\n"
        "For each criterion: 1) extract **every possible** utterance that **mentions** or "
        "**explicitly describes** that criterion from the content 2) perform sentiment analysis "
        "to determine if the utterance is \"positive\", \"neutral\", or \"negative\" with respect "
        "to that criterion. Remember to use the **exact same words** from the content. Do not "
        "paraphrase!\n\nOutput must follow the format below:\n\n## criterion_1_name\n\n"
        "- \"extracted_sentence_or_phrase_1\" -> positive,\n\n- \"extracted_sentence_or_phrase_2\" "
        "-> neutral,\n\n## criterion_2_name\n\nNONE FOUND\n\n## criterion_3_name\n\n"
        "- \"extracted_sentence_or_phrase_1\" -> neutral,\n\n- \"extracted_sentence_or_phrase_2\" "
        "-> negative,\n\n- \"extracted_sentence_or_phrase_3\" -> positive,")
    reply = llm.chat([{"role": "user", "content": prompt1}], temperature=0)
    phrases = _parse_zoom(reply, [c["name"] for c in criteria], content)
    if phrases and options:
        listing = "\n".join(f"- \"{p['phrase']}\"" for p in phrases)
        opts = ", ".join(options)
        prompt2 = (
            f"Given the following **content** and the **phrases** extracted from the content "
            f"below:\n\n**Content**:\n\n{content}\n\n**Extracted phrases**:\n\n{listing}\n\n"
            f"For each phrase, determine the **subject** of the phrase based on the **content**. "
            f"Possible subjects are: [{opts}] Say \"N/A\" if you cannot determine the subject. "
            "Output should be in the following format:\n\n\"extracted phrase 1\" -> \"subject\" "
            "or \"N/A\"\n\n\"extracted phrase 2\" -> \"subject\" or \"N/A\"\n\n...")
        try:
            reply2 = llm.chat([{"role": "user", "content": prompt2}], temperature=0)
            subjects = {}
            for m in re.finditer(r'"(.+?)"\s*->\s*"?([^"\n]+)"?', reply2):
                subjects[m.group(1).strip().lower()] = m.group(2).strip().strip('"')
            for p in phrases:
                s = subjects.get(p["phrase"].lower(), "N/A")
                p["subject"] = None if s.upper() == "N/A" else s
        except llm.LLMError:
            pass
    return phrases


def _parse_zoom(reply, criterion_names, content):
    by_lower = {c.lower(): c for c in criterion_names}
    out = []
    current = None
    for line in reply.splitlines():
        line = line.strip()
        h = re.match(r"^#+\s*(.+?)\s*$", line)
        if h:
            name = h.group(1).strip("* ").strip()
            current = by_lower.get(name.lower()) or _closest(name, criterion_names)
            continue
        m = re.match(r'^[-*]\s*["“](.+?)["”]\s*->\s*(positive|neutral|negative)', line, re.I)
        if m and current:
            phrase = m.group(1).strip()
            sentiment = m.group(2).lower()
            start = _find_in(content, phrase)
            if start is None:
                continue
            out.append({"phrase": content[start:start + len(phrase)], "start": start,
                        "end": start + len(phrase), "criterion": current,
                        "sentiment": sentiment, "subject": None})
    out.sort(key=lambda p: (p["start"], -(p["end"] - p["start"])))
    return out


def _find_in(content, phrase):
    i = content.find(phrase)
    if i != -1:
        return i
    i = content.lower().find(phrase.lower())
    if i != -1:
        return i
    # tolerate differences in whitespace/quotes
    pat = r"\s+".join(re.escape(w) for w in re.findall(r"\w+|[^\w\s]", phrase))
    m = re.search(pat, content, re.I)
    return m.start() if m else None


def _closest(name, names):
    n = name.lower()
    for c in names:
        if c.lower() in n or n in c.lower():
            return c
    return None


# --------------------------------------------------------------------------
# D3  Recommending criteria to search for next (relevance + diversity peeling)
# --------------------------------------------------------------------------
def recommend(topic, global_criteria, cared, skipped, candidates, n=2, beta=1.0):
    """Pick `n` of `candidates` (unseen criteria) that are relevant to what the user
    cared about yet diverse from each other, by greedy peeling (Wormald 1995).

    Vertex weight = relevance to the cared-about set (bridge scores, in place of
    GPT-2 perplexity). Edge weight = cosine distance between TF-IDF vectors of
    name+description (in place of SentenceBERT embeddings).
    """
    cands = [c for c in global_criteria if c["name"] in set(candidates)]
    if len(cands) <= n:
        return [c["name"] for c in cands]
    relevance = {c["name"]: 0.5 for c in cands}
    if cared:
        listing = "\n".join(f"- {c['name']}: {c['description']}" for c in cands)
        prompt = (f"On the topic of {topic}, a reader has paid attention to these criteria: "
                  f"{', '.join(cared)}." +
                  (f" They skipped these: {', '.join(skipped)}." if skipped else "") +
                  "\n\nFor each candidate criterion below, rate from 0 to 1 how likely it tends "
                  "to be considered together with (or is a trade-off with) the criteria the reader "
                  f"paid attention to.\n\nCandidates:\n{listing}\n\nOutput JSON: "
                  "{\"relevance\": {\"<criterion name>\": 0.0, ...}}")
        try:
            out = llm.chat_json([{"role": "user", "content": prompt}], temperature=0)
            rel = out.get("relevance", {}) if isinstance(out, dict) else {}
            lower = {k.lower(): v for k, v in rel.items()}
            for c in cands:
                v = lower.get(c["name"].lower())
                if v is not None:
                    relevance[c["name"]] = max(0.0, min(1.0, float(v)))
        except (llm.LLMError, TypeError, ValueError):
            pass
    vecs = {c["name"]: _tfidf([f"{x['name']} {x['description']}" for x in cands])[i]
            for i, c in enumerate(cands)}
    names = [c["name"] for c in cands]
    dist = {}
    for a in names:
        for b in names:
            if a < b:
                dist[(a, b)] = 1.0 - _cos(vecs[a], vecs[b])
    alive = list(names)
    while len(alive) > n:
        def weight(v):
            edges = sum(dist[tuple(sorted((v, u)))] for u in alive if u != v)
            return beta * relevance[v] * (len(alive) - 1) + edges
        alive.remove(min(alive, key=weight))
    return alive


def _tfidf(docs):
    toks = [re.findall(r"[a-z0-9]+", d.lower()) for d in docs]
    df = Counter()
    for t in toks:
        df.update(set(t))
    N = len(docs)
    vecs = []
    for t in toks:
        tf = Counter(t)
        vecs.append({w: (1 + math.log(c)) * math.log((N + 1) / (df[w] + 0.5)) for w, c in tf.items()})
    return vecs


def _cos(a, b):
    num = sum(v * b.get(k, 0.0) for k, v in a.items())
    da = math.sqrt(sum(v * v for v in a.values()))
    db = math.sqrt(sum(v * v for v in b.values()))
    return num / (da * db) if da and db else 0.0


def _title_case(s):
    s = s.strip()
    return s[:1].upper() + s[1:] if s else s
