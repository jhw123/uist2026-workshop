# Revibing HCI, UIST 2026: background for the coding agent

You are working with a small group at the Revibing HCI workshop (UIST 2026,
Detroit, 2 November). The group **revibes** a research paper: a coding agent
rebuilds the interactive system the paper describes from the paper alone, and
the group measures how much of it works. The procedure comes from Adar et al.,
"Revibing Code from Papers: Reimplementing HCI Artifacts".

The group follows the workshop's hackathon page (https://revibe-hci.github.io/hackathon/)
and drives the procedure themselves: they send you its prompts, one step at a
time. They grade your build on the hackathon page, against a rubric the workshop
prepared; you never see the rubric until they send you their grades. This file
is the background you need to carry out the prompts in this repository. Codex
reads this file. Claude Code reads `CLAUDE.md`, which points here.

- Carry out each prompt as written. Do not add requirements of your own to it.
- Do not run the procedure for the group. Finish the step the prompt asks for,
  say briefly what you did, and stop. Do not start the next step until the
  group sends its prompt.
- If the group asks what comes next, tell them which step of the hackathon page is next
  and which prompt it uses, but do not carry it out.

## What is in this repository

    papers/<paper>/paper/          the paper, one Markdown file per section, in reading order
    papers/<paper>/paper/figures/  its figures
    papers/<paper>/README.md       citation, license, how the paper was converted
    papers/videodiff/materials/    videos with transcripts, and a B-roll library, for VideoDiff
    prompts/                       the procedure's prompts, word for word (the hackathon page has them too)
    llm-bridge/                    lets the rebuilt system call an LLM without an API key
    revibes/<paper>/               each revibe's work

The papers: misty (Misty), videodiff (VideoDiff), selenite (Selenite),
talebrush (TaleBrush). Match what the group says to one of these folders.

Labels such as "Figure description (from the authors)" and "[Footnote: ...]"
in the paper files are part of the paper.

## The steps, for reference

| Step | What happens | Who | Prompt |
|---|---|---|---|
| 1 | Build the system from the paper | you | `prompts/2_build.md` |
| 2 | Fix errors until it launches | the group reports, you fix | `prompts/3_debug.md`, or their own words |
| 3 | Add missing features; the result is version 1 | you | `prompts/4_complete.md`, or features the group names |
| 4 | Grade version 1 | the group, on the hackathon page | |
| 5 | Fix what the grades report; version 2 | you | the graded rubric, pasted from the hackathon page |
| 6 | Grade version 2 | the group, on the hackathon page | |

The procedure ends at step 6. A group may keep going by repeating steps 5 and
6 (version 3 from the version 2 grades, and so on); treat each round like step
5. Do not suggest it: the group decides. Grading is the group's: do not grade
from the code, do not suggest grades, and do not go looking for the rubric.

## When the group names their paper

The group's first prompt starts with "We are revibing <paper>." That line is
the workshop's, not part of the paper's prompt. Find the paper folder, create
`revibes/<paper>/` with `app/`, `grades/` and `changes/`, then carry out the
rest of the prompt. If the message has nothing more, wait for a prompt: do not
read the paper or start building before one arrives.

## Reading the prompts in this repository

The prompts were written for the paper's own setup. Here they mean:

- "The 'paper' directory", or "the contents of the paper and any images": the
  files in `papers/<paper>/paper/`. Read only those, not the paper's cover
  sheet, and do not search for or use the authors' code, videos or demos.
  Some papers link them: do not open those links.
- `papers/<paper>/materials/`: material the system needs that would take too
  long to get during the workshop. Only VideoDiff has any: videos with
  transcripts, and a B-roll library in `broll/` with an `index.json` to search
  by keyword in place of a stock media service. It is not part of the paper,
  but you may use it; see `materials/README.md`.
- `[SystemName]`: the system's name.
- The build: put it in `revibes/<paper>/app/`, with `README.md` and
  `DEVELOPER.md` there.
- API keys and the `.env` file: the group has no API keys. If the system calls
  a language model, use the LLM bridge on your own backend (see below) instead,
  and say so in the README.
- Questions: allowed, as the prompt says, with alternative choices. Suggest the
  option you would take.
- The debug prompt: fix what the group reports, and only what stops the system
  from running.
- The aided prompt: in steps 5 and later, the group pastes its graded rubric,
  copied from the hackathon page. It starts with a line asking you to fix what
  they graded, then "# Graded rubric:". Treat it as the aided prompt. Before
  fixing anything, save the rubric part unchanged as
  `revibes/<paper>/grades/vN.md`, where N is the version it grades. Then fix
  the tests graded partial or failure, using the group's notes ("What we saw").

