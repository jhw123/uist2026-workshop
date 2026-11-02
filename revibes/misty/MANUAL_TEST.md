# Misty: manual test guide

Each test follows an example from the paper. Tests marked "model" take 15 to 35 seconds and use your
plan, so wait for "Blending…" to finish. Blends vary between runs, so check for the behaviour
described rather than an exact match.

## Before you start

The bridge and the app may already be running from this session. Open http://localhost:5173, and if the
line at the bottom of the canvas says blends use the bridge model, with no red warning, skip to the tests.

Otherwise:

1. In one terminal, from the repository root, start the LLM bridge. On this laptop the `claude` command
   (2.0.28) is too old and gives `unknown option '--tools'`, so update Claude Code first.

   ```bash
   python3 llm-bridge/bridge.py claude
   ```

2. In a second terminal, start the app, then open http://localhost:5173.

   ```bash
   cd revibes/misty/app && npm run dev
   ```

Prefer to be walked through it? Press **Guided Demo** in the toolbar for an on-screen version of these
tests. Sections A and J are combined there, and so are C and D.

Press **New Canvas** in the toolbar to get a clean canvas (the canvas is saved in the browser, so a reload keeps it). To remove a node, click its panel and press Backspace.
Use the fit-view button at the bottom left (the square corners) whenever nodes go off screen.

## A. Figure 1: the parks card layout (model)

1. Press **New Canvas**. You see a store example on the left and "Find parks" on the right.
2. Drag across the example to select the big **Featured** card. A dashed box appears, with **Undo** and **Done**.
3. Press **Undo**. The box disappears. Select the card again.
4. Drag from inside the box onto the **Steep Ravine** card. A small thumbnail follows the pointer, and the card under it pulses purple.
5. Drop it. **Pick Blending Option** appears, and **Next** is disabled.
6. Click **Layout**. It turns dark and Next turns on. Press **Next**.

**Expect:** a new Code Render node to the right, joined by a solid and a dashed line. All the cards now have an image on top with text below, and all the original park names remain. The original node is unchanged. **Applied Changes** lists categories such as LAYOUT and COLOR, each with a toggle.

## B. Section 2: Fuji's global blend and dark theme toggle (model)

1. Press **New Canvas**. Click each default panel and press Backspace to clear the canvas.
2. **Add Source** > **Fuji's profile (Section 2)**, then **Add Example** > **Health: dark list**. Press fit view.
3. Drag from the blue bar on the right of the example to the purple bar on the left of Fuji's profile. Do not expect a dialog.

   **Expect:** a dark version of the profile, with list rows and chevrons, and Fuji's name, bio, email, phone and four interests. Applied Changes includes a dark theme category.

4. Turn **off** the toggle for the dark theme. It takes about 20 seconds, and the other toggles are disabled meanwhile.

   **Expect:** the light theme returns and the new list layout stays. This is frames 3 to 5 in the paper.

5. Turn it back **on**. **Expect:** dark returns instantly, with no model call.
6. Press **Reset All**. **Expect:** all toggles are on and the first blend is shown.

## C. Section 2: Fuji's carousel into Interests (model)

1. Continue from B, or start a canvas with Fuji's profile. **Add Example** > **Profile: carousel + Edit**. Press fit view.
2. Select the row of **Top 100** tiles, including their captions.
3. Drag onto **Lofi Music** in Fuji's profile. Check that the Interests row pulses. Drop, choose **Layout**, press **Next**.

**Expect:** Interests become tiles with short generated descriptions, such as a line about analog photography. All four interests stay.

**Known gap:** the paper shows a horizontally scrolling row with photos. In our three runs Haiku produced a two-column grid with gradient tiles. Note what you see.

**Workaround to try:** drop again, choose **Layout** and **Customize**, and type `horizontal scrolling carousel with photos`. We have not tested this.

## D. Section 2: adding the Edit button (model)

1. Use the node from C as the target. Select only the red **Edit** button in the profile example. Zoom in with the + button if it is small.
2. Drag it onto Fuji's email or phone line. Drop it.
3. Click **Color**, **Layout** and **Content**. All three should stay dark. Press **Next**.

**Expect:** a red rounded Edit button near the contact details, with everything else unchanged. The node's small label reads "Color + Layout + Content". This is frame 12 in the paper.

## E. Study task 2: add a header (model)

1. Press **New Canvas**. Select the **Products** bar at the top of the store example.
2. Drag it onto the **Nearby** chips or the search box. Choose **Content**, press **Next**.

**Expect:** a centered header at the top with a title that suits the parks, such as "Saved Trails", rather than the word "Products". The rest stays as it was.

## F. Study task 3: blend a hand-drawn sketch (model)

1. Press **New Canvas**. **Add Example** > **Hand-drawn sketch**. The panel is titled **Reference Sketch**. Press fit view.
2. Drag from its blue bar to the Find parks purple bar.

**Expect:** the sketch's structure: search bar, big image, three small cards, list rows with round thumbnails, a tab bar. The parks keep their content, and the result looks like a finished UI rather than a drawing.

To go further, draw your own on paper, photograph it, and add it with **Add Example** > **Upload**.

## G. Study task 4: your own example (model)

1. Find any mobile app screenshot online and save it, or take your own.
2. Add it with **Add Example** > **Upload**, by dropping the file on the canvas, or by pasting it.
3. Use any mix of A to F until you are satisfied. Blending into a result node also works.

## H. Customize and Regenerate (model)

1. Press **New Canvas**. Select the **Ways to save** tiles and drop them on a park card.
2. Click **Customize**. **Next** stays disabled until you type. Type `the corner roundness of the tiles`, then press **Next**.

   **Expect:** corners change and little else, often just one toggle.

3. On that node press **Regenerate**. **Expect:** the same node updates in place, and no new node appears.

## I. Code editor and Fix Render

1. On any node press **Show Code**. The editor opens on the right.
2. Change some visible text. **Expect:** the UI updates as you type.
3. Type a stray `<` inside the markup. **Expect:** a red error in the editor and under the node, and **Fix Render** in red.
4. Press **Fix Render** (model, about 5 seconds if the syntax rules can't repair it). **Expect:** the UI renders again.
5. Press **Copy**, then paste somewhere. **Expect:** the component code. Copy was not tested in our run.

## J. Fine-grained changes and panel

1. On a blended node, open "N class changes" under a category.
2. Edit a value on the right of an arrow, for example change `rounded-2xl` to `rounded-none`, and press Enter. **Expect:** the UI changes at once, with no loading state.
3. Press **Reset All**. **Expect:** the blend is restored. This also discards edits made in the code editor.
4. Press the **‹** chevron beside the panel, then the chevron again. **Expect:** the panel collapses and returns.

## K. Cancelling and recovery

1. Drop a selection onto a UI, then press **Cancel**, press Esc, or click outside the dialog. **Expect:** the dialog and highlight disappear and no node is created.
2. Stop the bridge (Ctrl-C in its terminal) and try a blend. **Expect:** a clear error under the new node saying the bridge can't be reached. This was not tested in our run. Restart the bridge and press **Regenerate**.

## Things to look out for

- Layout-only blends often change colors and fonts too, and list them as their own categories. Check whether the toggles cover it.
- Inside the rendered screen, some generated UIs are taller than the screen, so scroll inside them.
- A drop targets the nearest card-sized block, so a very small element can't be targeted exactly.
- Placeholder landscapes stand in for real photos, so images won't match the content.
