# Characters and dimensions implementation plan

**Goal:** Multiple named characters, four built-in dimensions, custom dimensions, and joint model control with migrated drafts.

**Architecture:** `tracks.mjs` owns cast/dimension state, migration and selected SVG views. Existing editor/canvas controllers use that state without losing the original interactions. `multi_story.py` validates the new protocol and adapts batched generation/recognition through the unchanged bridge; `story.py` dispatches by payload while preserving legacy clients.

**Execution:** Inline on `codex/talebrush-characters-dimensions`, based on clean commit cf51ffb. The group approved the design choice. No additional installation or worktree is necessary for the designated local checkout.

- [x] Add failing Node tests in `tests/tracks.test.mjs` covering independent tracks, legacy draft/history migration, row alignment, removal and custom endpoints. Implement `static/tracks.mjs` and integrate `static/core.mjs` insertion/deletion. Verify with `node --test tests/*.test.mjs`.
- [x] Add failing Python tests in `tests/test_multi_story.py` for joint constraints, separate recognition, aggregate candidate selection, unknown/duplicate IDs, malformed output, opposite character scores and legacy compatibility. Implement `multi_story.py` and minimal dispatch in `story.py`. Verify with `python3 -m unittest discover -s tests -v`.
- [x] Add cast/dimension controls and forms to `index.html`, with their rendering/events in `static/cast.mjs`. Adapt `app.mjs` to read/write selected track views, handle migration/backups and apply multi-track responses. Give `canvas.mjs` dimension-aware labels. Update CSS to fit the existing studio and narrow screens.
- [x] Update README/DEVELOPER/help and remix notes. Keep initial paper-reconstruction notes intact. Restart only the owned app server after backend changes and reuse the existing Codex bridge.
- [x] Run all built-in tests, syntax checks and diff checks. Browser-test migration, independent sketches, character/custom-dimension controls, reload and history; verify one bounded live request. Review, commit locally and keep the app available on localhost:5173.
