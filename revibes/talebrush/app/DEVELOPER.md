# TaleBrush: developer notes

## Requirements

- Python 3.8+ (standard library only; no pip installs).
- A modern browser.
- The workshop LLM bridge (`llm-bridge/`, in this repository) with the
  `claude` command signed in. Start it from the repository root with
  `python3 llm-bridge/bridge.py claude`. Check it with
  `curl http://localhost:8787/health`.

No API keys are used and no `.env` file is needed.

## Layout

    app/
      server.py          backend: static file server + REST API + model prompts
      static/index.html  page structure (editor, canvases, toolbar)
      static/style.css   styles
      static/app.js      all interface logic (no framework, no build step)

The paper's front end is React with a Flask back end. This rebuild uses plain
JavaScript and Python's `http.server`, so there is nothing to install or build.

## Running

    python3 llm-bridge/bridge.py claude              # terminal 1, repo root
    python3 revibes/talebrush/app/server.py [port]   # terminal 2, default port 5175

Environment: `BRIDGE_URL` (default `http://localhost:8787`), `PORT`.

## Back end (`server.py`)

It mirrors the paper's two modules (Section 5.2). Both send prompts to the bridge's
OpenAI-compatible endpoint `/v1/chat/completions` and ask for a JSON answer
(`response_format: json_object`).

| Endpoint | Request | Response |
|---|---|---|
| `GET /api/health` | | bridge status |
| `POST /api/recognize` | `{protagonist, story: [str], indices: [int]}` | `{fortunes: {index: 0..1}}` |
| `POST /api/generate` | `{protagonist, story: [str], index, mode, target: 0..1 or null, surprise: 0..1, retries: 0..2}` | `{text, fortune, attempts: [{text, fortune}]}` |

**Recognition** (paper 5.2.1). The model rates the protagonist's fortune in a
target sentence on a 0–1 scale. It sees the protagonist's name and at most
three previous sentences, as in the paper. Several sentences are rated in one
call. Results are cached in memory by (protagonist, context, sentence).

**Generation** (paper 5.2.2). One sentence per call. `story` holds every slot,
with blanks as empty strings. The prompt marks the slot to write and the blank
slots that will be filled later. `mode` is one of:

- `continue`: continuation (nothing written after this run of slots)
- `infill_prev`: infill after the previous context
- `infill_next`: infill leading into the next context

The fortune target becomes a number plus a word (bad, neutral, good, ...). The
surprise value becomes an instruction. The bridge ignores temperature, so the
paper's "surprise = softmax temperature" cannot be used directly.

**Regeneration loop** (paper 5.2.2). After a sentence is generated, it is
recognized. If `|fortune − target| > 0.2`, the server generates again, up to
`retries` more times, and keeps the attempt with the smallest error. Each
retry prompt lists the earlier attempts and their fortunes, so the model
writes something different. Unconstrained slots (`target: null`) are generated
once.

## Front end (`static/app.js`)

State lives in one `state` object:

- `bullets`: `{text, source: 'user'|'ai', fortune, recText, pending}` per slot.
  `recText` remembers the text and context the fortune was computed for, so
  only stale sentences are re-recognized (debounced 0.9 s after typing).
- `sketch`: 600 columns across the canvas, each `{y, w}` or `null`. `y` is the
  fortune and `w` the envelope half-width. A stroke overwrites the columns it
  passes; the eraser sets them to `null`.
- `surprise`: 600 columns, each a number or `null`.
- `history`: stored snapshots (bullets, sketch, surprise).

Slots map to x by `slot i ↔ columns [i/N, (i+1)/N)`, where N is the number of
bullets. A slot's target, width and surprise are averaged over the central half
of its columns (the paper's "sentence units"). Adding or removing bullets
therefore rescales the existing sketch.

**Speed → width.** The pointer speed (px/ms, smoothed) is mapped linearly to a
half-width from 0.04 to 0.30 fortune units (`MIN_HALF_WIDTH`, `MAX_HALF_WIDTH`).
The envelope is drawn with the width smoothed, so it changes gradually, but a
slot uses its own average width. A width below `TIGHT_WIDTH = 0.15` gives 2
retries, otherwise 1, which matches the paper's "1–2 more times".

**What is generated after a stroke** (`generationTargets`):

- slots whose sketch changed and that are empty or AI-generated;
- a sketched slot gets the sketched fortune as its target;
- an unsketched slot between sketched slots (an erased part) gets no target;
- slots with text the writer typed or edited are never overwritten.

"Generate Again" applies the same rules to every slot.

**Order** (`runGeneration`). The target slots are grouped into runs of
consecutive slots and processed left to right. A run with written text after
it is infilled alternately from its front (`infill_prev`) and back
(`infill_next`), as the paper alternates its two infilling prompts. Other runs
are continued left to right. Each sentence is shown as soon as it arrives. A
snapshot is stored in History after each generation, and an "Initial"
snapshot before the first.

## Testing

There is no automated test suite. A quick check of the API:

    curl -s localhost:5175/api/generate -H 'Content-Type: application/json' \
      -d '{"protagonist":"Mike","story":["Mike plays jazz guitar.","",""],"index":1,"mode":"continue","target":0.1,"surprise":0.3,"retries":1}'

## Known limits

- Model calls are sequential per sentence, as the next sentence depends on the
  previous one. Expect 3–5 s per call.
- Fortune values come from an LLM's judgment, not the paper's recognizer
  trained on crowd annotations. They are coarser (often 0.1 / 0.7 / 0.95).
- Nothing is saved across page reloads.
