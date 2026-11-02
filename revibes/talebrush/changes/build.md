Built by Codex (GPT-6) from the paper for table 1, group 2, 2026-11-02.

Initial build, before the workshop's separate feature-check prompt. The local interface and tested model adapter are implemented. The shell's older CLI initially rejected model calls; using the desktop app's bundled CLI with the configured `gpt-6.1-sol` model fixed live recognition and generation. The working bridge launch command is recorded in the README.

## Built

- Editable sentence slots linked to the fortune canvas, with gaps, author/generated distinction, insertion, deletion and direct editing.
- Fortune sketching, speed-sensitive tolerance envelope, partial regeneration, continuation and infilling with fixed text anchors; erasing removes constraints.
- Separate surprise sketch, generation history with hover/focus previews and overlaid arcs, rollback, local undo, browser draft persistence and text export.
- Backend candidate generation and independent fortune recognition through the unchanged workshop Codex bridge; request/response validation and visible failures.

## Instructions from the group

- Clone the workshop repository, get the paper and reimplement TaleBrush following the workshop instructions.
- Approved local web app with Codex bridge replacing the original trained models.

## Assumptions

One slot is one sentence step, up to 30 steps. Author edits become fixed anchors. A drawn range replaces eligible AI/empty rows only. Pointer-speed normalization and envelope widths are chosen locally because exact calibration is not specified. Generated histories retain complete draft/control snapshots.

## Substitutions

Browser JavaScript/SVG and Python standard-library server replace React/Flask. Prompt-based Codex replaces trained GPT-Neo/GeDi; candidates are batched and scored in a second independent call. Infilling considers both fixed contexts in one pass. Surprise is prompted because bridge temperature is ignored. Model/training quality and published evaluation results are not reproduced. These substitutions are visible in the interface and help.

## Verification and limits

Seven Python tests, five Node tests and JavaScript syntax checks pass. Browser smoke testing and code review found/fixed generation waiting on recognition, queue cancellation, history scaling, keyboard point focus/default Enter behavior, recognition context across empty slots and score invalidation when renaming the protagonist. A real downward sketch generated four appropriate sentences, left the two author sentences untouched, plotted independently recognized fortunes and saved history. A queued partial redraw changed sentence 5 only. Reload preserved the draft; keyboard history preview and sentence insert/delete were checked. Surprise sketching updated its line; erasing split a fortune envelope into two groups, and Undo restored it. Desktop (1280px) and narrow (390px) layouts were checked, with no horizontal overflow at 390px and no browser console errors. The bridge health endpoint reports Codex. No rubric was accessed or graded, no authors' code/video/demo was used, and no workshop step beyond the initial build was run.
