# Misty (revibe): developer guide

This guide covers what you need to install, run, and change the rebuild. The
README covers how to use it.

## Requirements

| What | Version | Why |
|---|---|---|
| Node.js + npm | 18 or later (built with Node 24, npm 11) | Vite dev server, dependencies |
| Python 3 | 3.7 or later | the workshop's LLM bridge (`llm-bridge/bridge.py`, standard library only) |
| Claude Code (`claude` CLI), signed in | any current version | the bridge sends each model call through it |
| A Chromium-based browser or Firefox | current | the app |
| *(optional)* Google Chrome + macOS `sips` | | only to regenerate the bundled images (`scripts/make-assets.mjs`) |

No API keys and no `.env` file are needed: all model calls go through the bridge.

## Install and run

    # terminal 1, from the repository root
    python3 llm-bridge/bridge.py claude

    # terminal 2
    cd revibes/misty/app
    npm install
    npm run dev                # http://localhost:5317

`npm run build` writes a static build to `dist/`. The build still needs the
`/llm` proxy to reach the bridge, so use `npm run dev` (or `npm run preview`,
which keeps the same proxy) at the workshop.

Environment variables for `npm run dev`:

| Variable | Default | Meaning |
|---|---|---|
| `MISTY_PORT` | `5317` | port of the app |
| `MISTY_BRIDGE_URL` | `http://localhost:8787` | where the `/llm` proxy sends model calls |

Bridge settings, such as `BRIDGE_MODEL=sonnet`, are described in
`llm-bridge/README.md`. Do not edit `llm-bridge/`: every group shares it.

If `claude` is not on the PATH (only the VS Code extension is installed), put the
extension's bundled binary first:
`PATH="$(ls -d ~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary | tail -1):$PATH" python3 llm-bridge/bridge.py claude`.

## Stack

