# Implementation notes

## Files and boundaries

- `manifest.json`: Manifest V3, activeTab/scripting/storage, localhost backend access.
- `background.js`: toolbar injection and allowlisted API transport. The content
  script does not fetch external article URLs or call the bridge directly.
- `app.js`: shared injected sidebar and paragraph annotations. Shadow DOM isolates
  interface styling. The original article and its links remain in place; exact
  phrase highlights wrap text nodes and are removable.
- `logic.js`: shared progress partitions, cyclic navigation, and repeated/overlapping
  exact-phrase segmentation. Loaded before `app.js` in both environments.
- `server.py`: Python standard-library HTTP/static server on loopback port 8792;
  checks that bridge health names Codex before model calls, requests structured
  JSON, validates labels against supplied paragraph/criterion identifiers,
  and filters phrase quotes to exact source substrings.
- `index.html`, `reader.css`: local excerpt reader using the same app script.
- `test_server.py`: deterministic grounding/validation checks with fake model
  responses. These do not spend model credits or establish model accuracy.

## Paper mapping

Section 4.2.1 and Appendix D.1–D.3: topic recognition, top-down criteria generation
followed by a five-criterion diversity refinement, and options extracted from text.
The topic summary/search-phrase stages are combined into one structured response;
ten-sample majority voting is omitted. Initial criteria are requested as 15, then
five more; manual requests repeat the second stage. The same response ranks the
complete old/new set; validation rejects incomplete permutations. Manual ordering
overrides subsequent model ranking.

Section 4.2.2 and Appendix D.4: semantic paragraph labels, aggregated coverage,
criterion navigation, and on-demand exact phrase/sentiment/subject extraction.
Detail extraction and subject attribution are combined into one structured call.
No BART confidence scores or 0.96 threshold are claimed.

Section 4.2.3: focused visible paragraph dwell time of 2 seconds marks attention.
The looked-at set is cumulative across a topic; the skipped set is the current
page's criteria minus those actually read on that page. Recommendations are selected explicitly
from global criteria absent from all analyzed chunks of the topic's pages.
The model is prompted to balance relevance and diversity; it does not reproduce
the paper's graph weights, embeddings, perplexities, or greedy peeling.

## State and performance

Topics contain ordered criterion and option objects, pages keyed by source URL,
and cached recommendations. Pages contain paragraph labels, read paragraph IDs,
exact-phrase details, and a text signature used to invalidate changed content.
Editing criteria invalidates detailed phrase caches. Progress persists locally.
No automatic retries or duplicate racing requests. Long pages default to explicit
24-paragraph chunks; a whole-article action confirms the batch size, processes
sequentially, persists each result, and supports stopping after the current chunk.
At the article end, one automatic suggestion call runs after complete analysis
and dwell tracking of the last paragraph; a checkbox disables it. Failed automatic
requests require a manual retry. Model requests can
take several seconds or longer; controls disable during an outstanding operation.

## Known limits and assumptions

- Article detection prefers `article`, then `main`, then body; reads visible
  paragraphs/list items of at least 45 characters and excludes navigation etc.
  It does not fully solve boilerplate filtering, virtualized content, dynamic
  single-page navigation, cross-origin frames, or content added after injection.
- Very long individual paragraphs are not subdivided. At most 24 paragraphs are
  sent in a chunk; text length still affects model context and latency.
- Phrase overlap is segmented with all criterion associations. Inline labels use
  CSS pseudo-content so they do not alter source text, links, or exact quote offsets.
  Mixed sentiments on an overlapping segment use neutral fill and expose all
  sentiment/option associations in the tooltip and evidence cards.
- Criterion navigation wraps at boundaries. Progress is available both in the
  sidebar and in an end-of-article summary block.
- Options deduplicate by case-insensitive exact name, not entity resolution.
- Topic deletion is immediate after confirmation. Persistence is last-writer-wins
  across tabs; the reader and extension intentionally have separate storage.
- Page reassignment reanalyzes under the destination criteria. Historical read
  status is not transferred between topics.
- Browser service-worker lifecycle limits can interrupt unusually slow extension
  requests; the local reader avoids that transport constraint.
- The group confirmed successful Chrome installation after the Step 2 bytecode
  cache fix. Exhaustive live-site compatibility testing has not been automated.

The shared `llm-bridge/` is unmodified. There are no external runtime dependencies.

Python bytecode caching is disabled by the backend. Run tests with `python3 -B`
as documented; Chrome refuses an unpacked extension containing `__pycache__`.
Validate Python syntax using `ast.parse` rather than `py_compile`/`compileall`,
which explicitly generate cache files even with `-B`.

## Step 1 verification

Five grounding/validation unit tests passed, JavaScript syntax checks passed, and
the extension manifest parsed as valid JSON. A browser smoke test against the real
Codex bridge generated 20 criteria, annotated all seven Figure 5 excerpt paragraphs,
produced exact-phrase sentiment/option evidence, tracked visible reading, generated
two unseen-criterion search links, and restored the results after reload. These
checks verify execution, not equivalence to the paper's evaluation results.

## Step 3 paper feature comparison

| Paper behavior | Version 1 disposition |
| --- | --- |
| Recognize/group topics; manually manage topics and page assignments | Implemented; semantic matching substitutes for embeddings. Reassignment removes the old assignment only after successful new analysis. |
| Global criteria, descriptions, diverse additions, importance ranking | Implemented; old/new criteria are ranked together unless the user has manually reordered them. |
| Encountered options and editable/pinned/reordered overview | Implemented; option entity aliases remain separate. |
| Page/paragraph grounding, implicit criteria, criterion navigation | Implemented through bridge classification; cyclic navigation now advances reliably. |
| Exact phrase criteria, sentiments, subject options | Implemented with inline criterion labels and overlap/repetition handling; mixed overlap sentiments are neutral-colored and explained in tooltips/cards. |
| Implicit attention and looked-at/skipped/unseen partitions | Implemented; skipped is page-specific even when that criterion was previously read elsewhere. |
| End-of-article progress and next search suggestions | Added an in-situ summary with one automatic recommendation request after complete analysis/read-to-end; manual refresh and automatic opt-out available. |
| Whole-page processing | Default bounded chunks plus explicitly confirmed whole-article processing with stop control. |
| Automatically active on every visited page | Toolbar activation retained as a labelled substitution; no new all-sites permission requested. |
| Exact NLP models and cloud infrastructure | Documented substitutions retained as authorized by the group. |

Seven backend validation tests and three JavaScript behavior tests pass. The real
bridge/browser smoke test also exercised combined ranking of 25 criteria and
positive/negative phrase analysis with visible inline criterion labels. The group
also saw two search links generated automatically after scrolling to the end.
The whole-article batch path has not been exercised with a large real-model run,
to avoid spending the group's plan on a verification batch. The group
confirmed extension loading during Step 2. No rubric was accessed and no grading
was performed by the agent.
