# Developing Misty

## What was reconstructed

The specification is exclusively `papers/misty/paper/`: system section 4, the Fuji scenario in section 2, Figure 1 and its description, appendix A.3, plus results and limitations. No author implementation, external demo, or workshop grading rubric was used.

The paper describes an example-driven prototyping tool with three interacting affordances:

- **Conceptual blending at multiple granularities (4.2.1):** whole-screen example-to-source connections, or cropping and dragging a region onto a rendered source element. Color, Layout, Content and Customize disambiguate intent. Layout/color retain source content; Content adds contextually appropriate elements. A selected repeated item implies analogous siblings should change too.
- **Node-based infinite canvas (4.2.2):** images and executable source are separate node types; a result is another source node. Both inputs remain available for parallel exploration and lineage comparison. Source-only live code editing is collapsible on the right.
- **Semantic refinement (4.2.3):** generated summaries group code changes by design meaning. Toggles change entire semantic groups; generated controls permit finer changes. The model updates code when semantic decisions are applied.

Figure 1 also shows regeneration and render repair. The study’s event trace explicitly includes global blending, drag-and-drop, semantic diff, regeneration and code editing; all five operation types are implemented. Screenshot and sketch inputs share one pipeline. Adding a new UI element uses Content blending at the dropped location. This is a reconstruction of the paper’s implemented static-screen scope; discussion proposals such as multi-screen interaction blending, animation, component-library mapping and unusual media are not treated as implemented requirements.

## Install and run

Requirements:

- macOS, Linux, or another system with Python **3.9+**; no pip dependencies.
- Node.js **20+** and npm for first-time preview library preparation and Node tests.
- A modern browser with Pointer Events, IndexedDB, ES modules and `structuredClone` (current Safari, Chrome, Edge or Firefox).
- The `codex` executable on PATH and an existing signed-in Codex session for AI actions. The repository bridge handles authentication; do not place account tokens in this app.

From `revibes/misty/app/`:

```sh
npm ci
npm run setup
python3 server.py
```

In another terminal, from the repository root, run the required bridge command:

```sh
python3 llm-bridge/bridge.py codex
```

Open `http://127.0.0.1:5173`. Confirm `/api/health` reports `ok: true` and `bridge.backend: codex`. The UI shows the connection status and underlying model. The launcher (`python3 launch.py`, or `start.command` on macOS) performs these steps and opens a browser. It starts only missing services and terminates only its own children on exit.

The four exact-version npm dependencies are React 18.3.1, React DOM 18.3.1, Babel Standalone 7.28.5 and Tailwind Browser 4.1.17. `setup.mjs` copies their browser bundles into ignored `public/vendor/`. These are local assets: after setup, the editor does not depend on CDNs. npm installation and the Codex model connection need Internet access. There is no frontend build step and no Node server at runtime.

`package-lock.json` is tracked for repeatable installation. Never commit `node_modules`, generated `public/vendor`, `.env`, model credentials or browser workspace data. `.env.example` contains configuration instructions without secrets.

## Configuration

The server loads simple `KEY=value` entries from app-local `.env` without overriding existing environment variables. Restart the server after changes.

- `MISTY_HOST`: defaults to `127.0.0.1` (local only).
- `MISTY_PORT`: defaults to `5173`.
- `MISTY_BRIDGE_URL`: defaults to `http://localhost:8787`.
- `MISTY_TIMEOUT`: Python bridge request timeout, defaults to 310 seconds. Browser requests time out after 330 seconds.

For another bridge port run `python3 llm-bridge/bridge.py codex 8788` from the root and set the corresponding URL. If a bridge reports another backend, stop/reconfigure it before using Misty. Do not alter shared `llm-bridge/` code. The launcher refuses to take over an occupied bridge port. Manual startup is useful for diagnosing authentication and model errors.

The bridge ignores requested model names, temperature, token limits and tool calls. Misty requests JSON output through plain HTTP and uses no tools in model prompts. Its default small Codex model substitutes for GPT-4o. `BRIDGE_MODEL` is a bridge setting rather than an app API key.

## Source layout

