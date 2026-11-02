# VideoDiff: developer guide

## Requirements

| Need | Why | Check |
|---|---|---|
| Python 3.9+ | the server (standard library only, no packages) | `python3 --version` |
| `claude` CLI, signed in | answers LLM calls through the workshop bridge | `claude --version` |
| A modern browser (Chrome tested) | the whole UI, thumbnail extraction and playback | |

There is no build step, no `npm install` and no `pip install`. The frontend is plain
ES modules served as static files.

## Running

    python3 llm-bridge/bridge.py claude          # repo root, port 8787
    python3 revibes/videodiff/app/server.py 8420 # app

Environment variables for `server.py`:

| Variable | Default | Meaning |
|---|---|---|
| `BRIDGE_URL` | `http://localhost:8787` | where the LLM bridge listens |
| `VIDEODIFF_MATERIALS` | `<repo>/papers/videodiff/materials` | sample videos, transcripts, B-roll library |
| `VIDEODIFF_DATA` | `app/data` | saved projects and uploads (git-ignored) |
| `VIDEODIFF_QUIET` | unset | set to silence request logging |

URL flags: `?video=<id>` opens a video directly; `&stub=1` uses the offline stub.

## Architecture

    app/
      server.py            HTTP server (stdlib): static files, video range requests,
                           uploads, project save/load, B-roll index, LLM proxy
      public/index.html
      public/styles.css
      public/js/
        main.js            app state, outline, toolbar, version rows/columns,
                           popovers (edit / generate new / surprise me), stage flow
        model.js           transcript, sections, edit lists, edited<->source time,
                           per-version layout, B-roll keyword search
        ai.js              all prompts (sections, visual keywords, rough cut,
                           B-roll, text effects, edit / recombine / surprise),
                           augmentation prompts from Appendix B, offline stub
        views.js           timeline view and transcript view renderers
        player.js          composite player: plays the edit list, overlays B-roll
                           and text effects (stands in for Remotion)
        thumbs.js          extracts filmstrip thumbnails from the source video in the browser
        util.js            DOM helper, icons, tooltip, toasts, concurrency pool

### Server API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/videos` | sample and uploaded videos |
| GET | `/api/health` | is the bridge reachable |
| GET | `/api/broll?video=<id>` | B-roll library items (all items for uploads) |
| GET/PUT/DELETE | `/api/projects/<id>` | load / save / reset a project's state |
| POST | `/api/upload?name=<file>` | raw video body |
| POST | `/api/upload-transcript?id=<id>&format=json\|srt` | transcript body |
| POST | `/api/llm` | forwarded to the bridge's `/v1/chat/completions` |
| GET | `/materials/...`, `/uploads/...` | media with HTTP range support |

### Data model

- **Transcript**: Whisper segments `{i, start, end, text, words}`. Segments are the
  unit of editing.
- **Sections**: contiguous segment ranges `{title, start, end, color, keywords}`,
  extracted once from the source and shared by every version (so colours and names
  match across versions).
- **Rough cut version**: `segs`, an ordered list of segment indices. Consecutive
  segments merge into clips; `layoutVersion()` derives clips, edited duration,
  section runs and the edited<->source mapping.
- **B-roll version**: `{rc, items:[{seg, keyword, mediaItem}], media}` on a rough cut.
- **Text version**: `{br, items:[{seg, text, style?}], style}` on a B-roll version.
- Common fields: `label` (`5`, `5-Edited`), `pinned`, `archived`, `parentId`
  (edits are shown under their original), `prompt`, `summary`, `attrs`
  (augmentation chips).

A project (sections, keywords, all versions) is saved as JSON in `data/projects/<video id>.json`.

### LLM calls

All calls use the OpenAI chat format with `response_format: json_object`, sent to
`/api/llm` and forwarded to the bridge. Per stage, `augmentations()` crosses the two
Appendix B attributes (rough cut: length x focus; B-roll: media x frequency; text:
style x frequency) so the ten generations differ. Calls run at most 4 at once.
Prompted edits send the existing versions (by ID) so the model can recombine them;
B-roll items may name `"from": "#3"` to copy that version's exact image.

### Playback

`Player` keeps one `<video>` per version on the source file. A
`requestAnimationFrame` loop jumps to the next clip at each cut and computes the
edited time, which drives the progress bar, the playheads in the views and the
overlays (B-roll image/clip, text effect in title / subtitle / lower-third style).

## Changing things

- Prompts and augmentation options: `public/js/ai.js`.
- Number of generations per stage: the "Variations per generation" selector (3/5/10).
- Section colours: `SECTION_COLORS` in `util.js`.
- Timeline sizes: `.tl-*` rules in `styles.css` and `TILE_W` in `views.js`.

## Troubleshooting

- *"LLM bridge offline"*: start the bridge; check `http://localhost:8787/health`.
- *Thumbnails are grey*: they are extracted progressively after a video opens.
- *A generation failed*: a toast shows the error; partial results are kept. Try again.
- *Start over*: "Reset project" in the outline, or delete `data/projects/<id>.json`.
