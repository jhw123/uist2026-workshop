# TaleBrush (revibed)

A rebuild of **TaleBrush** (Chung et al., CHI 2022) from the paper alone: a story
ideation tool where you sketch how a protagonist's fortune should rise and fall,
and a language model writes story sentences that follow the sketch.

## Launch

You need Python 3 and Claude Code (`claude`) signed in. No API key is needed.

1. In one terminal, from the **repository root**, start the LLM bridge:

       python3 llm-bridge/bridge.py claude

2. In a second terminal, start TaleBrush:

       cd revibes/talebrush/app
       python3 server.py            # or: python3 server.py 8791 to use another port

3. Open <http://localhost:8790>.

If the bridge runs on another port, start the app with
`BRIDGE_URL=http://localhost:8788 python3 server.py`. A yellow banner at the top
of the page tells you when the bridge cannot be reached.

## Use

The screen has the **text editor** on the left and the **canvas** on the right.

1. **Name the protagonist** in the box above the canvas ("Mike 's fortune").
2. **Write a sentence or two** in the editor. Each bullet (`>`) is one sentence
   and one step on the canvas's x axis. Press Enter for a new bullet, Backspace
   on an empty bullet to remove it. After a short pause, TaleBrush recognises the
   protagonist's fortune in each sentence and plots it as a gray dot; blank
   bullets leave a gap in the line.
3. **Sketch the fortune** with the pen on the canvas: x is the position in the
   story (sentence units, marked by faint vertical lines), y is how good or bad
   the protagonist's fortune should be (top = good, bottom = bad).
   - **Sketching speed sets control tightness.** Draw slowly for a thin green
     envelope: TaleBrush tries more candidate sentences to match it. Draw fast for
     a wide envelope: fewer tries, looser match.
   - When you lift the pen, TaleBrush generates sentences for the sketched slots
     (they appear in blue, one at a time) and draws their recognised fortune as a
     blue line on top of your sketch. Hover a dot to see its sentence, its
     fortune and the target; double-click it to jump to the sentence.
   - **Infilling:** if there is text after the sketched slots, TaleBrush fills
     the gap so it leads into that text. Your own sentences are never
     overwritten, so you can sketch right across a written beginning and ending:
     only the blanks between them are generated.
   - **Redraw part of the line** to regenerate only that part.
4. **Eraser:** switch to the eraser (under the canvas) and rub out part of the
   sketch (anywhere on the band, not only its centre). Erased slots show a
   dashed "no target" marker and are generated *without* a fortune target when
   you click Generate Again; their dots are drawn hollow. Blank slots left
   between sketched parts are filled the same way.
5. **Generate Again** regenerates the last generated slots with the current
   sketch, to see another story.
6. **Surprise:** tick "Surprise in a separate panel." to open a second canvas.
   Sketch a thin line from Low Surprise to High Surprise; it applies to the next
   generation. Without it, a moderate default is used.
7. **Edit freely.** You can change any generated sentence; an edited sentence
   turns gray (it is now yours) and is used as context for later generations.
8. **New story** (top of the editor) clears the editor and the sketches; the
   current story is kept in History.
9. **History** (top right of the editor): every generation is stored. While the
   list is open, all stored stories' arcs are drawn faintly on the canvas;
   hovering one shows its text in the editor and highlights its arc. Click it
   to roll back to it. Rename (✎) or delete (×) entries.

## Substitutions (also labelled at the bottom of the page)

- **Language model.** The paper used GPT-Neo 2.7B with trained soft prompts and
  a modified GeDi model (GPT2-medium) trained on crowd-annotated ROCStories. None
  of these trained models are available, so both fortune **recognition** and
  fortune-**controlled generation** are done by prompting a language model
  through the workshop's LLM bridge, which answers with Claude Haiku via Claude
  Code. The paper's structure is kept: separate recognition and generation
  calls, continuation / infill-from-previous / infill-from-next modes, and
  regeneration when the recognised fortune is more than 0.2 from the sketch.
- **Surprise** was the softmax temperature in the paper. The bridge ignores
  temperature, so the surprise level is given to the model as an instruction.
- **Regeneration** is done by asking for 2–3 candidates in one call and scoring
  them all in one recognition call, instead of calling the model again for each
  retry. This keeps a generation at two model calls per sentence.

## Note on cost and speed

Each generated sentence takes two model calls (about 4–8 seconds) and uses the
plan Claude Code is signed in to. Sketching across ten slots generates ten
sentences one after another, so it takes about a minute.

## Design chat

The "Ask about TaleBrush" button (bottom right) opens a chat for questions about design rationales and details. Answers are grounded in the paper's text (`papers/talebrush/paper/`, read by `server.py`) and go through the LLM bridge. This is an addition beyond the paper's interface.