- `server.py`: standard-library threaded HTTP server, static files, request limits, model prompts, bridge HTTP client, JSON extraction, semantic group/control normalization and actionable errors.
- `launch.py`, `start.command`: optional launch convenience, dependency preparation and child-process lifecycle.
- `setup.mjs`: copies installed browser dependencies to the local static directory.
- `public/index.html`, `style.css`: application chrome, responsive inspector/library and canvas visual design.
- `public/app.js`: workspace state, DOM reconciliation, gestures, cropping/rasterization, iframe messaging, model operations, semantic controls, dialogs, code editing, undo/redo, file import/export and IndexedDB persistence.
- `public/preview.js`: React/HTML normalization, Babel JSX compilation, sandbox document creation, target serialization and hover highlighting.
- `public/model.js`: pure crop normalization, workspace validation and fit-to-canvas geometry.
- `public/starter.js`: Fuji profile component and clean initial workspace; no generated results are pretended to be model outputs.
- `public/assets/`: original built-in screenshot, sketch, illustrative portrait/landscape and favicon SVGs.
- `tests/`: Python unittest and Node test suites. Their bridge transport is mocked; application calls remain live.

## Data and node lifecycle

The workspace object has `version: 1`, `name`, `nodes`, `edges`, `view: {x,y,zoom}` and `selected`. Example nodes contain `image` (asset path or data URL), `kind`, and normalized `crop: {x,y,w,h}`. Source nodes contain complete code and semantic groups. Result nodes additionally retain `parent`, `reference`, `originalCode`, `fullBlendCode`, `request`, design explanation, differences and the last successfully applied groups.

A successful blend creates a source node at a free position to the right of the input and adds both source-evolution and example-reference edges. Regeneration repeats the saved input request and creates a sibling, rather than overwriting the previous output. A result remains a valid input for later blends. Semantic refinement and code edits update the selected result in place; its pre-blend original remains available to the model. Deleting an input removes its visible edges; a result retains the saved original code. Regeneration needs both original input nodes to still exist.

Canvas pan and zoom are a CSS transform over world coordinates; node dragging adjusts world positions by the inverse zoom. SVG paths record input/result lineage. The crop overlay uses the displayed 320 × 560 image box. `referenceImage()` removes contain-fit letterboxing, maps to original pixels, clamps the region and rasterizes at a maximum 1400-pixel edge into a PNG. Thus only the selected image region is sent for a local blend; globals use the complete image even if a crop is visible. Unsupported/outside-image selections fail before a model call.

The app stores the workspace in IndexedDB `misty-workspaces`, object store `workspaces`, key `current`, after a debounce. Undo/redo keeps up to 25 in-memory snapshots per page session. File exports are ordinary versioned JSON containing embedded user images; import validates node types, identifiers, source size, image schemes, geometry and edges before replacing the workspace. Browser storage is origin-specific: `localhost` and `127.0.0.1`, or different ports, have separate workspaces. Save-to-file is the portable backup.

## Rendering and targeted drops

Application chrome uses small native ES modules and DOM operations. React is used inside source previews. Each preview is a `sandbox="allow-scripts"` iframe without same-origin access. Its document loads React, Babel and Tailwind from local vendor files. A CSP permits local scripts/styles/images and disallows `connect-src` network requests. Preview code is never evaluated in the parent application.

`componentProgram()` accepts an arrow component, a named function, or common default-export component forms. Common import statements are removed because dependencies are provided in scope. Hooks are passed explicitly to the compiled component. The supported code contract is self-contained JavaScript JSX; this is not a full application bundler. HTML previews use an HTML fragment/document with the same Tailwind runtime. TypeScript, arbitrary imported packages, React Native primitives and multi-file applications require adaptation. Inline SVG replaces the paper’s preloaded React icon library.

During a custom region drag the parent captures pointer movement, shows a ghost and locates the iframe under the pointer by its DOM bounds. It converts the pointer position into unscaled iframe coordinates and sends `misty-hit`. The iframe performs `elementFromPoint`, promotes inline glyphs to meaningful containers, outlines the target and returns its HTML, CSS path, label and rectangle. On drop that target is passed into the blending dialog and prompt. Similar repeated elements are explicitly addressed in the prompt.

Every message is validated against the iframe’s `contentWindow`, node identifier and render revision, preventing stale renders or unrelated windows from mutating workspace state. The iframe also enumerates sections/cards/controls to provide a native target selector as a no-drag alternative. Crop coordinate fields provide an alternative to rectangular dragging. Modal dialogs are focus-trapped, labelled, dismissible with Escape and return focus to their launcher.

Code editor updates are debounced by 500 ms; only the changed node’s iframe is rebuilt. Syntax/runtime errors are displayed in the editor and inspector, with manual editing and model-assisted repair available. React hooks and Babel syntax support are covered by tests. Render repair is explicit and does not create a hidden model loop.

## Backend endpoints and prompts

`GET /api/health` forwards bridge health and returns `{app, ok, bridge, url}`. An unavailable bridge returns `ok: false`; the editing workspace remains usable.