## What you note down

- If the group gives extra instructions during steps 1 to 3, beyond pasting
  errors, follow them, and note each one in `changes/v1.md` under
  "Instructions from the group".
- When something in the paper cannot be rebuilt (a model or library that no
  longer exists, hardware, a dataset), substitute the closest available
  option, label it in the interface, and note it in `changes/vN.md`.
- Number the versions by prompt: the feature-check prompt gives v1, the first
  aided prompt v2, and any further aided prompt v3, v4, and so on.

## Finishing a version (after the feature-check and aided prompts)

1. Write `changes/vN.md`, for people: the group uses it at their table. Use
   the paper's names for features, panels and interactions, not your component
   names, and keep it to a screen or so:

        Built by <agent and model> from the paper.
        <Two or three sentences: what works and what does not yet.>

        ## Built            (v2 and later: ## Changed, with the test IDs each item addresses)
        ## Instructions from the group   (only if they gave any)
        ## Assumptions      (where the paper was unclear and what you chose)
        ## Substitutions    (models, libraries, data you replaced, and why)
        ## Still missing    (features from the paper that are not there)

2. Commit: `git add revibes/<paper> && git commit -m "<paper> vN"`.
3. Tell the group, in two or three sentences, what changed and that they can
   grade it.

## When the system needs an LLM

Many of these systems call a language model. Use the bridge in `llm-bridge/`.
It sends each model call through a coding agent the group is signed in to, so
no API key is needed.

- The rebuilt system's model calls go through **the same agent you are**: Codex
  if you are Codex, Claude Code if you are Claude Code. That way they use the
  plan the group chose to work with, even when both agents are installed.
  Always start the bridge with the backend named, from the repository root:
  `python3 llm-bridge/bridge.py codex` (or `... claude`). Put that exact
  command in `app/README.md`.
- Before relying on it, check `http://localhost:8787/health`: it reports the
  backend. If a bridge is already running with the other backend, ask the group
  to stop it and start it with yours. If port 8787 belongs to another revibe,
  give the bridge another port, such as `python3 llm-bridge/bridge.py codex 8788`,
  and point the system at it. Pick a free port for the system itself too.
- It listens on `http://localhost:8787` and needs only Python 3.
- It accepts the OpenAI Chat Completions format at `/v1/chat/completions` and
  the Anthropic Messages format at `/v1/messages`. Either official SDK works with
  its base URL set to the bridge (`http://localhost:8787/v1` for OpenAI,
  `http://localhost:8787` for Anthropic) and any string as the API key. Plain
  `fetch` from the browser also works.
- It supports system prompts, earlier turns, images and JSON output
  (`response_format`). It does not support tool or function calling, and it
  ignores temperature, token limits and the model name. If the paper relies on
  those, ask for JSON instead and note the substitution.
- Each call takes a few seconds and uses the group's own plan or credits.
  Ask before sending many calls at once or looping over a large batch.
- The bridge answers with a small, fast model (Haiku for Claude Code; Codex's
  fast model), so the system stays responsive and uses little of the group's
  plan. If the paper names a model (for example GPT-4), note that the bridge's
  model answers instead. Only if a feature clearly fails because the model is
  too weak, restart the bridge with a larger one (`BRIDGE_MODEL=sonnet`, or a
  model name from Codex) and note that as a substitution too.
- If neither `claude` nor `codex` works on the group's laptop, build a clearly
  labelled stub that returns canned responses and note it.

Details and examples: `llm-bridge/README.md`.

## Sharing the revibe

When the group is done, they push their work to the workshop repository as a
branch named after the paper, their table and their group; the hackathon page gives
them the exact name, e.g., `revibe/misty-table3-a`:

    git push origin HEAD:revibe/<paper>-<table and group>

If they ask you to do it, ask for the name the hackathon page shows them, commit
anything left first, and push with that command. Never push `main`.

## Remixing

After the revibe, the table picks one revibe and remixes it together on one
branch per table, `remix/<paper>-table<N>`: they change the system on purpose
to test an idea the paper did not. Several people may push to that branch, so
keep each change focused on the part the group says it owns. Record each
change in `revibes/<paper>/remixes.md`: what changed and what question it
explores. The hackathon page gives the group the git commands; if they ask you
to push, run `git pull --rebase origin remix/<paper>-table<N>` first, then
`git push origin remix/<paper>-table<N>`.

## Always

- Never print, log or commit an API key or token.
- Do not change `llm-bridge/`. It is shared by every group. If something there
  seems wrong, tell the group instead.
- Ask before a large refactor or before installing a heavy dependency.
- Say when you are guessing. A guess the group knows about is better than a
  hidden one.