| Paper (§4.3) | This rebuild |
|---|---|
| React | React 18 |
| React Flow | `@xyflow/react` 12 (React Flow's current package) |
| Tailwind CSS | Tailwind v3 Play CDN runtime, vendored at `public/vendor/tailwind-play-3.4.17.js`. It styles the app and compiles whatever classes generated code uses, at runtime. |
| React Live | `sucrase` (React Live's compiler) for rendering, React Live's `Editor` for the code panel |
| GPT-4o | the workshop LLM bridge (OpenAI Chat Completions format); Haiku by default |
| "react icons" / lucide | `lucide-react` |
| regex repair heuristics | `src/lib/repair.js` |

The only build tool is Vite (`vite.config.js`), which also proxies `/llm/*` to
the bridge so the browser never deals with CORS or ports.

## Files

    index.html                 loads the Tailwind runtime, then src/main.jsx
    vite.config.js             dev server port and the /llm proxy to the bridge
    public/stock/              landscape0-5.jpg, portrait0-5.jpg: the only images generated UIs may use
    public/samples/            sample example images (store, music profile, dark list, sketch)
    public/vendor/             vendored Tailwind v3 runtime
    scripts/make-assets.mjs    regenerates public/stock and public/samples (headless Chrome)
    src/
      main.jsx                 entry; imports React Flow's CSS and index.css
      index.css                drop-target highlight animation, handle styles
      App.jsx                  the canvas: state, all operations (blend, toggle, fix, ...), persistence
      nodes/
        ExampleNode.jsx        "Reference Example": image, box selection, Undo/Done, draggable crop, output handle
        SourceNode.jsx         "Code Render": live preview (phone screen), drop target, Fix Render/Regenerate,
                               loading/error overlays, Show Code, semantic diff panel
      components/
        BlendDialog.jsx        "Pick Blending Option" (Color / Layout / Content / Customize)
        SemanticDiffPanel.jsx  "Applied Changes": category toggles, class changes, color grid, Reset All
        CodePanel.jsx          right-side live code editor (copy, download)
        Toolbar.jsx            add example/source, samples, new canvas, help, bridge status, code editor toggle
        AddSourceDialog.jsx    paste/upload source code
        HelpCard.jsx, ui.jsx   help card; Toggle, Spinner, Elapsed, Modal, Toasts
      lib/
        prompts.js             all prompts (global and drag-and-drop from Appendix A.3; toggle, class edit, fix)
        llm.js                 bridge client (chat, health) and a tolerant JSON parser
        repair.js              regex repairs of generated code; Tailwind class swapping for fine-grained edits
        compile.js             code string -> React component (Sucrase + scope), cached
        scope.js               what generated code can reference (React, hooks, lucide icons); icon list for prompts
        image.js               downscale uploads to data URLs, crop selections
        persist.js             save/load the canvas in IndexedDB
        samples.js             starter source code and sample example list
        dragState.js           the crop being dragged (HTML5 drag data is unreadable during dragover)
        context.js             React context carrying the operations to nodes

## How it works

### Nodes and data

React Flow holds two node types. Their `data` is the whole state, saved in
IndexedDB (`misty-revibe` / `canvas`) 0.8 s after any change.

    example: { title, src }                      src = downscaled data URL (max 1400 px)
    source:  { title, code, status, error, startedAt, busy, busySince,
               origin?, blend? }
      status  "ready" | "loading" | "error"
      origin  how a blended node was made (enough to regenerate it):
              { kind: "global" | "local", sourceId, exampleId, exampleTitle, parentTitle,
                parentCode,                 // the parent's code at blend time
                aspects, custom,            // local: dialog choices
                targetHTML, targetLabel,    // local: rendered HTML of the drop target
                crop, thumb }               // local: cropped section (data URLs)
      blend   { designExplanation, differences,
                categories: [{ category, enabled, changes: [{ type, before, after, origAfter? }] }],
                blendedCode,                // the code exactly as generated (Reset All)
                variants: { "1101": code } } // code per on/off combination already seen

Edges record lineage: parent source → blended node (solid, labelled with the
blend type) and example → blended node (dashed, animated while generating).

### Global blend

`onConnect` (and `onConnectEnd` when the connection is dropped anywhere on a
source node) calls `globalBlend(exampleId, sourceId)` in `App.jsx`. It creates a
loading node to the right of the parent and calls `runBlend`, which sends
`globalBlendPrompt(parentCode)` with the example image to the bridge. It then
parses the JSON and runs `repairCode` on `updatedCode`. The node keeps
`categorizedChanges` as its semantic diff.

### Targeted (drag-and-drop) blend

1. `ExampleNode` records a box in image fractions. **Done** crops it on a canvas:
   a ≤1024 px JPEG for the model and a 150 px PNG used as the drag image.
2. Dragging uses HTML5 drag-and-drop with the type
   `application/x-misty-crop`. The crop itself sits in `dragState.js`.
3. In `SourceNode`'s screen, `dragover` picks the target with `pickTarget`. It
   walks up from the hovered element past text-like and tiny elements, and goes
   one level further with Shift or Alt. The target gets a `data-misty-hover`
   attribute, animated in `index.css`, and a label.
4. On drop, `BlendDialog` opens. **Next** calls `localBlend`, which sends
   `localBlendPrompt(parentCode, aspects, custom, targetHTML)` with the cropped
   image. `targetHTML` is the rendered `outerHTML` of the drop target, as in the
   paper's `${targetCodeDropped}`.

### Semantic diff

- **Toggle a category** (`toggleCategory`): if this on/off combination is in
  `blend.variants`, it is restored instantly. Otherwise `togglePrompt` sends the
  current code, the parent's code, and all categories marked ON or OFF, and names
  the one to revert or reapply. The result is cached in `variants`. This follows
  §4.3, where toggling triggers another model call.
- **Fine-grained edit** (`editChange`): editing a change's `after` classes, for
  example from the color grid, swaps them in every matching `className` with
  `swapChangeClasses`. It tries the whole class list first, then only the changed
  tokens. Cached variants get the same swap. If nothing matches, `editClassPrompt`
  asks the model instead.
- **Reset All** restores `blendedCode` and every original `after`.
- **Manual code edits** replace the cache with the edited code for the current
  combination.

### Rendering generated code

`repairCode` (`src/lib/repair.js`) runs on every model answer and on Fix Render.
It:
- strips code fences, `import`/`export` lines, and `render(...)` calls
- turns named components into one expression, `(() => { ...; return Main; })()`
- fixes `class=`/`for=` and string `style`, and converts HTML comments
- maps `fixed`/`h-screen`/`min-h-screen` to `absolute`/`h-full`/`min-h-full`,
  because the phone screen is a box, not the window
- points any image that is not under `/stock/` at a stock photo
- replaces unknown components (`FaHeart`, `HeartIcon`, ...) with a lucide icon

`compile` (`src/lib/compile.js`) then wraps the code as `return (<code>)`,
compiles the JSX with Sucrase, and evaluates it with `scope.js` as arguments.
Compile errors show in place; runtime errors are caught by an error boundary
keyed by the code. The screen has `transform: translateZ(0)`, so `fixed` and
`absolute` children stay inside it.

### Prompts

All prompt text is in `src/lib/prompts.js`:
- `globalBlendPrompt` and `localBlendPrompt` follow Appendix A.3 word for word.
  The paper's placeholders are filled in (lucide icon list, available stock
  files), and one line asks for strictly valid JSON.
- `localBlendPrompt` also adds a sentence saying what "content" (the addition
  mode) means. With Haiku, Content blends only restyled existing elements without
  it.
- `togglePrompt`, `editClassPrompt` and `fixPrompt` are not in the paper and are
  written in the same style.

Each call is one request: `system` plus `user`, with the image as a data URL and
`response_format: json_object`. `parseJsonLoose` also accepts the paper's
pseudo-JSON (unquoted keys, a template literal for `updatedCode`) if the model
copies it.

## Regenerating assets

    node scripts/make-assets.mjs

This renders SVG landscapes and HTML mock screens with headless Chrome. It writes
`public/stock/*.jpg` (JPEG via `sips`) and `public/samples/*.png`. It is macOS
oriented; set `CHROME=/path/to/chrome` if Chrome lives elsewhere. The outputs are
committed, so you only need it to change them.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Red "LLM bridge offline" chip | start the bridge; check http://localhost:8787/health; if it runs on another port, set `MISTY_BRIDGE_URL` |
| Bridge reports `codex` backend | stop it and start it with `claude` as the argument |
| Blend fails with "not valid JSON" | press Try again / Regenerate; the model occasionally breaks the format |
| A node shows "This code does not render" | Fix Render, or edit in the code panel (the error is shown at its bottom) |
| Blends look poor | restart the bridge with `BRIDGE_MODEL=sonnet` (slower, uses more of the plan) |
| Canvas in a bad state | New canvas (toolbar), or clear the site's data in the browser |
