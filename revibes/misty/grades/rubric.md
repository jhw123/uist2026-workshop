# Misty revibe: evaluation rubric (our own draft, from the paper)

This rubric was written by the agent from the paper's description of Misty, for the group's own
evaluation. It is not the workshop's rubric. Grade each test in two columns, **Golden** (cached mode,
following the Guide) and **Live** (LLM bridge), with one of:

- **P** pass: works as the paper describes
- **~** partial: works with a defect, a workaround, or a visibly weaker result
- **F** fail: missing, crashes, or produces an unusable result
- **n/a** for tests that only apply to one mode

Write what you saw in the last column; the aided prompt in step 5 uses those notes. Live tests depend on
the model, so run each live blend at least twice before grading and note the variance.

## A. Launch and canvas (paper §4.2.2)

| ID | Test | How to test | Expected | Golden | Live | What we saw |
|---|---|---|---|---|---|---|
| A1 | App launches | `npm run dev`, open the URL | Canvas with two Reference Example nodes and one Code Render node, no console errors | | | |
| A2 | Bridge status | Start the bridge, reload | Toolbar dot turns green and names backend and model; without the bridge it says offline and cached mode still works | | | |
| A3 | Infinite canvas | Pan by dragging empty space, zoom with the wheel, use the minimap and controls | Nodes move together, no clipping, minimap tracks the view | | | |
| A4 | Node types | Inspect both node kinds | Example nodes show the image only (no code editor); source nodes render the code | | | |
| A5 | Node management | Move, select, delete (x or Delete key) nodes | Edges follow, deleting a node removes its edges, editor closes if its node is deleted | | | |
| A6 | Add example by upload | Add example → Upload a PNG screenshot and a photographed sketch | New example nodes appear below the others with the file name | | | |
| A7 | Add source by sample and paste | Add source UI → each sample; paste a `() => (...)` component | New Code Render renders the UI; imports and exports in pasted code are stripped | | | |

## B. Global blending (§2 steps 1 to 3, §4.2.1 mode 1)

| ID | Test | How to test | Expected | Golden | Live | What we saw |
|---|---|---|---|---|---|---|
| B1 | Connect to blend | Drag from an example's right handle to a source's left handle | A new Code Render appears to the right, pending overlay shown, edges from example (dashed) and source | | | |
| B2 | Invalid connections | Try source→source and example→example | Connection refused | | | |
| B3 | Content preserved | Compare the output with the source | Fuji's name, bio, contact and four interests all remain; no text copied from the example (no "Activity", "Heart"...) | | | |
| B4 | Style adopted | Compare the output with the example | Dark theme, grouped list rows with icons and chevrons, bolder title, as in the paper's step 3 | | | |
| B5 | Parallel alternatives | Blend a second example (store products) into the same source | Second output placed without overlapping the first; both remain comparable side by side | | | |
| B6 | Sketch blending (study task 3) | Blend the hand-drawn sketch globally | Layout follows the sketch (cover, avatar, stats row, 2-column grid, tab bar) with Fuji's content | | | |
| B7 | Latency and failures | Time a live blend; note any JSON or render failure | Under about 30 s with Sonnet; failures show a readable error on the node and a toast | n/a | | |

## C. Localized drag-and-drop blending (§2 steps 6 to 12, §4.2.1 mode 2)

