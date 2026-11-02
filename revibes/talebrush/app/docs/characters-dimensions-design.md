# Multiple characters and story dimensions

Approved on 2026-11-02: named characters with independent Fortune, Mood, Confidence, Tension and custom dimension curves. This is an explicitly requested remix beyond the original paper.

## Experience

Add a cast bar above the arc. Users add, select, rename and remove characters and supply a short role/goal description for generation. Start with the existing Mike character; extra characters are user-named. Removing a character removes its own tracks only, is undoable, and cannot remove the last character.

Dimension chips select Fortune (bad/good), Mood (unhappy/happy), Confidence (uncertain/self-assured), or Tension (calm/under pressure). Add custom dimensions using a name, a low endpoint and a high endpoint. Custom dimensions can be removed with Undo available; the four built-ins remain available. The chart title, axes, help and point labels follow the selected character/dimension. A drawing updates only that pair's curve. An expandable overview lists every constrained pair and lets users switch directly to it.

Sketch release still regenerates only the touched eligible sentence slots. All characters' drawn constraints at those slots are included together. They are soft narrative targets: contrasting fortunes can be possible, while conflicting controls may require a compromise. Surprise remains a single shared story-level dimension. Human-authored sentences remain fixed anchors.

## Storage and rendering

Schema version 2 stores `characters`, `dimensions`, `tracks` and selected pair IDs. Each character/dimension pair has an independent array of controls and recognized values. Slots keep stable IDs/text/source. Insert/delete shifts every track with the sentence rows. The existing SVG renderer receives a selected-track view; no separate canvas per pair is needed.

Migrate existing single-protagonist drafts and all history entries from the existing localStorage key: create one character using the saved protagonist, copy fortune controls/scores into its Fortune track, retain text/title/surprise, and initialize the added tracks empty. Save an untouched v1 backup before writing migrated storage. New history snapshots include the whole cast and every track. Previewing an old history should show its own cast/dimensions without silently replacing the current draft.

## Model contract

Keep the existing Codex bridge and legacy one-character API compatibility. New requests validate cast, dimension definitions, all track lengths, index bounds, uniqueness and finite numeric values. Generation receives the full cast and every drawn pair's targets for each requested slot. Candidate recognition receives only character/dimension meanings and actual candidate text/context, never targets. Score the active pair and every constrained pair in one recognition batch; use aggregate normalized error across constrained pairs to select a candidate. Unconstrained pairs do not steer selection. Text edits invalidate affected character/dimension scores; character renames invalidate that character's scores. Analyze arcs scores the active and constrained pairs. No extra model call is made just by switching a tab.

Keep 30 sentence slots and 24 generated slots per request. Bound cast to six characters and dimensions to eight (four built-in plus four custom) to keep prompt and response sizes manageable. Reject invalid/duplicate names and IDs, unknown pairs and malformed model outputs without partial updates. Model results are approximate and are labelled as such.

## Verification

Test independent tracks for different characters/dimensions, rename/removal, custom endpoint validation, aligned insertion/deletion, lossless v1/history migration and independent multi-attribute scoring. Test opposing goals/candidate compromise and preserve existing legacy tests. Browser-test adding/selecting characters, custom dimensions, independent drawing persistence, history and reload. Run one bounded live multi-character generation. Keep the shared bridge unchanged and record the remix in `revibes/talebrush/remixes.md`.
