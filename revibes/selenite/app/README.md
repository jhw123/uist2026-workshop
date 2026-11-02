# Selenite — Table 5, Group 2

Version 1, after the Step 3 paper feature pass. No authors' code,
videos, demos, workshop rubric, or external source articles were used.

## Start

Requires Python 3 and the signed-in Codex CLI. No packages or API keys needed.
From the workshop repository root, in separate terminals:

```sh
python3 llm-bridge/bridge.py codex
```

```sh
python3 revibes/selenite/app/server.py
```

Check http://localhost:8787/health reports `backend: codex`.
Open http://localhost:8792 for the paper-excerpt reader, then click
**Analyze this article**. The reader uses the same UI and backend as the extension;
its short source text was transcribed from Figure 5, not fetched from the web.
The first analysis makes four sequential model calls: topic recognition, initial
criteria, five additional criteria, and paragraph analysis. Subsequent pages in
the same topic reuse criteria. Loading the interface alone makes no model calls.

## Load the Chrome extension

1. Open `chrome://extensions` in Chrome and enable Developer mode.
2. Click **Load unpacked** and select this `revibes/selenite/app` directory.
3. Visit an ordinary article page and click Selenite's toolbar icon (pin it if useful).
4. Click **Analyze this article**. Keep both local services running.

The extension uses `activeTab`: it reads and annotates a page only after you click
its toolbar action. Chrome internal pages, the Web Store, and most PDF viewers
cannot be annotated. Click the toolbar action again to hide/show the sidebar.
The extension intentionally does not run automatically on every visited page.

## Reading workflow

- Blue labels above paragraphs identify criteria, including implicit mentions.
- Click a sidebar criterion to expand its description and editing controls.
  Use ‹ / › to scroll between its mentions. Missing criteria/options are dimmed.
- Hover over a paragraph and select **Analyze** for exact-source phrase evidence,
  criterion sentiment, and option attribution. Select **Close analysis** to undo
  its highlights. Green = positive, red = negative, gray = neutral.
- Edit, pin, reorder, add, or delete criteria/options. Reanalyze after adding or
  changing a criterion's meaning. Existing annotations are relabeled after renaming.
- The topic selector changes the overview. Select **New topic**, then analyze to
  create a manual topic. **Move page here** reclassifies an existing page under
  the selected topic. Topic rename/delete controls are next to the selector.
- **Articles in this topic** links back to previously analyzed source pages.
- Additional criteria are ranked together with existing criteria; manually
  reordered criteria keep your order. After changing criteria, reanalyze the
  topic's articles before asking for unseen-criterion suggestions.
- Reading progress updates after two seconds of paragraph visibility while the
  page is focused. **Suggest next searches** selects two unseen criteria; their
  links open a search for the topic plus criterion.
- The same progress summary is inserted after the article's last paragraph.
  Once the entire page is annotated and you read to the end, it automatically
  requests suggestions once for that analysis. Turn this off with the checkbox
  in the end-of-article summary. No automatic calls run on partially analyzed pages.

Long pages are deliberately analyzed in chunks of at most 24 paragraphs.
Click **Analyze next 24 paragraphs** to continue; this prevents hidden large
batches of paid model calls. Until all chunks are processed, coverage is partial.
Alternatively, **Analyze entire article** asks you to confirm the number of
sequential calls before processing all chunks. **Stop after current chunk**
keeps completed work and prevents the next request.
Each chunk and each explicit detail/recommendation request makes one model call.
Errors are displayed without fabricated fallback results. Retry through the
appropriate action after checking the bridge terminal.

## Data and substitutions

Article text is transmitted through the local backend to the Codex bridge and
its configured model when analysis is requested. Topics, page URLs, reading
history, and cached annotations are saved in Chrome extension local storage;
the excerpt reader uses browser localStorage separately. No Firebase account
or cloud database is used. Delete topics through the UI to remove their history.
Changes in multiple tabs are not synchronized live; close other Selenite tabs
while editing the same research history.

The bridge's configured Codex model replaces GPT-4; model classification replaces
BART-large-MNLI; model topic matching replaces SentenceBERT; model recommendations
replace the GPT-2/SentenceBERT graph algorithm. Model results are estimates, not
verified facts or calibrated probabilities. The bridge ignores temperature and
requested model names. Vanilla JavaScript/shadow DOM replaces React/TypeScript;
the Python standard-library server and local storage replace Firebase.
See `../changes/v1.md` and `DEVELOPER.md` for details and remaining limitations.

If bridge port 8787 is occupied by another revibe, start your Codex bridge on a
free port, for example `python3 llm-bridge/bridge.py codex 8788`, then start the
backend as `SELENITE_BRIDGE=http://localhost:8788 python3 revibes/selenite/app/server.py`.
Do not stop another group's bridge. Backend port 8792 is fixed in the extension's
manifest/background; change both if that port needs replacing.

## Checks

```sh
node --check revibes/selenite/app/app.js
node --check revibes/selenite/app/background.js
node --test revibes/selenite/app/test_logic.cjs
python3 -B -m unittest discover -s revibes/selenite/app -p 'test_*.py'
```

Use `-B` for Python checks so they do not generate `__pycache__` inside the
extension directory. Chrome rejects unpacked extensions containing names that
start with `_`. Do not run `py_compile` or `compileall` in this directory.

Push access remains skipped. Version 1 is ready for the group's Step 4 grading.
