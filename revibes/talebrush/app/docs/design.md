# TaleBrush reconstruction design

Approved by the group on 2026-11-02: reproduce the paper's interactions locally, substituting the workshop Codex bridge for the original trained models.

## Evidence and scope

The implementation is based on `papers/talebrush/paper/`, particularly sections 3, 4, 5 and figures 1, 4, 5, 7 and 9. No authors' implementation, demo or video is used. The original 19-page PDF is downloaded beside the workshop checkout as `TaleBrush-CHI2022.pdf`. This is the initial build prompt, not the subsequent feature-check or grading procedure.

## Approach

Use browser-native JavaScript and SVG with a standard-library Python HTTP backend. React plus Flask would match the original framework choices but adds unnecessary installation. Recreating the original soft prompt training and modified GeDi would require the authors' trained artifacts or a separate data collection/training effort; the group approved a bridge substitution instead.

## Interaction contract

- Each editable row is one sentence slot. Enter inserts a slot; Backspace on an empty slot removes it. Empty slots are visible gaps. Author text and generated text have different colors.
- An SVG canvas maps sentence position to x and fortune [0,1] to y. Recognized fortunes of existing sentences appear as dots and connected lines with breaks at empty slots. Hover connects text and points.
- Drawing creates a green tolerance envelope. Slow drawing means a narrower envelope and up to three candidate sentences; faster drawing means a wider envelope and two candidates. Releasing a stroke generates only the touched range. Redrawing replaces that range. Generate Again repeats the last range. Erasing removes fortune constraints but keeps the range eligible for unconstrained generation.
- Continuation respects earlier text; infilling respects earlier and later anchors. Direct edits become author anchors. A separate optional canvas specifies per-slot surprise.
- Every generated story is retained locally. A history dropdown previews text/arcs on hover or keyboard focus, overlays saved arcs, and restores a selected complete snapshot. Edits survive reload through localStorage. Undo restores the preceding local action.

## Model flow

The backend calls the existing Codex bridge. One batched request creates 2-3 candidates per requested slot, considering all fixed context. A second independent recognition request receives text and up to three preceding context sentences, never target fortunes, and returns scores. If the first candidate misses its target by more than 0.2, select the closest of the allowed candidates. Return actual recognized scores; never plot target values as recognized output. The batch approach substitutes for sequential bidirectional generation and regeneration, and surprise uses prompt instructions because bridge temperature is ignored. Label these differences in the UI and documentation.

## Failure behavior

Bind only to localhost. Validate sizes, slots, indices, scores, backend identity and model JSON. Invalid or unavailable model responses produce visible errors, preserve the draft and allow retry. Never silently replace live generation with canned text. Disable editor and drawing mutations during requests to prevent stale responses. A health endpoint reports actual bridge availability/backend.

## Verification

Test drawing interpolation, erased gaps, slot insertion/removal, preserving anchors, generation selection, independent recognition prompts and malformed model output with Node/Python built-in test runners. Start the app and bridge, verify HTTP and browser interactions, then perform one small live generation. Document limitations honestly without grading the group's rubric.