| ID | Test | How to test | Expected | Golden | Live | What we saw |
|---|---|---|---|---|---|---|
| C1 | Region selection | Draw a rectangle on an example | Dashed selection appears; Undo clears it; Done confirms it and it becomes draggable | | | |
| C2 | Whole-example drag | Use the "drag whole" chip without a selection | Drop works with the full image as reference | | | |
| C3 | Hover highlight | Drag a selection over a Code Render | The part under the cursor gets a pulsing highlight that follows the cursor; leaving clears it | | | |
| C4 | Blending option dialog | Drop the selection | "Pick Blending Option" shows Color, Layout, Content, Customize with the paper's descriptions, Cancel and Next; Next disabled until a choice | | | |
| C5 | Multiple aspects | Select Color + Layout + Content | All three stay selected and the prompt names them | | | |
| C6 | Customize | Select Customize and type an aspect, e.g. "typography" | Text field appears; blend uses the custom aspect | | | |
| C7 | Layout blend of the carousel (step 9) | Carousel region onto Interests, Layout | Interests become a horizontal card row with an image and a short description per interest; other sections unchanged | | | |
| C8 | Content blend of the Edit button (step 12) | Edit button region onto the contact area, Color + Layout + Content | A red rounded Edit button is added near the contact info; existing design otherwise preserved | | | |
| C9 | Applies to all similar elements | Drop on one list item | The change is applied to every item of the list, not only the one dropped on (per the paper's prompt) | | | |
| C10 | Header addition (study task 2) | Drag a header region from the store example onto the top of a source, Content | A header section is added at the top, with content generated from the source's context | | | |

## D. Semantic diff and dynamic widgets (§2 steps 4 and 5, §4.2.3)

| ID | Test | How to test | Expected | Golden | Live | What we saw |
|---|---|---|---|---|---|---|
| D1 | Applied Changes panel | Look at any blend output | Panel lists change categories with a type label (Color, Layout, ...) and a one-line description, each with an On/Off toggle | | | |
| D2 | Class-level detail | Expand "n class changes" | Before → after Tailwind classes listed, matching the code | | | |
| D3 | Toggle off | Toggle the dark-theme category Off | Pending state, then the render returns to the light theme while the list layout and icons remain | | | |
| D4 | Toggle back on | Toggle it On again | The full blended output returns without a model call | | | |
| D5 | Reset All | Turn several off, press Reset All | All toggles On, original blended code restored | | | |
| D6 | Collapse | Use the chevron | Panel hides and the node shrinks; chevron reopens it | | | |
| D7 | Toggle independence | Toggle a second category off while the first is off | Both reverted, the rest kept | | | |

## E. Code editor, regenerate, fix (§4.2.2, §4.3)

| ID | Test | How to test | Expected | Golden | Live | What we saw |
|---|---|---|---|---|---|---|
| E1 | Show Code | Press Show Code on a node | Editor drawer opens on the right with that node's code, syntax highlighted | | | |
| E2 | Live edit | Change a class or text | The node re-renders within a second; other nodes unaffected | | | |
| E3 | Editor only for sources | Check example nodes | No code editor for examples | | | |
| E4 | Regenerate | Press Regenerate on a blend output | Same operation re-run on the same inputs; a different but valid result (cached: the same recording) | | | |
| E5 | Fix Render, heuristics | Paste code with `class=`, an `import` line and an unclosed `<img>` | Renders after automatic repair | | | |
| E6 | Fix Render, model | Break a blend output in the editor, press Fix Render | Error text shown under the render; after Fix Render the node renders again | n/a | | |
| E7 | Stock images and icons | Inspect generated code | Only `/stock/*.jpg` images and lucide icons are used; no broken images | | | |

## F. Modes, replay and recording (this rebuild's demo design)

| ID | Test | How to test | Expected | Golden | Live | What we saw |
|---|---|---|---|---|---|---|
| F1 | Golden path end to end | Follow Guide steps 1 to 4 in cached mode | Each step replays instantly; Guide counts the replays; no "approximate" toasts | | n/a | |
| F2 | Off-path action, cached | Do a blend not in the recordings | Either an "approximate" replay with a toast, or a clear "no cached response" message; never a hang | | n/a | |
| F3 | Mode switch mid-session | Switch to Live after cached steps | Next blend goes to the bridge; nodes from cached steps keep working | | | |
| F4 | Record fixtures | Live with "record fixtures", do a blend, check `src/fixtures/` | A new JSON file; after restarting the dev server, cached mode replays it | n/a | | |

## G. Output quality (the paper's study rated each blend 1 to 5)

For each live blend, also give a 1 to 5 satisfaction score as the study did (1 very unsatisfied, 5 very satisfied) and note the reason:

| Blend | Score | Reason |
|---|---|---|
| Global: Health Categories → Fuji | | |
| Toggle: dark theme off | | |
| Layout: carousel → Interests | | |
| Content: Edit button → contact | | |
| Global: sketch → Fuji | | |
| Your own example | | |

## Summary

| | Pass | Partial | Fail |
|---|---|---|---|
| Golden | | | |
| Live | | | |

Top three things to fix in the next round:
1.
2.
3.
