# Misty revibe: developer notes

## Stack

- Vite 8 + React 19 + TypeScript
- `@xyflow/react` (React Flow 12): the node-based infinite canvas
- `react-live`: renders the generated React + Tailwind component inside each Code Render node
- `@tailwindcss/browser`: Tailwind v4 compiled in the browser, so generated classes work without a build step (also styles the app shell)
- `lucide-react`: the icon set generated code may use (every icon is in the render scope)
- `@uiw/react-codemirror`: the code editor drawer

Install with `npm install`, run with `npm run dev` (port 5180), type-check and build with `npm run build`.

## Layout

    src/App.tsx               canvas state, all blending operations, dialogs, toasts
    src/context.tsx           actions nodes call (blend, toggle, regenerate, fix, edit...)
    src/components/ExampleNode.tsx   example image node: region selection, drag source, connection handle
    src/components/SourceNode.tsx    Code Render node: live preview, drop target + highlight, Applied Changes toggles
    src/components/BlendDialog.tsx   "Pick Blending Option" (Color / Layout / Content / Customize)
    src/components/CodeEditor.tsx    right-side live code editor
    src/components/Toolbar.tsx, Guide.tsx
    src/prompts.ts            the paper's Appendix A.3 prompts (global and drag-and-drop) + our toggle / fix prompts
    src/llm.ts                bridge client, fixture keys, cached replay, recording
    src/repair.ts             regex repair of model code, tolerant JSON parsing
    src/samples.ts            Fuji profile and parks UIs, sample examples
    src/fixtures/*.json       recorded responses for the cached golden path
    public/examples/          sample example images, rendered from examples-src/*.html by scripts/render-examples.sh; public/stock/ stock photos
    vite.config.ts            /llm proxy to the bridge, /__fixtures recorder endpoint

## How a blend works

1. The user connects an example to a source (global) or drops a selection on a rendered element (localized). For drops, the element under the cursor is found with `elementFromPoint`, highlighted during hover, and its outer HTML and text are captured.
2. `App.blend` builds the prompt from `prompts.ts`, converts the example (and the selected region) to data URLs, and calls `callLlm` with `response_format: json_object`.
3. The reply is parsed leniently (`parseJsonLoose`), the code is repaired (`repairCode`: strips imports/exports/fences, `class` to `className`, closes void tags, wraps bare JSX), and a new Code Render node is created with `code`, `baseCode` (output with all categories on), `originalCode` (the parent's code) and `changes` (categories, each enabled).
4. Toggling a category sends original code, base code and the on/off list to the model, which returns updated code. Reset All restores `baseCode` without a call.

## LLM bridge

The browser calls `/llm/...`, which Vite proxies to the bridge (`BRIDGE_URL`, default `http://localhost:8787`). To use another port:

    python3 ../../../llm-bridge/bridge.py claude 8788      # from the repo root: python3 llm-bridge/bridge.py claude 8788
    BRIDGE_URL=http://localhost:8788 npm run dev

The bridge ignores the model name, temperature and token limits. Images go as OpenAI `image_url` data URLs.

## Cached mode and fixtures

Every request gets a key from its semantic parameters (operation, example id, hash of the source code, sorted aspects, hash of the drop target's text, toggle states). In Live mode with **record fixtures** on, the response is POSTed to `/__fixtures` and written to `src/fixtures/<key>.json`. Cached mode looks for an exact key, then the best-scoring fixture of the same operation and example (marked "approximate" in a toast), and otherwise reports that no cached response exists.

To re-record the golden path: delete `src/fixtures/*.json`, open `http://localhost:5180/?mode=live&record=1`, perform the five Guide steps in order, then restart the dev server so the new fixtures are bundled.

## Known limitations

- Tailwind in the browser compiles classes on the fly; very unusual classes in generated code may be ignored.
- The hover highlight climbs out of inline elements (spans, headings, images, svg) to a block, so very small targets cannot be chosen.
- The code editor edits `code` only; Reset All returns to the model's output, discarding manual edits.
