# TaleBrush (revibed): developer guide

## Requirements

- Python 3.8 or newer. The server uses only the standard library: nothing to
  `pip install`.
- A modern browser (Chrome, Firefox, Safari). The front end is plain HTML, CSS
  and JavaScript with no build step and no external libraries.
- The workshop LLM bridge (`llm-bridge/bridge.py` at the repository root) and a
  signed-in `claude` command line. Do not modify the bridge; it is shared.

## Run

    # terminal 1, repository root
    python3 llm-bridge/bridge.py claude          # listens on :8787
    # terminal 2
    cd revibes/talebrush/app
    python3 server.py [port]                     # default 8790

Environment variables for `server.py`:

| Variable | Default | Meaning |
|---|---|---|
| `BRIDGE_URL` | `http://localhost:8787` | where the LLM bridge listens |
| `PORT` | `8790` | port if none is given as an argument |

Port 5000 is avoided on purpose (macOS AirPlay uses it).

## Layout

    app/
      server.py          REST API + static file server (stands in for the paper's Flask back end)
      static/index.html  page structure: editor, canvas, surprise panel, tools, history
      static/style.css   styling
      static/app.js      all front-end logic (state, editor, sketching, rendering, generation loop)

## Architecture

The paper (section 4.3) splits a React front end from a Flask back end that runs
the models. This rebuild keeps that split:

```
browser (app.js)  --POST /api/recognize-->  server.py --/v1/chat/completions--> LLM bridge --> claude -p (Haiku)
                  --POST /api/generate --->
```

### `POST /api/recognize` — recognition module (paper 5.2.1)

```json
{"protagonist": "Mike", "items": [{"context": ["prev sentence", "..."], "sentence": "target"}]}
→ {"fortunes": [0.72, 0.10]}
```

At most three previous sentences are used as context, as in the paper. All items
are scored in one model call. The system prompt defines fortune with anchor
examples at 0, 0.25, 0.5, 0.75 and 1 (standing in for the paper's calibration
sentences).

### `POST /api/generate` — generation module (paper 5.2.2)

```json
{"protagonist": "Mike", "mode": "continue | infill_prev | infill_next",
 "prev": ["..."], "next": ["..."], "target": 0.1 | null, "surprise": 0.3, "max_regen": 1 | 2}
→ {"sentence": "...", "fortune": 0.08, "mode": "...", "target": 0.1,
   "generations_used": 1, "attempts": [{"sentence": "...", "fortune": 0.08}, ...]}
```

- `target` is the sketch's y value at the slot (the paper's continuous control
  code); `null` means unconstrained (erased part of the sketch).
- The model is asked for `1 + max_regen` candidates (1 if unconstrained); the
  recognition module scores them; the first within 0.2 of the target is used,
  otherwise the closest (paper: threshold 0.2, 1–2 regenerations).
- `surprise` (0–1) is turned into an instruction from "most predictable" to
  "highly surprising".
- The three prompt layouts follow Figure 9: continuation (beginning story,
  character, continue), infill from previous (character, ending, beginning,
  infilled), infill from next (character, beginning, ending, infilled).

### Front end (`static/app.js`)

State lives in one `state` object:

- `lines`: one entry per bullet — `{text, source: "user"|"generated", fortune, target, pending, dirty}`.
- `strokes`: fortune sketch as polylines of `{x, y, w}`; `x` is in **slot units**
  (slot *i* spans `[i, i+1]`, centre `i+0.5`), `y` is fortune 0–1, `w` is the
  envelope half-width.
- `surpriseStrokes`: same, without `w`.
- `history`: stored stories (lines + sketches).

Key behaviours and where they are:

| Behaviour | Function |
|---|---|
| Speed → width: smoothed pointer speed (px/ms) mapped linearly to half-width 0.05–0.28 | `widthForSpeed`, `attachSketch` |
| Width → tightness: half-width < 0.14 gives 2 regenerations, else 1 | `generateFor` (`TIGHT_WIDTH`) |
| Slot value from sketch: interpolate the stroke at the slot centre; last stroke wins; ends within 0.3 slot snap | `sampleSlot` |
| Redrawing replaces the old sketch in the new stroke's x range | `cutRange` |
| Eraser splits strokes where it passes | `eraseAt` |
| Which slots to generate on pen-up: slots under the new stroke + blank unsketched slots between sketched ones | `withUnconstrainedGaps` |
| Order of generation: per contiguous run; continuation if nothing follows, else alternate infill-from-previous (left end) and infill-from-next (right end) | `generateFor` |
| Recognition after editing: debounced 0.9 s, batch of changed lines | `scheduleRecognition`, `runRecognition` |
| Arc rendering: Catmull-Rom curve through recognised fortunes; gaps at blank lines; blue for generated, gray for writer's | `drawArc` |
| History: hover preview, faint arcs, roll back, rename, delete | `renderHistory`, `previewHistory`, `rollBack` |

Tunable constants are at the top of `app.js` (`DEFAULT_SLOTS`, `DEFAULT_SURPRISE`,
`W_MIN`, `W_MAX`, `SPEED_SLOW`, `SPEED_FAST`, `TIGHT_WIDTH`, `ERASER_RADIUS`) and
of `server.py` (`ERROR_THRESHOLD`, `RECOGNITION_CONTEXT`).

## Testing the API by hand

    curl -s localhost:8790/api/health
    curl -s localhost:8790/api/recognize -H 'Content-Type: application/json' \
      -d '{"protagonist":"Mike","items":[{"context":[],"sentence":"Mike broke his hand."}]}'
    curl -s localhost:8790/api/generate -H 'Content-Type: application/json' \
      -d '{"protagonist":"Mike","mode":"continue","prev":["Mike is a jazz guitarist."],"next":[],"target":0.9,"surprise":0.3,"max_regen":1}'

## Known limits

- Nothing is saved to disk; reloading the page clears the story and history.
- Inserting a bullet in the middle does not shift the sketch; the sketch stays
  at the same slot positions.
- Generation is sequential (each sentence is context for the next), so a long
  sketch takes about 5 seconds per sentence.
