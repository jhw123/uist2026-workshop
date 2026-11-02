# Misty (revibed)

A rebuild of **Misty: UI Prototyping Through Interactive Conceptual Blending**
(Lu et al., CHI 2025), made from the paper alone. You blend example images
(screenshots or hand-drawn sketches) into work-in-progress React + Tailwind UI
code on an infinite canvas, then refine the result with a semantic diff and a
live code editor.

## Launch

You need Node.js 18+ and Python 3, plus Claude Code signed in (for the model).

Terminal 1, from the **repository root**, start the LLM bridge:

    python3 llm-bridge/bridge.py claude

Terminal 2, start the app:

    cd revibes/misty/medium/app
    npm install        # first time only
    npm run dev

Open http://localhost:5174 (Vite prints another port if 5174 is taken).
The badge at the top right shows whether the bridge is reachable.

**No API key is needed.** The paper used OpenAI GPT-4o. This build sends every
model call through the workshop's LLM bridge, which answers with Claude Code's
small model (Haiku). Each blend takes about 1 to 2 minutes and uses the
group's Claude plan. If the bridge runs on another port, start the app with
`VITE_BRIDGE_URL=http://localhost:8788 npm run dev`.

## Use

The canvas starts with a source UI (the "Find parks" list from Figure 1), a
reference example (a store page) and a hand-drawn sketch.

**Nodes**
- *Example nodes* (blue) show example images. Add more with **Add example**:
  upload a screenshot or sketch, pick a sample, paste an image (Cmd/Ctrl+V), or
  drop an image file on the canvas.
- *Source nodes* (purple, "Code Render") render React + Tailwind code in a
  phone-sized frame. Add more with **Add source UI** (park list, Fuji's
  profile, book list, blank, or paste your own code written as
  `() => { return (...) }`).
- Pan by dragging the background, zoom with the scroll wheel or the controls,
  move nodes by their title, delete a selected node with the Delete key.

**Global blending (node connection).** Drag from the round handle on the right
of an example node to the handle on the left of a source node. Misty creates a
new source node with the source's content in the example's visual style and
layout.

**Localized blending (drag and drop).**
1. On an example node, draw a box around a section, then press **Done**
   (**Undo** clears the selection).
2. Drag the dashed section onto a source node. The element under the cursor is
   highlighted with a pulsing outline.
3. Drop it. In **Pick Blending Option**, pick one or more of **Color**,
   **Layout**, **Content** (add the selected UI elements) and **Customize**
   (type your own aspect), then **Next**.

**Each blend makes a new node**, linked to its parent and example, so you can
compare alternatives side by side and trace how a design evolved.

**Applied Changes (semantic diff).** Blend results show their changes grouped
by meaning (for example *Color: changed light to dark theme*).
- Toggle a category **On/Off**: Misty asks the model to update the code with
  only the categories you kept. (All on restores the blend, all off restores
  the parent, both without a model call.)
- Click a category's text to expand its class-level changes: untick single
  changes, or edit a change's new value and press **Apply edits**.
- **Reset All** restores the blend as generated. The chevron collapses the panel.
- "How the model read the reference" shows its design explanation.

**Other controls on a source node**
- **Show Code** opens the live code editor on the right; edits re-render the
  node as you type. **Copy** copies the code for your own project.
- **Fix Render** asks the model to repair the code (the render error is sent
  if there is one). Malformed code is also repaired automatically with
  regular-expression rules.
- **Regenerate** (blend results) runs the same blend again.
- **Duplicate** copies the UI into a new source node.

The canvas is saved in the browser and restored on reload. **Clear** starts over.

## Known limits

- Blends are slow (1 to 2 minutes each) and the small model sometimes ignores
  instructions; Regenerate, the semantic diff and the code editor are the ways
  out, as in the paper.
- Toggling semantic diff entries replaces manual code edits on that node.
- Generated UIs may only use the icons and stock images listed in the prompt.
  Stock photos are drawn landscape illustrations, not photographs.
