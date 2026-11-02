# Misty (revibed): developer guide

## Requirements

| Need | Why |
|---|---|
| Node.js 18+ and npm | Vite dev server and the React app |
| Python 3 | the workshop LLM bridge (`llm-bridge/bridge.py`), no extra packages |
| Claude Code (`claude`), signed in | the bridge sends model calls through it |

Install and run:

    # repository root
    python3 llm-bridge/bridge.py claude          # http://localhost:8787
    # in another terminal
    cd revibes/misty-xiangyu/app && npm install && npm run dev   # http://localhost:5174

`npm run build` makes a static build in `dist/` (it still needs the bridge
at run time). `VITE_BRIDGE_URL` points the app at a bridge on another port.

There is no backend of our own: the browser calls the bridge directly
(it allows CORS) in the OpenAI Chat Completions format.

## Stack

Same as the paper (section 4.3), apart from the model:

- **React 19** + **Vite**
- **@xyflow/react** (React Flow 12): the node-based infinite canvas
- **react-live**: renders generated code (`LiveProvider`/`LivePreview`) and
  provides the code editor (`Editor`)
- **Tailwind CSS v4, browser build** (`@tailwindcss/browser`): generates CSS
  at run time for whatever classes the model writes. The app's own UI uses
  Tailwind too.
- **lucide-react**: icons, for the app and for generated UIs
- Model: the LLM bridge (Claude Haiku via Claude Code) instead of GPT-4o

## Files

    index.html, vite.config.js      Vite entry; dev port 5174
    public/stock/*.svg              stock "photos" the model may use (drawn scenes)
    public/examples/*.svg           sample example screenshots and a sketch
    src/main.jsx                    loads Tailwind browser, React Flow CSS, styles.css
    src/styles.css                  drop-target highlight animation, spinner, handles
    src/App.jsx                     canvas state and every action (see below)
    src/context.js                  React context passing actions to nodes
    src/nodes/ExampleNode.jsx       example image, crop (draw box, Undo/Done), drag source
    src/nodes/SourceNode.jsx        Code Render: live preview, drop target, Fix Render,
                                    Regenerate, Duplicate, Show Code, diff panel toggle
    src/components/SemanticDiff.jsx Applied Changes panel: category toggles, per-change
                                    checkboxes and editable values, Reset All
    src/components/BlendDialog.jsx  Pick Blending Option (Color, Layout, Content, Customize)
    src/components/CodePanel.jsx    collapsible live code editor on the right
    src/components/Toolbar.jsx      add example / source menus, bridge status, Clear
    src/lib/prompts.js              all prompts (see below)
    src/lib/llm.js                  bridge calls, JSON parsing, change normalisation
    src/lib/repair.js               regex repair of malformed React code
    src/lib/icons.js                the lucide icon list (prompt + render scope)
    src/lib/image.js                image -> PNG data URL, cropping
    src/lib/starters.js             starter source UIs and sample example list

## Data model

React Flow nodes, two types.

- `example`: `data = { name, image (PNG data URL), crop: { rect (fractions), url } }`
- `source`: `data = { label, code }`, and for blend results also
  `parentId, parentCode, exampleId, op, blendedCode, categories,
  designExplanation, differences, status, error, renderError, panelOpen`.
  - `op = { type: "global" | "dnd", image, aspects, customText, targetHtml }`
    is everything needed to run the blend again (Regenerate).
  - `categories = [{ id, category, enabled, changes: [{ id, type, before,
    after, enabled, editedAfter }] }]`, from the model's `categorizedChanges`.
  - `blendedCode` is the code as the blend produced it; `code` is what is
    shown (after toggles, Fix Render or manual edits).

Edges: parent → blend (solid, labelled) and example → blend (dashed).
Nodes and edges are saved to `localStorage` (`misty-canvas-v1`), debounced.

## How the interactions work

**Global blend.** `onConnect` in `App.jsx` accepts only example → source
connections (`isValidConnection`). `createBlendNode` adds a new source node to
the right of the parent (stacked below earlier children) and calls `runOp`,
which sends `globalBlendPrompt(parentCode)` with the full example image.

**Drag-and-drop blend.** The confirmed crop in `ExampleNode` is an HTML5
draggable carrying the example id (`application/x-misty-example`). The
source node's frame handles `dragover`: `document.elementFromPoint` finds the
rendered element under the cursor and gives it the `misty-hover` class (the
highlight animation). On drop, the element's `outerHTML` (cleaned, max 2500
characters) and the example id go to `openBlendDialog`; **Next** calls
`createBlendNode` with `op.type = "dnd"`, the chosen aspects and the cropped
image, and `runOp` sends `dragDropPrompt(...)`.

**Semantic diff.** `applyDiff(nodeId, categories)` stores the toggles; all on
(and no edits) restores `blendedCode`, all off restores `parentCode`;
otherwise, after a 700 ms debounce that batches quick toggles, it sends
`semanticDiffPrompt(parentCode, blendedCode, categories)` and shows the
returned code. A per-node request counter drops stale answers.

**Fix Render** sends `fixRenderPrompt(code, renderError)`. `renderError` comes
from react-live's `LiveContext` via `ErrorReporter` in `SourceNode.jsx`.

**Rendering.** Code is a component expression `() => {...}` evaluated by
react-live with a scope of React hooks and the icons in `icons.js`. The frame
has `transform: translateZ(0)` so `fixed` elements stay inside the phone.

## Prompts

`src/lib/prompts.js`.

- `globalBlendPrompt` and `dragDropPrompt` follow Appendix A.3 nearly word for
  word, including the chain-of-thought fields (`designExplanation`,
  `differences`) before `updatedCode`, and the few-shot `categorizedChanges`
  example. Changes: stock images are `.svg`, and `updatedCode` is requested as
  a JSON string (the paper's format shows it in backticks, which is not JSON).
- The paper does not give the prompt for semantic-diff toggling or Fix Render;
  `semanticDiffPrompt` and `fixRenderPrompt` are ours.
- The image is sent as an OpenAI `image_url` data URL; `response_format:
  json_object` is set.

`llm.js` parses the answer (plain JSON, then the outermost `{...}`, then a
backtick `updatedCode`), and `repair.js` cleans the code: strips fences,
imports/exports and `render(...)`, turns `const X = ...` / `function X()` into
an expression, fixes `class=`/`for=`/string `style=`, replaces unknown
components with `Circle` (self-closing) or `div`, and closes unbalanced
brackets.

## Extending

- More icons: add names to `ICON_NAMES` in `icons.js` (they go into both the
  prompt and the render scope).
- More stock images: add files to `public/stock/` and update `STOCK_RULE` in
  `prompts.js`.
- A larger model: restart the bridge with `BRIDGE_MODEL=sonnet python3
  llm-bridge/bridge.py claude`.
- Testing: there are no automated tests. We checked the flows by driving the
  app with Playwright (global blend, crop + drag-and-drop + dialog, toggles,
  editor, reload).

## Gotchas

- react-live's `Editor` loops if you feed each keystroke back into its `code`
  prop; `CodePanel` seeds it and re-keys it only on outside changes.
- Every Playwright run starts with an empty `localStorage`, so the starter
  canvas reappears.
- The bundle is large (~1.8 MB) because all of lucide is imported for the
  render scope; fine for a local prototype.