`POST /api/blend` accepts:

```json
{
  "code": "() => { return (...) }",
  "image": "data:image/png;base64,...",
  "target": {"html": "<article>...</article>", "selector": "#root ...", "label": "Interests"},
  "crop": {"x": 0.1, "y": 0.5, "w": 0.8, "h": 0.2},
  "aspects": ["Layout"],
  "instruction": "Keep the light theme"
}
```

Omit target/crop for globals. The server combines source code, mode, aspects, target DOM, crop metadata and the actual image in an OpenAI-compatible multimodal request to `/v1/chat/completions` on the Codex bridge. JSON-only output contains `updatedCode`, `designExplanation`, `differences` and `categorizedChanges`. Prompts operationalize appendix A.3’s content-preservation, selected-aspect and repeated-sibling rules, adapted to self-contained browser React and inline SVG. Brief design explanations are requested; private reasoning is not.

Semantic groups contain `id`, `category`, `description`, `changes`, `enabled` and optional `controls`. IDs are normalized independently of model text. Controls support color, range, select and text. The prompt asks for meaningful fine-grained controls; the server bounds ranges and validates supported control types. The exact set is generated from the actual blend. Expanding a widget is local; slider changes do not cause per-pixel API calls. Apply submits current widget values once.

`POST /api/refine` accepts current code, `originalCode`, `fullBlendCode` and all groups including enabled flags/control values. The prompt requests reverting disabled categories while preserving enabled categories. The UI replaces code only after a successful response and restores previous semantic decisions on failure. Checkbox changes are coalesced for 500 ms; widgets apply explicitly. Toggles and Reset all use model calls as in section 4.3.

`POST /api/repair` accepts code and error, asking for a syntax/runtime-only repair. Both refinement and repair require JSON with nonempty `updatedCode`.

The server limits requests to 16 MB and source code to 300 KB, restricts accepted image data MIME types, rejects cross-origin POST origins and returns JSON errors for malformed requests and bridge failures. It does not log request bodies. Model calls run sequentially from the UI; no background generation loops or bulk calls are performed.

## Verification and development workflow

```sh
npm test
node --check public/app.js
node --check public/preview.js
python3 -m py_compile server.py launch.py
```

The automated suites test fenced/invalid model JSON, control normalization, original-code and target preservation in prompt construction, refusal of invalid inputs before transport, crop bounds, workspace round trips and unsafe schemes, fit geometry, JSX compilation of common component forms and malformed JSX errors. No live model calls occur in these tests.

Browser QA should check: fresh workspace rendering; example upload/sketch addition; rectangle crop; region drag onto an actual DOM target; aspect dialog and target-list alternative; a live global and local blend; preservation of originals and branching connections; semantic toggles/widgets; live code editing/errors; source export and workspace save/restore; pan/zoom/fit; undo/redo; missing bridge feedback; and the collapsible inspector on narrow displays. Check desktop and 375-pixel layouts, keyboard focus and reduced motion. For terminal-only launcher verification, use `python3 launch.py --no-browser`. Ordinary static edits need only a page reload; Python changes require a server restart. Do not use a model-call loop as a test runner.

## Substitutions and remaining limits

The paper’s GPT-4o is replaced by the repository’s Codex bridge model. React Flow is replaced by a native pointer/SVG canvas; React Live by local Babel/React sandbox previews; source styling uses Tailwind 4’s browser runtime rather than the paper’s stack. Fine controls use explicit Apply to avoid repeated model calls while dragging. Built-in reference material is newly authored, since the bundled paper only contains the composite interface figure and study charts.

This implements a local prototyping tool, not a production deployment service. Generated UI quality, exact style preservation and semantic independence depend on the model. Large workspaces create many sandboxed React/Babel previews and may use significant browser memory. No custom model training, screenshots of live applications, multi-screen interaction/animation blending, arbitrary package installation or design-system component mapping is provided. These are outside the paper’s implemented static-screen system. Model failure is reported directly; there is no silent canned response fallback.

## Observed live verification

On the workshop machine, the Codex bridge successfully completed a global screenshot blend, semantic color toggle, cropped local layout blend, and fine-grained color refinement. The global toggle retained the new layout while reverting the dark theme. The local drop identified an interest card and changed the repeated interest rows. A widget request changed the row background, but the model did not consistently preserve foreground contrast or honor every numeric detail. That experimental result was undone. Aspect constraints were strengthened in the prompt; model output remains inspectable/editable rather than assumed pixel-perfect. Browser QA also verified source import/rendering, visible JSX syntax errors, undo, sketch addition, and workspace download/import.
