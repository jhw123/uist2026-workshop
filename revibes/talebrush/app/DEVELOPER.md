# Developer walkthrough

## Setup

Read the adjacent README for the two-process launch. Application code uses only Python's standard library and native browser modules. Internet is required for Codex model calls. Google Fonts is optional: the UI falls back to system sans-serif and Georgia if unavailable. There are no runtime package dependencies, build step, .env secrets, author code or custom-trained weights.

## Files and data flow

- `server.py`: localhost-only threaded HTTP server, static assets, JSON endpoints, request size/content checks, origin checks, clean error responses. `--port` defaults to 5173. `TALEBRUSH_BRIDGE_URL` defaults to `http://localhost:8787`.
- `story.py`: validates the complete draft and generation indices, verifies bridge backend identity, sends JSON-format requests, parses model output and atomically returns updates. Recognition scores must be finite numbers in [0,1]. Any missing, duplicate, unexpected or malformed response fails without partially replacing the draft.
- `static/core.mjs`: pure slot/arc utilities, sparse pointer interpolation, speed-to-tolerance calibration and range eligibility. State consists of title, protagonist, slots (`id`, `text`, `source`, `fortune`), aligned controls/surprises, last range and surprise-panel visibility.
- `static/canvas.mjs`: renders fortune bands, tolerance envelope, actual recognized points, history overlays and surprise line in SVG. Pointer coordinates are normalized, interpolated over sentence columns, and sampled into control values. Hover updates existing dots without removing keyboard focus.
- `static/app.mjs`: editor and keyboard behaviors, async generation/recognition, linked hover, undo snapshots, history hover/restore, export and localStorage persistence. A generation locks editing to avoid stale replacement. Recognition allows editing but discards results if the draft revision changes. A stroke during recognition is queued; changing the draft cancels queued work. History preview is non-destructive until selection.
- `static/index.html`, `style.css`: accessible labels, help dialog, responsive editor/canvas layout, visible substitutions and model errors.
- `docs/design.md`, `implementation-plan.md`: approved reconstruction scope and execution plan.

## Endpoints

`GET /api/health` returns `{ok,backend,model,bridge,message}`. It checks bridge reachability and Codex identity only. It cannot guarantee model access.

`POST /api/recognize` accepts `{protagonist, slots:[{text,...}]}`. It sends nonempty sentences and the last three preceding nonempty sentences to recognition. Response: `{scores:[{index,fortune}]}`.

`POST /api/generate` accepts the draft plus `indices:[0-based index,...]`, aligned `controls:[null|{target,tolerance},...]`, and `surprises:[null|number,...]`. Nonempty human slots cannot be overwritten. First call produces 1 unconstrained, 2 normal or 3 tightly constrained candidates per selected slot. Second call scores each candidate independently, without target/tolerance data. Selection retains a first candidate within 0.2; otherwise it chooses minimum fortune error. Response: `{updates:[{index,text,fortune,source:"ai"}],candidate_count,recognition}`. Updates outside the requested indices are rejected.

Requests are capped at 200KB; each slot at 4,000 characters; protagonist at 100; title at 200. One draft has at most 30 slots and a request at most 24 selected slots. HTTP POST requires JSON and the local app origin (or no Origin for a CLI client). The bridge is called on the backend, never from browser code. API failures surface in an alert with the draft retained.

## Tests

From this app directory:

```sh
python3 -m unittest discover -s tests -v
node --test tests/core.test.mjs
node --check static/app.mjs
node --check static/canvas.mjs
```

Python tests exercise candidate selection, anchor preservation, independent scoring inputs, recognition across gaps, bad indices, invalid scores and incomplete responses. Node tests exercise interpolation, single-point strokes, erase gaps, speed effects, aligned insertion/deletion and protected sentence ranges. These tests inject deterministic model responses and do not consume the group's plan. Browser verification and live-integration limitations are recorded in `../changes/build.md`.

## Paper mapping

| Paper | Implementation |
| --- | --- |
| §4.2.1; Figure 1 | Sentence slots, insertion/deletion, editable text, visual gaps, recognized fortune points |
| §4.2.2; Figures 1 and 4 | Draw/release, continuation, infilling, redrawing ranges, Generate Again, eraser, speed tolerance, surprise canvas |
| §4.2.3; Figure 5 | Saved stories, translucent comparison arcs, hover/focus preview, rollback |
| §5.2.1 | Separate fortune recognition with protagonist and preceding context; prompt substitute |
| §5.2.2; Figures 7, 9 and 10 | Continuous fortune targets and candidate selection; prompt/batching substitutes |

Training data collection, soft-prompt learning, modified GeDi token distributions, TrueSkill calibration and experimental evaluation are not recreated. Features suggested only as future work (multiple protagonists, flashbacks, longer-form hierarchical story controls) are outside the implemented prototype.

## Repository practice

All new application files are under `revibes/talebrush/`. Shared bridge and paper files remain unchanged. The downloaded PDF is beside the checkout at `../TaleBrush-CHI2022.pdf`. The group's requested identity is recorded in the README; changes are on `codex/talebrush-table1-group2`. Do not push main, access the grading rubric, produce grades or advance workshop steps without the group's prompt.
