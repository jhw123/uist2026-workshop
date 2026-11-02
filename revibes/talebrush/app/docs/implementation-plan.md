# TaleBrush implementation plan

**Goal:** A local, usable reconstruction from the paper, with the approved Codex bridge substitution.

**Architecture:** Python serves static assets and validated generation/recognition endpoints. Pure JavaScript state/arc utilities are separate from SVG rendering and editor/history controls. No third-party application dependencies.

**Execution:** Inline in the newly cloned checkout on `codex/talebrush-table1-group2`. Existing workshop files remain unchanged. The group has already approved this design; complete the initial build, then stop before the separate feature-check and grading prompts.

## Tasks

- [x] Write and run failing built-in Python tests for input validation, preserving unselected context, independently scoring candidates, selection at the 0.2 threshold, and malformed results. Files: `tests/test_story.py`, `story.py`.
- [x] Implement the minimal model adapter and generation/recognition functions; run `python3 -m unittest discover -s tests -v` until passing.
- [x] Write and run failing Node tests for stroke interpolation, single-point strokes, speed/tolerance, erased segments, sentence insertion/removal and generation ranges. Files: `tests/core.test.mjs`, `static/core.mjs`.
- [x] Implement the pure state and sketch utilities; run `node --test tests/core.test.mjs` until passing.
- [x] Create `server.py`: localhost HTTP serving, JSON APIs, health reporting, bounded requests and useful errors. Start with `python3 server.py` and check `/api/health` and `/`.
- [x] Create `static/index.html`, `style.css`, `app.mjs` and `canvas.mjs`: sentence editing, fortune and surprise sketches, regeneration, linked hover, draft persistence, undo, history hover/restore and translucent comparison arcs. Use no generated raster assets because the paper's interface is code-native.
- [x] Write `README.md`, `DEVELOPER.md` and `../changes/build.md`: launch/use instructions, architecture, paper feature mapping, assumptions and explicit model/batching substitutions. Keep `changes/v1.md` reserved for the later feature-check prompt.
- [x] Run both test suites and JavaScript syntax checks. Verify browser rendering, real bridge generation, and preservation of text outside a redrawn range. Report observed checks and remaining limitations. Commit only the TaleBrush build; do not push or access the rubric.
