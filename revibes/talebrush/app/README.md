# TaleBrush (revibe)

A rebuild of TaleBrush (Chung et al., CHI 2022) from the paper alone. You sketch
how the protagonist's fortune should rise and fall, and TaleBrush writes story
sentences that follow the sketch. It then draws the fortune of the resulting
story back onto your sketch.

> **Substitution.** The paper uses GPT-Neo 2.7B with trained soft prompts (for
> recognition, continuation and infilling) and a modified GeDi model
> (GPT2-medium) for fortune control. Those trained models are not available.
> This rebuild sends the same tasks as prompts to a language model through
> the workshop's LLM bridge (Claude Haiku through Claude Code). The
> interface shows this in a banner.

## Launch

Two terminals, both from the **repository root**:

1. Start the LLM bridge (no API key needed; it uses your Claude Code sign-in):

       python3 llm-bridge/bridge.py claude

2. Start TaleBrush:

       python3 revibes/talebrush/app/server.py

   Open **http://localhost:5175**. The top-right corner should say
   `LLM bridge: claude / haiku`.

Only Python 3 is needed. Nothing to install.

If port 8787 is taken by another revibe's bridge, run the bridge on another port
and point TaleBrush at it:

    python3 llm-bridge/bridge.py claude 8788
    BRIDGE_URL=http://localhost:8788 python3 revibes/talebrush/app/server.py

To use another port for TaleBrush itself: `python3 revibes/talebrush/app/server.py 5180`.

## Use

**Text editor (left).** Each bullet (`>`) is one sentence slot. Type your own
sentences; press **Enter** for a new slot and **Backspace** on an empty slot to
remove it. Slots you wrote have a gray bar, generated ones a blue bar. The
number on the right is the fortune TaleBrush recognized for that sentence
(0 = very bad, 1 = very good). You can edit any generated sentence; once
edited it counts as yours and is not regenerated.

**Protagonist.** Type the protagonist's name in the box above the canvas
("Mike 's fortune").

**Fortune canvas (right).** The x-axis is the story, one sentence per slot,
left to right, matching the bullets. The y-axis is the protagonist's fortune
(higher = better). Each sentence appears as a dot, and dots of consecutive
sentences are connected. A blank bullet leaves a gap.

- **Sketch with the pen** over the slots you want written. When you lift the
  pen, TaleBrush generates sentences for the sketched empty or generated slots.
  It writes them one at a time and draws their recognized fortune as a blue line.
- **Drawing speed sets how tightly the sentences must follow.** Draw slowly
  for a thin envelope (tight control) or quickly for a wide one (loose). The
  green hatched band shows this. For a thin envelope TaleBrush tries up to 3
  sentences per slot and keeps the closest; for a wide one it tries up to 2.
- **Infilling.** If you have written sentences after the sketched part (for
  example, an ending in the last bullet), TaleBrush fills the gap so it leads
  into them.
- **Redraw part of the line** to regenerate only those slots.
- **Eraser.** Erase part of the sketch to make a break in it. Erased slots
  between sketched ones get a sentence with no fortune target.
- **Generate Again** writes new sentences for the whole current sketch (your
  own sentences are kept).
- **Stop generating** appears while sentences are being written.

**Surprise.** Tick "Surprise in a separate panel." to open a second canvas.
Sketch a thin line there for how surprising each sentence should be (bottom =
expected, top = unexpected twist). It applies to the next generation. Without
the panel, surprise is low (0.3).

**History.** Every generation is stored. Open **History ▾** to see the list:
all stored stories appear on the canvas in low opacity. Hover over one to
preview its text and arc (purple). Click it to roll back to it. Use ✎ to
rename and ✕ to delete.

Each sentence takes a few seconds: one model call to write it and one to
recognize its fortune, plus retries when it misses the target by more than
0.2. A sketch over six slots usually takes 30–90 seconds.
