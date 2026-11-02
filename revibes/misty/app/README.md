# Misty (revibe)

A rebuild of **Misty: UI Prototyping Through Interactive Conceptual Blending** (Lu, Leung, Swearngin, Nichols, Barik; CHI 2025), made from the paper alone. Misty lets a developer blend example UI screenshots or sketches into a work-in-progress React + Tailwind UI on a node-based infinite canvas, then refine the result with a *semantic diff* of toggleable change categories and a live code editor.

The demo has two modes, switchable in the toolbar:

- **Golden path (cached)**: replays model responses that were recorded from the live system, so the paper's usage scenario can be walked through without any model calls. Follow the five steps in the Guide panel.
- **Live (LLM bridge)**: every blend is sent to a language model through the workshop's LLM bridge. No API key is needed; calls use the Claude Code plan you are signed in to.

## Run it

Requirements: Node 18+ and Python 3. Two terminals, both from the **repository root**.

1. Start the LLM bridge (only needed for Live mode). The paper used GPT-4o; we run the bridge with Claude Code's Sonnet model, which handles the multimodal code-generation task better than the bridge's default Haiku:

       BRIDGE_MODEL=sonnet python3 llm-bridge/bridge.py claude

   Check `http://localhost:8787/health`. If port 8787 is taken by another revibe, start it on another port and set `BRIDGE_URL` for the app (see DEVELOPER.md).

2. Start the app:

       cd revibes/misty/app
       npm install
       npm run dev

   Open <http://localhost:5180>. The toolbar shows a green dot when the bridge is reachable.

## Use it

The canvas starts with two **Reference Example** nodes (Health Categories and a music profile, both from the paper's figures) and one **Code Render** node (Fuji's profile page from the paper's scenario).

- **Global blending**: drag from the handle on the right of an example to the handle on the left of a Code Render. Misty creates a new Code Render to the right with the example's style blended into your content, plus an **Applied Changes** panel.
- **Localized (drag-and-drop) blending**: on an example, draw a rectangle over the region you want, press **Done**, then drag the dashed selection onto a part of a Code Render. The part under the cursor is highlighted. On drop, pick **Color**, **Layout**, **Content** and/or **Customize** (type your own aspect), then **Next**.
- **Semantic diff**: each blend output lists its changes by category with On/Off toggles. Toggling asks the model to update the code with only the enabled categories; **Reset All** restores the full output. The chevron hides or shows the panel.
- **Show Code** opens the live code editor on the right; edits re-render immediately.
- **Regenerate** runs the same blend again. **Fix Render** sends a failing render's error to the model for repair (regex-based repair runs on every output first).
- **Add example** uploads screenshots or hand-drawn sketches, or adds the bundled samples. **Add source UI** adds the sample UIs or a pasted React + Tailwind component.
- In Live mode, **record fixtures** saves every response to `src/fixtures/` for the cached mode (dev server only).

## Golden path (the paper's Section 2 scenario)

1. Global-blend Health Categories into Fuji's profile.
2. Toggle the dark-theme change Off in Applied Changes.
3. Select the Top 100 carousel on the music profile, drop it on the Interests list, choose Layout.
4. Select the red Edit button, drop it on the contact info, choose Color + Layout + Content.
5. Refine with Show Code, Regenerate or Fix Render.

In cached mode, an action that has no exact recording replays the closest one and says so; if nothing fits, switch to Live.

## Substitutions

- GPT-4o is replaced by the LLM bridge's model (Claude Sonnet by default here; Haiku if you start the bridge without `BRIDGE_MODEL`).
- Example images are recreations of the paper's example screens (HTML in `examples-src/`, rendered with headless Chrome by `scripts/render-examples.sh`) plus one sketch we drew; stock photos under `/stock/` come from picsum.photos.
