# Misty (revibe)

A rebuild of **Misty** (*Mixing Interfaces by Semantic Transformation*), from
Lu et al., "Misty: UI Prototyping Through Interactive Conceptual Blending".
You blend example UI screenshots or hand-drawn sketches into work-in-progress
React + Tailwind code on an infinite canvas.

Built by Claude Code (Claude Opus 5.5) from the paper alone.

## Launch

You need Node.js 18+ and Python 3, and Claude Code installed and signed in.
Run two terminals.

**Terminal 1: the LLM bridge** (from the repository root):

    python3 llm-bridge/bridge.py claude

**Terminal 2: Misty** (from `revibes/misty/app/`):

    npm install      # first time only
    npm run dev

Open **http://localhost:5180**. The dot at the top left turns green when Misty can
reach the bridge.

No API key is needed. The paper uses OpenAI's GPT-4o; here every model call
goes through the workshop's LLM bridge to Claude Code, which answers with Claude
Haiku. A blend takes about 20 to 60 seconds. If the bridge runs on another port
(e.g. `python3 llm-bridge/bridge.py claude 8788`), start Misty with
`BRIDGE_URL=http://localhost:8788 npm run dev`. To use another port for Misty
itself: `PORT=5190 npm run dev`.

## Use

The canvas starts with a work-in-progress UI (the "Find parks" list from the
paper's Figure 1). Pan by dragging the background, zoom with the wheel or
trackpad, and delete a selected node with Backspace.

**Add inputs**
- **Add example**: upload UI screenshots or photos of hand-drawn sketches. You
  can also paste an image (Cmd/Ctrl+V) or drop image files on the canvas. Each
  becomes a *Reference Example* node.
- **Add source UI**: paste or upload React + Tailwind code
  (`() => { return (...) }`), or pick a sample (Figure 1's park list, or Fuji's
  profile from Section 2). Each becomes a *Code Render* node.

**Global blending.** Drag from the blue ● on the right of an example node to a
Code Render node. Misty blends the example's visual style and layout into
your UI, keeps your content, and puts the result in a new Code Render node.

**Drag-and-drop (localized) blending**
1. On an example node, click **Select region** and drag a rectangle over the
   part you want. **Undo** goes back, **Done** finishes.
2. Drag the selected region (or the whole image, if nothing is selected) onto a
   Code Render node. The part of your UI under the cursor is highlighted.
3. Drop it, then in **Pick Blending Option** choose one or more of **Color**,
   **Layout**, **Content** (add the selected elements) or **Customize** (type
   your own aspect, e.g. "typography"). Click **Next**.

**Refine the result.** Each result node has:
- **Applied Changes** (the semantic diff): the changes grouped by meaning, each
  with an On/Off toggle. Turning one off asks the model to revert just that
  group. **Reset All** returns to the full blend. Click a group to expand its
  individual Tailwind class changes: untick one to undo it, or edit its value
  and press Enter. These small edits apply right away, without a model call.
  The `›` button collapses the panel.
- **Regenerate**: run the same blend again.
- **Fix Render**: repair code that does not render (regex rules first, then the
  model if needed).
- **Show Code**: open the live code editor on the right. Edits render as you
  type. Copy the code or download it as `Screen.jsx`.

The canvas is saved in your browser and comes back after a reload (very large
images may not fit). The trash icon clears it.

## Differences from the paper

- The model is Claude Haiku through the LLM bridge, not GPT-4o.
- The paper's stock photos are not available; `/stock/` holds generated
  landscape illustrations with the same file names (`landscape0.jpg`,
  `portrait0.jpg`, `square0.jpg` …).
- Tailwind is loaded from its CDN browser build, so the computer needs an
  internet connection.

See `DEVELOPER.md` for how the code is organised.
