# Misty (revibe): developer guide

This guide covers what you need to install, how the code is organised, and how each feature from the paper maps to code.

## Requirements

| What | Why | Check |
|---|---|---|
| Node.js 18+ and npm | Vite dev server, React build | `node -v` |
| Python 3 | the workshop LLM bridge (`llm-bridge/bridge.py`) | `python3 --version` |
| Claude Code, signed in | the bridge sends model calls through `claude -p` | `claude --version` |
| A Chromium-based browser or Firefox | HTML5 drag-and-drop, IndexedDB | |

No API keys or `.env` file are needed. If your npm is configured for a registry you cannot reach (for example a company registry that needs VPN), `app/.npmrc` points this project at the public registry, `https://registry.npmjs.org/`.

## Install and run

    # terminal 1, repository root
    python3 llm-bridge/bridge.py claude          # http://localhost:8787, check /health

    # terminal 2
    cd revibes/misty/app
    npm install
    npm run dev                                   # http://localhost:5180

Environment variables for `npm run dev`:

| Variable | Default | Meaning |
|---|---|---|
| `MISTY_BRIDGE_URL` | `http://localhost:8787` | where the dev server forwards `/llm/*` |
| `MISTY_PORT` | `5180` | dev server port (the next free one is used if taken) |

The bridge answers with Haiku by default. To try a larger model, restart it with `BRIDGE_MODEL=sonnet python3 llm-bridge/bridge.py claude`. Do not edit `llm-bridge/`: it is shared by every group.

`npm run build` produces a static build in `dist/`, but the `/llm` proxy only exists in the dev server. To serve the build, you would need your own proxy to the bridge.

## Architecture

    Browser (React app)
      ├─ React Flow canvas: Reference Example nodes, Code Render nodes, blend edges
      ├─ React Live: renders each node's code inside a 375×720 phone frame
      ├─ Tailwind CSS v3 browser build (public/vendor): generates CSS for classes the model writes
      └─ fetch /llm/v1/chat/completions  ──►  Vite dev server proxy  ──►  LLM bridge :8787  ──►  claude -p (Haiku)

There is no other backend. Model calls use the OpenAI Chat Completions format with an `image_url` data URL for the example image and `response_format: json_object`.

### Files

    index.html                   loads the vendored Tailwind v3 browser build, then src/main.jsx
    vite.config.js               dev server port and the /llm proxy to the bridge
    public/stock/                stock photos the model may use (generated, see scripts/make_stock.py)
    public/examples/             sample example images (SVG drawings, including a sketch)
    public/vendor/               tailwind-play-3.4.17.js (Tailwind CSS v3 browser build, MIT)
    scripts/make_stock.py        regenerates public/stock with Pillow
    src/main.jsx                 React root, React Flow provider, CSS imports
    src/App.jsx                  canvas state, all actions (blend, toggle, fix, regenerate), persistence
    src/context.js               MistyContext, which gives nodes access to the actions
    src/nodes/ExampleNode.jsx    Reference Example: image, region selection (Undo/Done), drag source, connection handle
    src/nodes/SourceNode.jsx     Code Render: Fix Render, Regenerate, preview, Show Code, Applied Changes
    src/components/Preview.jsx   React Live renderer, drop target detection and highlight animation
    src/components/AppliedChanges.jsx  semantic diff panel: categories, toggles, single class changes, Reset All
    src/components/BlendDialog.jsx     "Pick Blending Option": Color, Layout, Content, Customize
    src/components/CodePanel.jsx       collapsible CodeMirror editor on the right
    src/components/TopBar.jsx    add examples/sources, bridge status, help, clear canvas
    src/lib/prompts.js           prompts: global and drag-and-drop (Appendix A.3), toggle, fix
    src/lib/llm.js               bridge client
    src/lib/parse.js             tolerant JSON parsing of model answers; normalises categorizedChanges
    src/lib/repair.js            regular-expression repair of malformed React
    src/lib/classes.js           direct Tailwind class swaps for fine-grained semantic diff edits
    src/lib/icons.js             lucide icon names listed in prompts; all lucide icons in the render scope
    src/lib/images.js            image to PNG data URL, cropping
    src/lib/samples.js           sample source UIs and sample example list

### Data model

Nodes live in React Flow state. Their `data` holds:

