# TaleBrush (revibe)

A rebuild of TaleBrush (Chung et al., CHI 2022) from the paper alone: you co-write
a short story outline with an AI by **sketching the protagonist's fortune** as a line.
The x axis is the story's sentences in order. The y axis is how good or bad the
protagonist's fortune is (higher is better).

## Launch

Needs Python 3 and Claude Code (`claude`), signed in. Nothing to install.

Open two terminals at the repository root:

    # 1. the LLM bridge (the system's model calls go through Claude Code)
    python3 llm-bridge/bridge.py claude

    # 2. TaleBrush
    python3 revibes/talebrush/app/server.py

Then open http://localhost:8501.

The status bar names the model in use. If it says the bridge is not answering, check
http://localhost:8787/health. If the bridge log says `unknown option '--tools'`, the
bridge found an old `claude` on your PATH. Put the current one first and restart it,
for example `PATH="$HOME/.claude/local:$PATH" python3 llm-bridge/bridge.py claude`
(use `type -a claude` to see which ones you have).

Other ports: `PORT=8600 BRIDGE_URL=http://localhost:8788 python3 revibes/talebrush/app/server.py`.

## Use

1. **Name the protagonist** in the box above the canvas ("Mike" 's fortune).
2. **Write a beginning** in the editor on the left, one sentence per bullet (`>`).
   Press Enter for a new bullet. Press Backspace at the start of a bullet to merge it into the one above. Each sentence appears
   as a grey dot on the canvas at its fortune level, read by the model.
   Blank bullets are empty sentence slots. There are 8 to start with; add more with Enter.
3. **Sketch the fortune** with the pen over the empty slots (green hatched line).
   When you lift the pen, TaleBrush writes a sentence for every slot the stroke covers,
   one at a time, and plots them as a blue line on top of your sketch.
   - **Sketching speed** sets how tightly it follows you. Drawn slowly, the line is thin and
     TaleBrush tries up to 2 extra generations per sentence to hit the target. Drawn fast, the line is wide and it tries 1.
     A sentence is regenerated when its fortune is more than 0.2 from the line.
   - **Infilling**: if there is text after the sketched part, the sentences are written to
     connect to it (filling alternately from the start and from the end of the gap).
   - **Redraw part of the line** to regenerate only those sentences.
   - **Eraser** (toolbar under the canvas): erase part of the line. The erased sentences are
     generated with no fortune target the next time you click Generate Again.
4. **Generate Again** regenerates every sketched slot with the same sketch.
5. **Surprise in a separate panel** opens a second canvas. Draw a line there to set how
   unexpected each sentence should be (low = predictable, high = surprising). It applies
   to the next generation. Without it, surprise is low (0.3).
6. **Edit any sentence** directly. Its fortune is read again after you stop typing.
7. **History** (top left) stores every generated story. While it is open, all stored
   arcs show faintly on the canvas. Hover a story to see its text and arc, click to roll back to it,
   and use ✎ to rename or ✕ to delete.

Generation takes a few seconds per sentence (one call to write it, one to read its fortune,
more if it is regenerated). **Stop** in the status bar ends a run after the current sentence.
Each call uses the group's Claude Code plan.

## What differs from the paper

The paper's models are GPT-Neo 2.7B with trained soft prompts and a modified GeDi steered by
GPT2-medium, trained on crowd-annotated fortune data. None of these are available here, so
**both the fortune recognition and the steered generation are done by prompting Claude Haiku
through the workshop LLM bridge** (the footer of the interface says so). The paper's
regeneration loop (threshold 0.2, best of up to 3) is kept. Surprise was the softmax temperature
in the paper. The bridge ignores temperature, so surprise is given to the model as an instruction.
See `DEVELOPER.md` for details.
