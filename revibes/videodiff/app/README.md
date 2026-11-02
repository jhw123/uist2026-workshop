# VideoDiff (revibed)

A rebuild of **VideoDiff: Human-AI Video Co-Creation with Alternatives** (Huh et al.), made from the paper alone.
VideoDiff generates 10 AI alternatives for each editing stage (rough cut, B-roll, text effects), aligns them so
you can compare them at a glance in a timeline view and a transcript view, and lets you sort, pin, archive,
refine, recombine and regenerate them.

## Launch

You need Python 3 and a signed-in `claude` command (Claude Code). No API keys, no `npm install`.

From the repository root, in two terminals:

```bash
python3 llm-bridge/bridge.py claude          # 1. the LLM bridge (model calls go through Claude Code)
python3 revibes/videodiff/app/server.py      # 2. VideoDiff, at http://localhost:8030
```

Open **http://localhost:8030** in Chrome, Edge or Safari (a recent version).

- Another port for VideoDiff: `python3 revibes/videodiff/app/server.py 8031`.
- To let others on your network open it at `http://<your IP>:8030`:
  `HOST=0.0.0.0 python3 revibes/videodiff/app/server.py`. Their model calls run on your plan.
- If the bridge runs on another port: `BRIDGE_URL=http://localhost:8788 python3 revibes/videodiff/app/server.py`.
- Check the bridge at http://localhost:8787/health.

## Use

1. **Pick a source video** in the top bar: the two workshop videos (*How to cook a pheasant*, *At the Cinema
   Museum*) or **Upload video…** with its transcript. On first open VideoDiff segments the transcript into
   sections, finds visually concrete keywords, then generates **10 rough cuts** (about 20–40 s; cards fill in
   as they arrive). Everything is saved, so reloading the page keeps your versions.
2. **Versions outline** (left): every version of each stage. Pinned ones are blue, archived ones grey. Click one
   to jump to it; click a stage name to switch stage.
3. **Compare** in the main area:
   - **Timeline View / Transcript View** switch (top right).
   - **Extracted Timeline / Original Timeline** switch: show each version on its own edited timeline, or aligned
     on the source video, with the parts it leaves out shown lighter.
   - Sections have consistent colours in both views. Hover a section or thumbnail to see thumbnails, topic
     keywords and the narration; hover a lighter (excluded) part to see what is missing. Click to play from there.
   - In the transcript view, visually concrete keywords are **bold** (rough cut stage), section headings play the
     section, ▲ collapses a section in every version, and the columns scroll together.
   - B-roll stage: B-roll thumbnails sit above the timeline with their search keyword; hover to see which scene
     each covers, click to preview it in the video. Text stage: the keyword of each text effect (❞) sits above
     the timeline; hover for the narration sentence, click to preview.
4. **Organize**: **Sort By** (rough cut: duration, number of sections; B-roll: number of B-rolls, media type;
   text: number of effects, style). On each version: 📌 pin to the top, 🗃 archive to the bottom.
5. **Customize**:
   - ✎ **Edit** a version with a prompt ("shorten the part about making stock"). The edited version appears right
     below the original, with a one-line summary of what changed.
   - ✨ **GENERATE NEW**: describe a new version, recombine versions by number ("use first two B-roll images from
     #3 and last B-roll image from #7"), or press **Surprise me**. New versions are pinned to the top.
6. **Next stage**: 🪄 on a rough cut = **Add B-roll** (10 B-roll versions of that rough cut). 🪄 on a B-roll
   version = **Add text effects** (10 text versions). Pinned versions of a stage are kept when you generate a
   new set; unpinned ones are replaced.
7. **Start over** (bottom left) deletes the versions of the current video and generates new rough cuts.

## What differs from the paper (substitutions)

| Paper | Here | Why |
|---|---|---|
| OpenAI GPT-4o | the workshop **LLM bridge** → Claude Code's small model (Haiku) | no API keys at the workshop |
| Whisper API transcription | transcripts provided in `papers/videodiff/materials/transcripts/`; uploads need a Whisper JSON or SRT file | no Whisper key; local Whisper is a large download |
| Stock media API for B-roll | keyword search over the local library in `papers/videodiff/materials/broll/` (39 items) | no stock API key |
| Remotion player | a custom HTML5 player that plays the kept parts back to back and overlays B-roll and text | no build step needed |
| React + d3 | plain JavaScript modules and CSS | no `npm install` needed |

These are also listed in the app's left panel.
