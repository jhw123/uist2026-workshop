# VideoDiff: developer guide

## Requirements

| Need | Version | Notes |
|---|---|---|
| Python | 3.9 or later | standard library only; no `pip install` |
| `claude` CLI, signed in | any recent | answers the model calls through `llm-bridge/` |
| Browser | recent Chrome, Edge or Safari | uses ES modules, `<dialog>`, `color-mix()`, `:has()`, container units |

No Node, no build step, no ffmpeg. Video frames for thumbnails are grabbed in the browser with a `<canvas>`.

## Run

```bash
# repository root
python3 llm-bridge/bridge.py claude            # port 8787
python3 revibes/videodiff/app/server.py        # port 8030 (or: server.py 8031)
```

Environment: `BRIDGE_URL` (default `http://localhost:8787`), `PORT` (default 8030; a first argument wins).

## Files

```
app/
  server.py          HTTP server: static files, video byte ranges, projects, state, generation API
  ai.py              all prompts and post-processing (sections, keywords, rough cut / B-roll / text generation)
  static/
    index.html       page skeleton, prompt and upload dialogs
    app.css          all styling, including the text-effect styles (title, subtitle, lower third)
    model.js         transcript/version maths: kept runs, edited <-> source time, section pieces
    player.js        CompositePlayer: plays a version's kept runs back to back, overlays B-roll and text
    main.js          state, outline, timeline view, transcript view, sorting, pin/archive, prompts, batches
  data/              (git-ignored) created at run time
    projects/<id>/analysis.json   sections + visually concrete keywords (cached, one LLM pass per video)
    projects/<id>/state.json      every version, pins, archive, view settings
    uploads/<id>/                 uploaded video, transcript.json, meta.json
```

Source videos, transcripts and the B-roll library are read from `papers/videodiff/materials/` (not copied).

## Data model

The transcript is Whisper's `segments` (sentence-like units, each with word timestamps). Every version stores:

```js
{ id: "5" | "8-Edited", stage: "roughcut" | "broll" | "text", seq,          // seq = creation order
  keep: [0, 1, 2, 7, 8, ...],          // kept sentence indices (the rough cut)
  brolls: [{ sentence, keyword, type, media: {file, type, title, credit, license, source} | null }],
  texts:  [{ sentence, text, style: "title" | "subtitle" | "lower" }],
  label,                               // the augmentation used, e.g. "Length: < 2 min · Coverage: Diverse"
  summary, origin: "ai" | "prompt" | "surprise" | "edit", prompt, editedFrom, pinned, archived }
```

- The edited video is the contiguous runs of `keep`, each from its first sentence's start to its last sentence's
  end, played back to back (`Model.runs`). Durations, the edited timeline and the player all use this.
- Sections come from the source transcript, once per video, and apply to every version (paper §4.2), so
  versions align. `Model.editedPieces` splits each run at section boundaries.
- B-roll and text versions copy `keep` from the version they were made from (the stage's `baseSnap`); text
  versions also copy its `brolls`. A B-roll covers its sentence; a text effect starts at its phrase's first word
  and lasts to the end of the sentence (at least 1.8 s).

## API (server.py)

| Method | Path | Does |
|---|---|---|
| GET | `/api/projects` | the workshop videos plus uploads |
| GET | `/api/project/<id>` | video URL, transcript segments, cached analysis and saved state |
| POST | `/api/project/<id>/analyze` | sections + keywords (LLM, then cached) |
| POST | `/api/project/<id>/state` | save the front end's state |
| POST | `/api/project/<id>/reset` | delete saved state (`?analysis=drop` also drops the analysis) |
| POST | `/api/plan` | `{stage}` → the 10 augmentation combinations for a batch |
| POST | `/api/generate` | one generation, see below |
| POST | `/api/upload?kind=video&name=&title=` | raw video body → new project id |
| POST | `/api/upload?kind=transcript&id=&name=` | raw Whisper JSON or SRT body |
| GET | `/api/health` | the bridge's `/health` |
| GET | `/media/videos/…`, `/media/broll/…`, `/media/uploads/…` | files, with HTTP Range support for seeking |

`/api/generate` body: `{project, stage, mode, augment?, variant?, prompt?, target?, versions?, base?}` where
`mode` is `augment` (initial batch), `prompt` (new or recombine), `surprise`, or `edit`; `target` is the version
to edit, `versions` all non-archived versions of the stage (for recombining by `#id`), and `base.keep` the rough
cut that B-roll/text work on. It returns `{keep | brolls | texts, summary, label?}`.

## How generation works (ai.py)

- **Analysis**: two parallel calls. Sections: the numbered transcript → 4–8 consecutive sections with title and
  topic keywords; `normalize_sections` repairs gaps and overlaps. Keywords: few-shot prompt for visually concrete
  keywords (paper footnote), kept only if they occur in the transcript.
- **Batches**: 10 calls, 4 at a time from the browser. The 10 combinations are the 3 × 3 augmentation prompts
  of Appendix B (length × focus; media × frequency; style × frequency) plus one random pair, shuffled.
- **Rough cut**: the model returns inclusive sentence ranges. Small models add up durations badly, so
  `repair_duration` trims sentences from the most-covered section, or adds neighbouring sentences, until the
  cut fits the requested length (only for augmented generations; prompts and edits are taken as returned).
- **B-roll**: the model gets the rough cut's sentences and the library's search terms, and returns
  `{sentence, keyword, type}`. `search_broll` scores library items by keyword match, preferring the requested
  media type, the same video, and items not already used. No match → the B-roll is kept with `media: null`
  and shown as "no result".
- **Text effects**: `{sentence, text, style}`, phrases copied from the sentence.
- **Prompts / Surprise me / Edit**: the same output formats plus a `summary` of the changes, which the UI shows
  under the version's title.

Model calls use `response_format: json_object`; `parse_json` strips code fences. A bridge or JSON error comes
back to the browser as `{error}` and is shown in the banner or the prompt dialog.

## Front-end notes

- `renderAll()` rebuilds the outline, toolbar and version list from `S` (state). Players are cached per version
  key and re-attached on every render, so playback survives re-renders.
- The timeline scale is shared by all versions of a stage: the longest version (extracted) or the source
  duration (original), so lengths compare directly.
- Synchronised transcript scrolling anchors on the first visible sentence index and scrolls the other columns
  to the same (or next kept) sentence.

## Known limits

- Thumbnails are grabbed every ~2 s of the source at load time (a few seconds); until then strips are empty.
- No export or render of the final video: the paper's tool previews edits, and so does this one.
- The bridge ignores model names and temperature; diversity comes from the augmentation prompts and the
  "variation k of 10" line.
