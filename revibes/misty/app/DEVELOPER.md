# Misty: developer guide

## Requirements

- Node 20 or newer, with npm
- Python 3, for the LLM bridge
- A signed-in Claude Code CLI recent enough to support `--tools` (2.0.28 is too old, 2.1.309 works)

## Install and run

```bash
python3 llm-bridge/bridge.py claude
```

```bash
cd revibes/misty/app && npm install && npm run dev
```

The app runs on http://localhost:5173 and the bridge on http://localhost:8787. Check the bridge at
http://localhost:8787/health. To use another bridge port, set it when starting the app:

```bash
cd revibes/misty/app && VITE_BRIDGE_URL=http://localhost:8788 npm run dev
```

To try a larger model if blends are too weak (record this as a substitution):

```bash
BRIDGE_MODEL=sonnet python3 llm-bridge/bridge.py claude
```

There is no `.env` file and no API key. Do not change `llm-bridge/`; other groups share it.

## Stack

| Library | Role |
|---|---|
| React 18, Vite | App and dev server |
| `@xyflow/react` (React Flow) | Infinite canvas, nodes, edges |
| `react-live` | Renders and edits source node code in the browser |
| `@tailwindcss/browser` | Compiles Tailwind at runtime, since generated classes are unknown at build time |
| `lucide-react` | Icons for generated UIs and the interface |

## Layout

```
src/
  App.jsx                  Canvas state and every operation: blend, toggle, regenerate, fix, drag
  context.js               Gives nodes access to those operations
  styles.css               Misty's own look, matched to Figure 1 (tokens on :root, classes prefixed m-)
  components/
    ExampleNode.jsx        Example image, crop selection, connection handle
    SourceNode.jsx         Code Render panel and its tools
    CodeRender.jsx         react-live preview; marks the drop surface with data-misty-preview
    AppliedChanges.jsx     Semantic diff: toggles, Reset All, class-level edits
    BlendDialog.jsx        Pick Blending Option
    CodeDock.jsx           Docked live code editor
    DemoTour.jsx           Guided Demo: picker, spotlight, step card
  lib/
    tours.js               Guided Demo content: steps, what each spotlights, when each is done
    dom.js                 Finds the block a drop lands on
    prompts.js             Appendix A.3 prompts, plus our toggle and Fix Render prompts
    llm.js                 Bridge calls, JSON parsing, category normalising
    repair.js              Regular-expression repair of generated code (Section 4.3)
    icons.js               Icon list named in the prompts; builds the render scope
    image.js               PNG normalising and cropping
    samples.js             Starter source UIs and the sample example list
public/
  stock/                   Generated placeholder photos, from scripts/make_stock.py
  examples/                Sample examples as SVG
```

## How a blend runs

1. **Global:** `onConnectEnd` in `App.jsx` calls `globalBlend`. Dropping the connection anywhere on a
   source node counts, not only on its handle.
2. **Localized:** `ExampleNode` stores the selection as fractions of the image, so it does not depend
   on canvas zoom, and crops it to PNG. `startCropDrag` tracks the pointer. `pickTarget` climbs from
   the hovered element to the nearest block at least half the screen wide and 36px tall. On drop, that
   element's `outerHTML` (first 4000 characters) becomes `${targetCodeDropped}` in the prompt.
3. `startBlend` creates a child source node showing the parent's code, adds a solid edge from the
   parent and a dashed edge from the example, then calls `requestBlend`.
4. `requestBlend` sends the prompt and image, passes `updatedCode` through `repairCode`, and stores
   the code with `categorizedChanges`. A category such as `"Color: Changed..."` is split into the
   uppercase label and description in the panel.

## Semantic diff behaviour

`toggleCategory` looks up the set of enabled categories in `toggleCache`. All-on (the blend) and
all-off (the parent code) are seeded, and any state already fetched is reused. Other states make one
model call. A toggle changes the node in place rather than creating a new node.

Code edits clear `toggleCache`. `editChange` is a plain string replacement of the `after` value in the
code, with no model call.

## Changing the code that gets rendered

`repairCode` runs on every generated or added source. It forces `/stock/` images, swaps unknown
capitalised JSX tags for `Circle`, and rewrites `h-screen` and `fixed bottom-0`, because the screen
is a 375x720 container rather than the browser window.

The prompts in `prompts.js` keep the paper's wording apart from asking for strict JSON. The paper's
few-shot example labels `bg-black` to `bg-white` as "light to dark"; that error is kept deliberately.

## Guided Demo

`DemoTour` polls the page every 100ms rather than hooking into the app. Each step in `tours.js` has
`targets()`, returning what to spotlight, and optionally `done()`, which advances the step when true.
A step without `done()` waits for Next. Steps don't advance while the pointer is down, or if `done()`
was already true on arrival (after Back). The tour uses the app only through `loadScene`, `fit` and
`fitLatest`, which are built in `App.jsx`. To add a demo, add an entry to `TOURS`.

## Known limitations

- Canvas state lives in memory, so a page reload clears it.
- Drops always target a block-level element, so a single small element can't be targeted exactly.
- Mapping rendered HTML to source relies entirely on the model.
- Toggles rely on the model too, so unrelated parts of the UI can change.
- There are no automated tests.
