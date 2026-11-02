# Agent self-test of v1 against our draft rubric (2 November 2026)

A smoke test by the agent, run once per row in the browser, not the group's grading. "Golden" is cached
mode, "Live" the LLM bridge with Claude Sonnet. Fixes made during the test are listed at the end and are
in the committed code.

| ID | Golden | Live | What the agent saw |
|---|---|---|---|
| A1 | ran | ran | Launches; no console errors. |
| A2 | ran | ran | Green dot with "bridge: claude / sonnet". Offline case not tried. |
| A3 | ran | ran | Pan, wheel zoom, fit-view button and minimap work. Dragging from a node header moves the node instead of panning (expected React Flow behaviour, but easy to do by accident). |
| A4 | ran | ran | Example nodes have no editor; source nodes render code. |
| A5 | ran | – | Deleting a node removes it and its edges. |
| A6 | not run | not run | File upload could not be driven by the automation; the code path (FileReader to data URL) is untested. |
| A7 | ran | – | Pasted component with `import`, `export default function`, `class=` and an unclosed `<img>` rendered after repair (also covers E5). |
| B1 | ran | ran | New node appears pending, with dashed edge from the example and solid edge from the source. |
| B2 | ran | – | Source-to-source connection refused. |
| B3 | ran | ran | Content preserved in all three global blends. |
| B4 | ran | ran | Health Categories: dark grouped list, icons, chevrons, bold title. |
| B5 | – | ran | Second alternative (store products) placed below the first without overlap; featured card and tab bar adopted. |
| B6 | – | ran | Sketch blend: cover photo, overlapping avatar, name, stats row, 2-column interest grid, bottom tab bar. Used a `.map` over an icon list; the paper's global prompt does not forbid it. |
| B7 | – | ran | 11 calls between 7 and 14 s each. Each blend run once, so variance is unknown. No JSON failures. |
| C1 | ran | ran | Selection, Undo and Done work. A selection that starts on the node's header moves the node instead. |
| C2 | ran | – | "drag whole" chip drops and opens the dialog. |
| C3 | ran (programmatic) | – | Simulated dragover highlighted the block under the cursor and dragleave cleared it; not observed visually during a real drag. |
| C4 | ran | ran | Dialog matches the paper's options and descriptions; Next disabled until a choice. |
| C5 | ran | ran | Three aspects selected together. |
| C6 | ran | – | Customize with "typography" sends the custom aspect (cached mode replayed the closest recording, marked approximate). |
| C7 | ran | ran | Carousel → Interests, Layout: horizontal cards with artwork and titles. |
| C8 | ran | ran | Edit button → contact, Color + Layout + Content: the model made the contact rows red pill buttons instead of adding an Edit button. Deviates from the paper's step 12. |
| C9 | ran | ran | Changes applied to every list item in C7 and C8. |
| C10 | – | ran | Store "Products" header → top of Fuji, Content: a white header bar titled "Fuji" was added. |
| D1 | ran | ran | Categories with type label, description and On/Off. |
| D2 | ran | – | Class list expands with before → after classes. |
| D3 | ran | ran | Dark theme off returned the light theme, kept layout and icons. |
| D4 | – | ran | Toggling back on while another is off made a model call and restored that category. |
| D5 | – | ran | Reset All restored the full output without a call. |
| D6 | ran | – | Chevron collapses and reopens the panel. |
| D7 | – | ran | Two categories off: stats row removed and grid became one column, rest kept. |
| E1 | ran | ran | Editor opens with the node's code. |
| E2 | ran | – | Edit re-rendered the node (the test edit landed inside a class name; the render tolerated it). |
| E3 | ran | ran | No editor on example nodes. |
| E4 | ran | – | Regenerate in cached mode replayed the closest recording. Not run live. |
| E5 | ran | – | See A7. |
| E6 | – | ran | Broke the code in the editor; Fix Render restored a rendering version with the same design. |
| E7 | ran | ran | All ten recorded outputs use only `/stock/` images and lucide icons. |
| F1 | ran | – | Steps 1 to 4 replay from the four golden recordings. |
| F2 | ran | – | Off-path drag-and-drop replays the closest recording with an "approximate" toast; off-path toggle now reports "no cached response" instead of replacing the code. |
| F3 | not run | not run | |
| F4 | – | ran | Every live response during this test was recorded; 10 fixtures now. |

## Issues found and fixed, most to least serious

1. Error state hid the render: a CSS rule stretched every direct child of the render frame to full height, so a toggle or blend error covered the whole UI. Scoped the rule to the preview; the error is now a small box that can be dismissed by clicking it.
2. Off-path toggle or Fix Render in cached mode replayed a recording made for different code, replacing the node with unrelated code. Approximate replay is now limited to blends; toggles and fixes need an exact match and otherwise report that no cached response exists.
3. The "Add example" and "Add source UI" menus did not open: the toolbar's horizontal-overflow setting clipped them. Removed.
4. Menu items ran off to the right in one row because the toolbar forbids wrapping; items are now block-level.

## Issues noted, not fixed

- C8: the recorded Edit-button blend differs from the paper (restyled rows rather than a new button). The live model decides this; a re-record may give the paper's result.
- Starting a selection or a pan on a node's header drags the node. The image area and the dashed handles are the only selection surfaces.
- A6 and F3 untested.
