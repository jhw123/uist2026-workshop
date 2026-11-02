# Selenite (revibe)

A rebuild of **Selenite** (Liu et al., CHI 2024) from the paper alone: a reading
aid that gives you a comprehensive overview of an unfamiliar topic while you read
web pages about it. The paper's Chrome extension is rebuilt here as a web app: the
article is shown on the left and Selenite's sidebar on the right.

Built by Claude Code (Claude Fable 5.1) at the Revibing HCI workshop, UIST 2026.

## Launch

You need Python 3 (no packages) and the `claude` command signed in. Open two
terminals **in the repository root** (`uist2026-workshop/`).

1. Start the LLM bridge. Selenite's model calls (GPT-4 in the paper) go through
   it, so no API key is needed:

       python3 llm-bridge/bridge.py claude

   Check it at http://localhost:8787/health. If a bridge is already running with
   the `codex` backend, stop it and start it with `claude`.

2. Start Selenite:

       python3 revibes/selenite/app/server.py

   Open http://localhost:8790. The pill at the top right says whether the bridge
   is reachable. To use another port: `PORT=8791 python3 revibes/selenite/app/server.py`.
   If the bridge runs on another port: `BRIDGE_URL=http://localhost:8788 python3 …`.

## Use

1. **Open a page.** Paste a web address in the top bar and press Open, pick one of
   the **Sample pages** (they work without a network connection), or press
   **Paste text** to paste an article's text or HTML. Pages that need JavaScript to
   render, or that block scripts, may come back empty: paste their text instead.
2. **Global grounding** (sidebar). Selenite recognizes the page's **Topic**, retrieves
   about 20 **criteria that people consider regarding the topic** (name and
   description), and extracts the **options encountered so far** on the page.
   Options and criteria accumulate per topic across the pages you read.
   - Items **present on the current page** are highlighted with a mention count;
     the rest are greyed out.
   - Click a chip to expand it: edit its name or description in place, use **‹ ›**
     to jump between its mentions on the page, pin it to the top, or delete it.
   - Drag chips to reorder them. **Request more criteria** asks the model for five
     more; **Add a criterion** lets you add your own. Either way the page is
     annotated again for the new criteria.
   - The **⋮** menu next to the topic lets you rename it, move the page to another
     topic, start a new topic for the page, or ask the model to recognize it again.
     Pages whose topics are about the same subject are clustered into one topic.
3. **Local grounding** (article). Each paragraph gets in-situ chips of the criteria
   (blue) and options (orange) it discusses; faded chips are lower-confidence.
   Click a chip to jump to the next paragraph with the same label. Hover a
   paragraph and press **💡 Analyze** to zoom in: phrases are wrapped in green
   (positive), red (negative) or grey (neutral) boxes, each labelled with the
   criterion and, when known, the option it is about.
4. **Next steps** (end of the article). Selenite tracks which paragraphs you
   dwelt on for at least 2 seconds. The summary block lists the criteria you
   **looked at**, the ones on the page you **ignored**, and two criteria from the
   overview that no page of this topic has discussed yet and that you **might be
   interested in further searching for**. Click one to search the web for it, then
   open a result with Selenite. Press **Suggest** to recompute.
5. **◈ Selenite** (top left) shows your topics and pages; reopen a page to
   continue, or delete pages and topics there.

## Substitutions

- **GPT-4 → the bridge's model** (a small, fast model such as Haiku). All
  prompts from the paper's Appendix D are used; the bridge ignores temperature
  and the `n=10` sampling of the topic prompt (one answer is used).
- **bart-large-mnli (zero-shot NLI) → the bridge.** Per-paragraph criteria and
  option labels come from one model call per batch of paragraphs, returning
  JSON labels with a 0 to 1 score (labels below 0.5 are dropped; the paper's
  0.96 threshold applied to NLI probabilities).
- **SentenceBERT topic clustering → the bridge** decides whether a new page's
  topic is the same subject as an existing topic.
- **GPT-2 perplexity relevance + SentenceBERT diversity** for the next-step
  suggestions → relevance scores from the bridge and TF-IDF cosine distance
  between criterion descriptions, then the paper's greedy peeling to 2 criteria.
- **Firebase → a JSON file** at `app/data/db.json` (delete it to start over).
- **Chrome extension → web app** with its own page fetcher and extractor.

See `DEVELOPER.md` for how the code is organized.
