# Selenite revibe: developer guide

## Requirements

- Python 3.9 or newer. Only the standard library is used (no `pip install`).
- The workshop LLM bridge (`llm-bridge/bridge.py` in the repository root), which
  needs the `claude` command-line tool signed in. Selenite talks to it with the
  OpenAI Chat Completions format at `http://localhost:8787/v1/chat/completions`.
- A modern browser. The frontend is plain HTML, CSS and JavaScript; there is no
  build step and no Node dependency.

## Run

    # terminal 1, repository root
    python3 llm-bridge/bridge.py claude
    # terminal 2, repository root
    python3 revibes/selenite/app/server.py        # http://localhost:8790

Environment variables: `PORT` (server port, default 8790), `BRIDGE_URL`
(default `http://localhost:8787`), `BRIDGE_TIMEOUT` (seconds per model call,
default 300).

## Layout

    server.py              HTTP server: static files + JSON API (routes below)
    selenite/store.py      JSON-file store (topics, pages); stands in for Firebase
    selenite/llm.py        bridge client; retry with random 1–5 s delay, up to 5 tries
    selenite/extract.py    fetches a URL, extracts title + paragraphs from HTML
    selenite/pipeline.py   the paper's language-model tasks (prompts from Appendix D)
    static/index.html      the interface shell (top bar, home/library, reader, sidebar)
    static/app.js          all interface logic
    static/styles.css      styling modelled on the paper's Figures 1, 3 and 4
    samples/*.json         bundled articles (one transcribed from Figure 5 of the paper)
    data/db.json           created on first use; delete to reset

## Data model

```
topic: { id, name, created, criteria_status,
         criteria: [{ id, name, description, pinned, source: "model"|"user" }],
         options:  [{ id, name, pinned, pages: [page_id] }],
         pages: [page_id] }
page:  { id, url, title, source: "url"|"text"|"sample", topic_id,
         recognized_topic, topic_about, options: [name], options_verdict,
         paragraphs: [{ index, tag: "p"|"h", text, annotated,
                        criteria: [{ name, score }], options: [{ name, score }],
                        zoom: null | [{ phrase, start, end, criterion, sentiment, subject }] }],
         read: [paragraph index], recommendations: [criterion name] }
```

Criteria and options are referenced by name inside paragraph annotations;
renaming or deleting one in the API rewrites those annotations.

## How a page is processed

The frontend drives the stages so the interface fills in progressively
(`startPage` in `app.js`):

1. `POST /api/pages` with `{url}` | `{text,title,url}` | `{sample}` → extract paragraphs.
2. `POST /api/pages/:id/topic` → `pipeline.recognize_topic` (Appendix D.1, two-step
   prompt: "what is this article about" then "one search phrase"), then
   `pipeline.match_topic` clusters it with an existing topic or creates one.
   Send `{topic_id}` or `{new_topic}` in the body to assign the page by hand.
3. In parallel:
   - `POST /api/topics/:id/criteria/generate` → `pipeline.generate_criteria`
     (D.3: initial list, then "five more" rounds until ~20) + `rank_criteria`.
   - `POST /api/pages/:id/options` → `pipeline.extract_options` (D.2: single vs
     multiple options verdict, then extraction, chunked at ~3000 words).
4. `POST /api/pages/:id/annotate` with `{indices}` (8 paragraphs per call, 3 calls
   in flight) → `pipeline.annotate_paragraphs`, the stand-in for the NLI model.
   With `{criteria_ids}` it labels only those criteria and merges the result
   (used after "Request more criteria" / "Add a criterion").

On demand:

- `POST /api/pages/:id/paragraphs/:i/zoom` → `pipeline.zoom_in` (D.4: phrase +
  sentiment extraction, then subject labelling with the page's options).
- `POST /api/pages/:id/recommend` with `{cared, skipped}` → `pipeline.recommend`:
  candidates are criteria never labelled on any page of the topic; vertex weight
  = model relevance to the cared-about set, edge weight = TF-IDF cosine distance;
  greedy peeling (drop the lowest-weight vertex) down to 2.
- `POST /api/pages/:id/reading` with `{read}` persists dwell-time progress.

Editing: `POST/PATCH/DELETE /api/topics/:id`, `/criteria`, `/criteria/:cid`,
`/criteria/reorder`, `/criteria/more`, `/options`, `/options/:oid`,
`/options/reorder`. `GET /api/state` lists topics, pages and samples;
`GET /api/health` reports the bridge.

## Frontend notes

- Dwell-time tracking: an `IntersectionObserver` (60 % visible) accumulates
  visible time per paragraph; at 2 s the paragraph is marked read (left rule)
  and the summary block updates. Reaching the summary block triggers the
  recommendation call once per reading state; **Suggest** forces it.
- Navigation: `navigate(name, kind, dir)` keeps a pointer per label; clicking an
  in-situ chip jumps to the next paragraph with that label; the expanded sidebar
  card's ‹ › buttons do the same.
- Zoom-in rendering wraps non-overlapping phrase spans (sorted by start, longest
  first) in `.zoom.positive|negative|neutral` with a `.zlabel` for criterion and option.

## Tuning

- `pipeline.SCORE_THRESHOLD` (0.5): minimum label score to keep.
- `pipeline.TARGET_CRITERIA` (20), `pipeline.CHUNK_WORDS` (3000).
- `app.js`: `READ_MS` (2000), `BATCH` (8), `PARALLEL` (3). The bridge allows 4
  concurrent calls; more just queue.
- A stronger model: restart the bridge with `BRIDGE_MODEL=sonnet`.

## Known limits

- Pages rendered by JavaScript or behind bot protection extract nothing or
  little; paste the text instead.
- Each model call takes a few seconds; a 150-paragraph page takes about a
  minute to annotate fully (chips appear as batches finish).
- No authentication or multi-user support (the paper used Firebase auth).