- **Reference Example** (`type: "example"`): `imageUrl` (PNG data URL), `name`, `selection` (`{x, y, w, h}` as fractions of the image), `crop` (PNG data URL of the confirmed section).
- **Code Render** (`type: "source"`): `code`, `title`, `subtitle`, and `status` (`idle`, `loading`, `updating`, `ready` or `error`). Blending outputs also have:
  - `origin`: the operation, used by Regenerate. It holds `{type: "global" | "drop", parentId, exampleId, imageUrl, aspects, custom, targetHtml, baseCode}`.
  - `baseCode` (the parent's code before the blend) and `blendedCode` (the output as generated).
  - `categories`: `[{id, category, kind, label, on, open, changes: [{id, type, before, after, current, on}]}]`.
  - `designExplanation`, `differences`, and `edited` (true after manual edits or single class changes).

Edges from a parent to its output carry `data.kind = "blend"` and a label such as "Global blend" or "Layout + Color blend".

The whole canvas (nodes, edges, viewport) is saved to IndexedDB under `misty-canvas-v1`, 600 ms after each change. Render errors are kept outside node data, so they are not saved.

## How the features work

**Global blending through node connection (Section 4.2.1).** `onConnect` in `App.jsx` accepts only example-to-source connections (`isValidConnection`). `startBlend` creates the output node, with a loading state, next to its parent, and `performBlend` sends `globalBlendPrompt(code)` with the full example image.

**Localized blending using drag-and-drop.** Region selection uses pointer events on the example image. *Done* crops the selection with a canvas. Dragging uses HTML5 drag-and-drop, and `beginDrag` stores which example and image are being dragged. In `Preview.jsx`, `dragover` calls `document.elementFromPoint` and walks up to a block-level element (at least about 3.5% of the frame, or a full-width row). It highlights that element with a pulsing overlay and outlines siblings with the same tag and classes, because the prompt asks the model to apply changes to similar elements. On drop, the element's rendered HTML (`targetCodeDropped`, with icons simplified and capped at 5,000 characters) and the cropped image go to `BlendDialog`. *Next* sends `dropBlendPrompt(code, aspects, custom, targetHtml)`.

**Prompts (Appendix A.3).** `prompts.js` keeps the paper's prompts word for word and marks our additions with `[revibe]`:
- `updatedCode` must be a JSON string, because the paper's backtick form is not valid JSON. `parse.js` still accepts backticks and unquoted keys as fallbacks.
- The available stock photo file names are listed.
- For *Content*, a line explains addition mode.
- The lucide icon list is a curated set of 179 names (the paper does not give its list). Every lucide icon is still in scope.

**Semantic diff (Section 4.2.3).** Categories come from the model's `categorizedChanges`, split on the first colon into a kind and a label. When a category is toggled:
- If every category is on (and the code has not been edited), the code becomes `blendedCode` without a model call. If every category is off, it becomes `baseCode`.
- Otherwise `togglePrompt` sends the original, blended and current code with each category's on/off state, and the model returns the updated code. Stale answers are dropped with a per-node sequence number, so the latest toggle state wins.

Single class changes use `swapClasses`, which swaps Tailwind tokens inside `className` strings that contain all of them. When that is impossible (for example, a pure addition with an empty `before`), the toggle prompt is used instead.

**Fix Render and repair (Section 4.3).** `repairCode` runs on every model answer and on Fix Render. It strips fences and imports or exports, turns named components into `() => {}`, turns `class=` into `className=`, replaces image paths outside `/stock/`, and replaces unknown capitalised components with `Circle`. If the rules change nothing, Fix Render sends `fixPrompt(code, renderError)`.

**Rendering.** React Live evaluates the code with React hooks and every lucide icon in scope. The frame has `transform: translateZ(0)`, so `fixed` elements stay in the phone frame. CSS in `index.css` makes `h-screen` and `min-h-screen` mean the frame's height. Generated classes get their CSS from the Tailwind v3 browser build, which watches the DOM. We used v3 because model output often uses v3 class names that v4 removed (`bg-opacity-*`, `flex-shrink-0`).

## Testing

There is no automated test suite. We checked the build by driving headless Chrome through the DevTools protocol:
- Global blending with the store example, the dark list and the sketch.
- Drag-and-drop with the highlight, the dialog, Layout, and Color + Layout + Content + Customize (adding an "Edit" button).
- Turning a category off and back on, and Reset All.
- The code editor, and Fix Render with both the rules and the model.
- Regenerate, file upload and reload persistence.

With Haiku, each blending call took 12 to 36 seconds in our tests.

## Known limitations

- Output quality depends on the bridge's model. Haiku is weaker than GPT-4o at reproducing a screenshot's look, and sometimes adds content.
- The bridge runs at most four calls at once, and each call starts `claude -p`.
- Only one level of undo exists per output (Reset All). Every blend creates a new node, so earlier versions stay on the canvas.
- The highlight picks the drop target with a size rule, so very small targets snap to their enclosing section.
