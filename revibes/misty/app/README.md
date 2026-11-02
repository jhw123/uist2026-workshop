# Misty

Mixing Interfaces by Semantic Transformation. Plus Y.

A local web reconstruction of **Misty: UI Prototyping Through Interactive Conceptual Blending** (Lu et al., CHI 2025), built from the Markdown paper and supplied figures. Bring a screenshot or a hand-drawn sketch, blend its design into your existing UI code, and refine the result with semantic controls.

## Launch

Prerequisites: **Python 3.9+**, **Node.js 20+ with npm**, and the **Codex CLI installed and signed in**. No API key or Python packages are needed.

On macOS, double-click `start.command` in this folder, or run:

```sh
cd ~/Desktop/uist2026-workshop/revibes/misty/app
python3 launch.py
```

The launcher installs the four JavaScript preview dependencies if missing, starts a Codex bridge if needed, and opens Misty. Keep the terminal open. Ctrl+C stops the app and any bridge started by the launcher. It reuses an existing Codex bridge without stopping it.

For manual startup, use two terminals:

**Terminal 1, from the repository root:**

```sh
cd ~/Desktop/uist2026-workshop
python3 llm-bridge/bridge.py codex
```

**Terminal 2:**

```sh
cd ~/Desktop/uist2026-workshop/revibes/misty/app
npm ci
npm run setup
python3 server.py
```

Open **http://127.0.0.1:5173**. Dependency installation and setup are needed only on the first run or after dependency changes. Use the same browser and URL to return to your saved workspace.

## Use Misty

1. **Start with your UI.** Fuji’s editable profile is provided. Choose **Add source code** to paste a self-contained React/Tailwind component or load a `.jsx`, `.js`, or `.html` file. HTML is also supported. TypeScript and custom package imports need conversion first.
2. **Bring inspiration.** Choose **Add an example**, drop image files onto empty canvas, or use **Try a sketch example**. PNG, JPEG, GIF and WebP are supported, up to 8 MB each. Upload photos of hand-drawn sketches the same way as screenshots.
3. **Explore globally.** Drag an example’s right connection handle onto a source’s left handle or screen. Alternatively choose **Blend** or **Blend with this UI**. Global blending starts with Color and Layout selected. Confirm the aspects and choose **Create blend**.
4. **Blend a region.** Draw a rectangle on an example. Drag its **Drag region** button onto the exact source element; it highlights on hover. The dialog identifies the dropped element. Choose Color, Layout, Content, Customize, or a combination. Content can add elements missing from your original UI. Customize accepts a natural-language direction.
5. **Use the alternative controls.** Select an example from the sidebar, enter crop coordinates in percentages, and choose **Blend selected region**. Select a target section from the dialog’s list. This supports the same localized operation without dragging. A region is measured on the displayed image area; the app removes letterbox space when cropping.
6. **Refine your result.** Each blend creates a **new source node** connected to both inputs. Toggle semantic changes under **Applied changes**. Each toggle uses a new model call. Expand **Adjust details** where generated controls are available; choose **Apply widget values** to apply their values together. **Reset all** disables all groups and asks the model to restore the original. **Regenerate** creates another branch from the same inputs.
7. **Edit and export code.** Choose **Show code** or the inspector’s **Code** tab. Edits render automatically after a short pause. Errors appear in the editor/inspector. Fix them manually or choose **Fix render** for a model repair. Use Copy or Export to take the code to your own project.
8. **Keep your workspace.** Autosave uses this browser’s IndexedDB. **Save workspace** downloads all nodes, images, source code, semantic choices and connections as a `.misty.json` file. The folder icon beside “Your workspace” imports one. Save before importing if you want a separate backup. Undo can reverse the import during the current session.

Drag empty canvas, use the hand tool, or hold Space to pan. Scroll also pans. Ctrl/Cmd + scroll and the + / − buttons zoom. **Fit canvas** shows all variations; clicking a sidebar node centers it. Undo/redo handles canvas and source edits (⌘Z / ⌘⇧Z, or Ctrl on other platforms). Native text undo remains active inside the editor. Close the inspector for more space; reopen it with the sliders button.

## Model connection

All model calls go through your own backend to the repository’s **LLM bridge** and your signed-in **Codex** plan. The model badge shows connection status and the selected bridge model. This replaces the paper’s GPT-4o. There are no canned blends or silent fallback generations.

Only explicit blend, semantic refinement, and repair actions send source code, cropped image data and directions to the model. Ordinary code editing, image selection and saving are local. Calls can take a few seconds or longer; allow the current operation to complete before starting another.

If the badge says disconnected, start the exact bridge command above. If another backend is running, stop it and start the Codex bridge. `http://localhost:8787/health` reports the backend and model. If another revibe owns that port, use:

```sh
# Repository root
python3 llm-bridge/bridge.py codex 8788
```

Copy `.env.example` to `.env` in this app folder and set `MISTY_BRIDGE_URL=http://localhost:8788`, then restart Misty. If 5173 is occupied, set `MISTY_PORT=5174`. No secret needs to be added to `.env`.

## Scope and limits

Like the paper, Misty focuses on **static, single-screen mobile UI**, rendered at 320 × 560 pixels with vertical scrolling. It does not implement cross-screen behavior or animation blending. Model outputs may need manual corrections, and precise preservation of every unrelated style is model dependent. The semantic controls describe actual model output and vary between results.

Source components support React, common React hooks, Tailwind classes, inline styles and SVG. Example inputs require images only. Arbitrary external libraries, React Native primitives, project-wide imports, TypeScript, remote resources and custom design systems are not automatically installed. The source editor’s sandbox prevents previews from accessing the workspace, making network calls or navigating the parent app. Exported code may need integration work in your application.

Generated previews use locally served React 18, Babel and Tailwind 4 in place of the paper’s React Live/Tailwind/React Flow stack. The built-in reference and sketch are original illustrative assets, not screenshots extracted from the paper. See `DEVELOPER.md` for architecture, API details and feature mapping.

## Verify

```sh
npm test
```

This runs the Python model-pipeline tests and Node tests for source parsing, crop bounds, workspace validation and canvas fitting. No model credits are used by this test suite.
