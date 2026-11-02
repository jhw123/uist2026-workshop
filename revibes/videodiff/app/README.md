# VideoDiff (revibed)

A web app for editing a video with AI alternatives, rebuilt from the paper
"VideoDiff: Human-AI Video Co-Creation with Alternatives" (Huh et al., CHI 2025).
You generate ten AI rough cuts, compare them in timeline and transcript views,
organise them (sort, pin, archive), refine them with prompts, and then repeat for
B-roll and text effects.

## Launch

You need Python 3, Google Chrome (or another modern browser) and the `claude`
command, signed in. Nothing to install.

1. **Start the LLM bridge** (terminal 1, from the repository root). The system's
   language-model calls go through it, so no API key is needed:

        python3 llm-bridge/bridge.py claude

   If the shell says `claude` is not found, put the CLI on your PATH first (for
   example the copy bundled with the VS Code extension:
   `export PATH="$HOME/.vscode/extensions/anthropic.claude-code-<version>-darwin-arm64/resources/native-binary:$PATH"`),
   or install it with `npm i -g @anthropic-ai/claude-code`.

2. **Start VideoDiff** (terminal 2):

        cd revibes/videodiff/app
        python3 server.py 8420

3. Open **http://localhost:8420**. The badge in the top bar turns green when the
   bridge is connected.

The model behind the bridge (Claude Haiku) answers in place of the paper's GPT-4o.
If the bridge is down you can continue with the **offline stub** (simple heuristics,
no LLM; labelled in the top bar) or open `http://localhost:8420/?video=pheasant-howto&stub=1`.

## Use

1. **Pick a video.** Two sample videos with transcripts are included (a pheasant
   how-to and a cinema museum tour). You can also upload your own video together
   with a transcript (Whisper JSON or SRT). VideoDiff splits the video into
   sections, marks visually concrete keywords and generates **10 rough cuts**
   (fewer if you change "Variations per generation" in the top bar). This takes
   12 LLM calls.
2. **Versions outline** (left) lists every version of every stage, e.g.
   `#5 | 2:04 | 6 Sections`. Click one to jump to it.
3. **Timeline view.** Each version has its own player and a section-coloured bar
   with a filmstrip. Hover a section for thumbnails, click to play from there.
   **Extracted / Original Timeline** switches between the edited timeline and the
   source timeline; in the source timeline excluded parts are lighter, and hovering
   them shows their thumbnails and topic keywords.
4. **Transcript view** (switch top right). Versions sit side by side with a mini
   timeline, section headings (click to play) and bold visual keywords. In the
   Original Timeline mode every column shows the full source transcript, with
   excluded text greyed out. Columns scroll together.
5. **Organise.** *Sort By* (duration and section count for rough cuts; number of
   effects and media type / style for B-roll and text). **Pin** moves a version to
   the top, **archive** to the bottom.
6. **Customise.**
   - **EDIT** on a version: type a change ("Shorten the part about making stock").
     The result appears right below as `#3-Edited` with a summary of the changes.
   - **GENERATE NEW**: describe a version, or click **Surprise me**. Refer to
     versions by ID to recombine them ("Use the opening of #2 and the ending of #7").
     New results are pinned to the top.
7. **Next stages.** The wand on a rough cut (**add B-roll**) generates 10 B-roll
   versions on it; the wand on a B-roll version generates 10 **text effect**
   versions. Switch stages with the tabs 1-2-3. B-roll comes from the small library in
   `papers/videodiff/materials/broll/`.

**Reset project** (bottom of the outline) deletes the saved sections and versions
for the current video. Work is saved automatically in `app/data/projects/`.
