# Misty (revibe)

A rebuild of **Misty** (Lu et al., "Misty: UI Prototyping Through Interactive
Conceptual Blending"), made by Claude Code (Claude Opus 5.5) from the paper alone
for the Revibing HCI workshop, UIST 2026.

Misty lets you blend example UIs (screenshots or hand-drawn sketches) into your
own work-in-progress React + Tailwind UI on an infinite canvas. Every blend makes a
new version of your UI next to the old one. Each version lists its **semantic
diff**, the changes grouped by meaning, and you can switch each group on or off.

## Launch

You need Node.js 18 or later, Python 3, and Claude Code signed in. Run two
terminals.

**1. The LLM bridge**, from the repository root (`uist2026-workshop/`):

    python3 llm-bridge/bridge.py claude

Misty's model calls go through this bridge to Claude Code, so no API key is
needed. Leave it running. Check it at http://localhost:8787/health.

> If the terminal says `claude` is not found (for example when Claude Code is
> only installed as the VS Code extension), start the bridge with the extension's
> bundled `claude` on the PATH:
>
>     PATH="$(ls -d ~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary | tail -1):$PATH" python3 llm-bridge/bridge.py claude

**2. Misty**:

    cd revibes/misty/app
    npm install        # first time only
    npm run dev

Open **http://localhost:5317**. The green chip at the top right means the bridge
is reachable. A red chip shows the command to start it.

If port 5317 is taken, run `MISTY_PORT=5320 npm run dev`. If the bridge runs on
another port, run `MISTY_BRIDGE_URL=http://localhost:8788 npm run dev`.

## Use

The canvas opens with four **Reference Example** nodes (a store page with
featured cards, a music profile, a dark category list, a hand-drawn sketch) and two
**Code Render** (source) nodes: the park finder from the paper's Figure 1 and
Fuji's profile from the paper's usage scenario. Pan by dragging the background
and zoom with the scroll wheel or the controls at the bottom right. Move a node by
dragging its header.

**Global blending (connect nodes).** Drag from the purple bar on the right edge of
an example onto a Code Render node (its left bar, or anywhere on it). Misty creates
a new Code Render node to the right. It keeps your UI's content and adopts the
example's layout and visual style. A blend takes about 15 to 40 seconds.

**Targeted blending (drag and drop).**
1. On an example, draw a box around the section you want (for example a card, a
   header or a button), then press **Done**. **Undo** clears the box.
2. Drag the box onto part of a source UI. While you hover, the element that will
   receive the blend is highlighted and named at the top of the screen. Hold
   Shift to target the enclosing (larger) element.
3. In **Pick Blending Option**, choose one or more aspects: **Color**,
   **Layout**, **Content** (adds the selected elements to your UI), or
   **Customize** (type your own aspect, such as "typography"). Press **Next**.

**Refining with the semantic diff.** Each blended node shows **Applied Changes**:
categories such as LAYOUT, COLOR, FONT, each with an On/Off switch.
- Switching a category off asks the model to revert just that change, and
  switching it on reapplies it. A combination you have seen before comes back
  instantly.
- Open "N class changes" under a category to see the Tailwind classes it changed.
  Click a color swatch to pick another color, or "edit" to type other classes.
  These edits are applied to the code directly, with no model call.
- **Reset All** restores the blend exactly as it was generated.
- The arrow next to "Applied Changes" hides or shows the panel.

**Code.** **Show Code** (or **Code editor** in the toolbar) opens a live editor on
the right for the selected source node. Edits render as you type. Copy the code or
download it as a `.jsx` file. Example nodes have no code.

**Fix Render** repairs a node. If the code fails to render, Misty applies its
repair rules first, and asks the model to fix the error if that is not enough.
If the code renders, it asks the model to fix display problems such as overflow
or overlap. **Regenerate** reruns the blend that made the node.

**Your own material.**
- **Add example image** uploads screenshots or photos of sketches. You can also
  drop image files on the canvas, or paste an image with Cmd/Ctrl+V.
- **Add source code** takes a React component styled with Tailwind, pasted or
  uploaded as a file. Write it as `() => { return (...) }`. Imports and
  `export default` are removed automatically. Icons come from lucide-react, and
  images must come from `/stock/`.
- **Samples** adds the sample examples and source UIs again, including a reading
  list.

The canvas is saved in your browser and survives a reload. **New canvas** starts
over with the demo canvas. Select a node and press Backspace, or use its trash
icon, to delete it.

## What differs from the paper (substitutions)

- **Model.** The paper used GPT-4o. Here the workshop's LLM bridge answers with
  Claude Code's fast model (Haiku by default; the toolbar chip shows which). For
  stronger but slower blends, restart the bridge with
  `BRIDGE_MODEL=sonnet python3 llm-bridge/bridge.py claude`.
- **Stock photos.** The paper's prompts point the model at a `/stock/` folder of
  photos. Here those are procedurally drawn landscapes (`public/stock/`).
- **Example images.** The sample examples are mock screens and a sketch drawn for
  this revibe (`public/samples/`), not the paper's examples.
- **Rendering.** The paper used React Live. This rebuild uses Sucrase, the
  compiler React Live itself uses, plus React Live's code editor. Tailwind's
  runtime compiler (v3) is bundled locally, so it works offline.

## Known limitations

- Output quality depends on the model. With Haiku, blends sometimes misread the
  intent. For example, a Content blend dropped on one list row may add the element
  to every row, because the paper's prompt asks to apply changes to all similar
  list elements. Use Regenerate, the semantic diff, or the code editor to adjust.
- One mobile screen per source node (375 × 720), static UI only, as in the paper.
