# Misty: developer guide

## Requirements

| Tool | Version | Used for |
|---|---|---|
| Node.js | 18 or later (tested on 20.19) | Vite dev server, React app |
| npm | 9 or later | dependencies |
| Python 3 | 3.8 or later | the shared LLM bridge (`llm-bridge/bridge.py`) |
| Claude Code (`claude`) | signed in | answers the bridge's model calls |
| Internet | | Tailwind CSS is loaded from `cdn.tailwindcss.com` |

## Install and run

    # repository root, terminal 1
    python3 llm-bridge/bridge.py claude          # http://localhost:8787

    # revibes/misty/app, terminal 2
    npm install
    npm run dev                                  # http://localhost:5180

Environment variables for `npm run dev`:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `5180` | port for Misty |
| `BRIDGE_URL` | `http://localhost:8787` | where the LLM bridge listens |

`npm run build` makes a static build in `dist/`, but model calls go through the
dev server's `/llm` proxy, so use `npm run dev` (or serve `dist/` behind a proxy
that forwards `/llm/*` to the bridge).

`scripts/make_stock.py` regenerates the placeholder photos in `public/stock/`
(pure Python; it converts PNG to JPG with macOS `sips`).

## Stack

| Paper | Here |
|---|---|
| React | React 18 |
| React Flow | `@xyflow/react` 12 (React Flow's current package) |
| React Live | `react-live` 5 (`generateElement` to render, `Editor` for the code panel) |
| Tailwind CSS | Tailwind 3 browser build from the CDN, so classes the model writes at runtime get styles |
| lucide icons | `lucide-react` |
| GPT-4o | Claude Haiku through `llm-bridge` (OpenAI Chat Completions format, JSON output) |

## Layout of the code

    index.html                 loads Tailwind (CDN) and the highlight animation CSS
    vite.config.js             dev server, port, /llm proxy to the bridge
    public/stock/              stock photos the model may use (/stock/landscape0.jpg, ...)
    scripts/make_stock.py      generates those photos
    src/main.jsx               entry
    src/App.jsx                canvas state, all actions (blend, regenerate, toggle, fix), autosave
    src/nodes/ExampleNode.jsx  Reference Example node: image, region selection (Undo/Done), drag source, ● handle
    src/nodes/SourceNode.jsx   Code Render node: live render, drop target + highlight, Fix Render, Regenerate, Show Code
    src/components/
      AppliedChanges.jsx       semantic diff panel: category toggles, Reset All, per-class changes
      BlendDialog.jsx          "Pick Blending Option" (Color / Layout / Content / Customize)
      CodePanel.jsx            live code editor docked on the right (copy, download)
      Toolbar.jsx              add example / add source / help / clear / bridge status
      AddSourceDialog.jsx      paste or upload code, or pick a sample
    src/lib/
      prompts.js               the paper's prompts (Appendix A.3) + toggle and fix prompts
      llm.js                   calls the bridge, parses JSON, repairs and formats code
      repair.js                regex repair of malformed React; JSON extraction; one-line JSX formatter
      render.jsx               compiles code with react-live; scope = React, hooks, lucide icons
      classes.js               swaps Tailwind class strings in code (fine-grained diff edits)
      image.js                 file reading, downscaling, cropping
      context.js               React context for node actions; the current drag payload
      samples.js               starter source UIs

## How the main flows work

**Nodes.** Two React Flow node types. An *example* node holds a downscaled
image (data URL, max 1400 px) and an optional selection `{rect, url}`, where
`rect` is normalised 0–1 and `url` is the cropped image. A *source* node holds
`code`. A blend result is a source node that also stores `baseCode` (the parent's
code at blend time), `blend` (the request: mode, image, aspects, target HTML),
`result` (the model's JSON), `catOn` (category toggles), `cache` (code for each
toggle combination) and `fine` (per-class edits).

**Global blending.** `onConnect` in `App.jsx` accepts example → source
connections only. It adds a dashed edge, creates a result node to the right of
the source, and calls `globalBlendPrompt(code)` with the full example image.

**Drag-and-drop blending.** The example node starts an HTML5 drag and stores
the payload in `context.js` (dataTransfer cannot be read during `dragover`).
On `dragover`, `SourceNode` walks up from the element under the cursor to a
meaningful container (`pickTarget`) and draws the highlight. On drop it sends
that element's rendered `outerHTML` (up to 4000 characters) to `BlendDialog`;
`Next` calls `dropBlendPrompt(code, aspects, custom, targetHtml)` with the
cropped image. As the paper's prompt says, the model maps the rendered HTML
back to the source code itself.

**Model output.** The model returns `designExplanation`, `differences`,
`updatedCode` and `categorizedChanges` (paper format). `llm.js` extracts the
JSON (tolerating fences and backtick strings), runs `repairCode` (removes
imports/exports/fences, unwraps `const X = () =>`, fixes `class=`, unclosed
`<img>`, HTML comments) and `formatJsx` (adds line breaks when the code comes
back on one line).

**Semantic diff.** Toggling a category calls `semanticDiffPrompt(baseCode,
blendedCode, categories, states)` (paper §4.3: another model call). All on
returns the blended code and all off returns the base code, without a call;
other combinations are cached per node. Expanding a category lists its
`before → after` class changes; those edits use `classes.js` to replace the
class string in the current code directly.

**Rendering.** `render.jsx` compiles code with react-live's `generateElement`
(Sucrase, JSX + TypeScript) inside an error boundary. Compile and runtime
errors are stored on the node (`renderError`) so **Fix Render** can send them
to `fixRenderPrompt` when the regex rules are not enough. Icon names that would
shadow JavaScript globals (`Map`, `Image`, `Set`, …) are left out of the scope.

**Persistence.** The canvas autosaves to `localStorage` (`misty-canvas-v1`);
if the images are too large to save, it skips saving.

## Prompts

`src/lib/prompts.js` keeps the wording of the paper's Appendix A.3 prompts,
with these changes:
- `updatedCode` must be a JSON string (the bridge requests strict JSON), not a
  backtick literal.
- The lucide icon list (the paper leaves it as `${list}`) is ~150 common icon
  names, all checked to exist in `lucide-react`.
- The stock photo list names the files in `public/stock/`.
- The global prompt also carries the "absolute bottom-0" rule from the
  drag-and-drop prompt, since the source renders in a fixed-size phone frame.
- Choosing **Content** adds one sentence telling the model this is the
  addition mode, which the paper's prompt refers to without defining.

## Known limits

- Haiku is weaker than GPT-4o; blends may ignore details or break layout. Run
  the bridge with `BRIDGE_MODEL=sonnet python3 llm-bridge/bridge.py claude`
  for better (slower) results.
- `pickTarget` uses size heuristics; to target a whole card, hover over its
  padding or its text.
- One bridge handles at most 4 calls at a time; more wait in a queue.
