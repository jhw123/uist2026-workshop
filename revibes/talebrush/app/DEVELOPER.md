# TaleBrush revibe: developer guide

## Requirements

- Python 3.8 or later. The server uses only the standard library.
- A modern browser (Chrome, Safari, Firefox). The front end is plain HTML, CSS and JavaScript,
  with no build step and no external libraries.
- The workshop LLM bridge (`llm-bridge/bridge.py`, not part of this app) with a signed-in
  `claude` CLI recent enough to accept `--tools` (2.0.13 is too old; 2.1.x works).

## Running

    python3 llm-bridge/bridge.py claude          # http://localhost:8787
    python3 revibes/talebrush/app/server.py      # http://localhost:8501

Environment variables for `server.py`:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8501` | port of the TaleBrush server (also the first argument) |
| `BRIDGE_URL` | `http://localhost:8787` | where the LLM bridge listens |

## Layout

    app/
      server.py          REST API + static file server (stands in for the paper's Flask back end)
      static/index.html  page structure: editor, history, name box, canvases, tools
      static/style.css   look, modelled on Figures 1, 4 and 5
      static/app.js      all interaction: editor, sketching, generation loop, history

## Back end (`server.py`)

`POST /api/recognize`: `{protagonist, sentences: [str], indices?: [int]}` →
`{fortunes: {"i": 0..1}}`. One LLM call rates all requested sentences. As in the paper
(Section 5.2.1), each sentence is read with the protagonist's name and up to 3 previous
non-empty sentences as context. The prompt uses the paper's definition of fortune.

`POST /api/generate`: `{protagonist, sentences, slot, mode, target, surprise, regenerations,
gap_before, gap_after}` → `{sentence, fortune, attempts: [...]}`.
- `mode`: `continue`, `infill_prev` or `infill_next` (the paper's three generation tasks, Figure 9).
  Previous context is every non-empty sentence before the slot. Next context is every non-empty
  sentence after it. `gap_before` and `gap_after` tell the model how many other blanks are still
  to be filled on each side.
- `target`: fortune 0..1, or `null` for an unconstrained sentence (an erased part of the sketch).
- The regeneration loop follows Section 5.2.2. The candidate is recognized, and if
  `|target - fortune| > 0.2` it is generated again, up to `regenerations` (0–2) more times. Rejected
  candidates are listed in the next prompt so that the model writes something different. The
  candidate with the smallest error is returned.
- `surprise` 0..1 is put into the prompt as words, and also sent as `temperature = 0.5 + surprise`,
  which the bridge ignores.

`GET /api/health` reports whether the bridge answers and which backend and model it uses. The
footer of the interface shows this.

All LLM calls use the OpenAI Chat Completions format with `response_format: json_object`.

## Front end (`static/app.js`)

State (`state`):
- `rows[i]` = `{text, kind: "user"|"generated", fortune, pending}`. Bullet `i` is slot `i` on the x axis.
- `points` = the fortune sketch as `{x, y, w}` in data units. `x` is in slots (slot `i` at `x = i`),
  `y` is fortune, and `w` is the half-width of the envelope in fortune units.
- `sketched[i]` is true once a pen stroke covered slot `i`. If its points are later erased, the slot
  becomes unconstrained (`target = null`).
- `surprisePts`: the surprise sketch. `history`: stored stories (snapshots of the rows, sketches and name).

Key behaviour:
- **Sketch → controls** (`slotControl`). The target is the sketch's y interpolated at the slot's
  centre. The tolerance is the mean envelope half-width of the points inside the slot's unit
  `[i-0.5, i+0.5)`. Below `SLOW_HALF_WIDTH` (0.06) the slot gets 2 regenerations, otherwise 1.
- **Speed → width** (`addStrokePoint`). The pointer speed is smoothed with an exponential moving
  average, and the half-width goes from 7 px (slow) to 41 px (fast). The drawn envelope changes
  width smoothly, but the control is set per sentence unit. The faint vertical lines mark the units.
- **New strokes** replace the sketch over their x range (`mergeStroke`). Lifting the pen generates the
  covered slots. **Eraser** removes points within 16 px and does not start a generation.
- **Generation order** (`generateSlots`). The selected slots are split into contiguous runs, handled
  left to right. A run with story text after it is infilled, alternating `infill_prev` from its
  left end and `infill_next` from its right end. Any other run is continued left to right.
- **Edited generated sentences** become `kind: "user"` (`onRowInput`). Generate Again skips
  non-empty user rows, so the edit survives and is sent as context. Redrawing over the slot still
  replaces it.
- **Recognition after edits**. 900 ms after typing stops, the edited rows and the 3 rows after them
  (whose context changed) are rated again. Changing the protagonist's name re-rates every row.
- **History**. A snapshot is stored after every generation run. While the menu is open, every stored
  arc is drawn at low opacity. Hovering an item previews its text and arc, and clicking it restores
  that snapshot.

## Changing things

- The prompts are `RECOGNIZE_SYSTEM`, `GENERATE_SYSTEM` and `generate_once` in `server.py`.
- Constants: `ERROR_THRESHOLD` and `RECOGNITION_CONTEXT` (server). `DEFAULT_ROWS`, `DEFAULT_SURPRISE`,
  `SLOW_HALF_WIDTH` and `ERASER_RADIUS` (app.js).
- To use a larger model, restart the bridge with `BRIDGE_MODEL=sonnet`.
