# Revibing HCI, UIST 2026

Materials for the Revibing HCI workshop (UIST 2026, Detroit, 2 November). In
the workshop you **revibe** a research paper: a coding agent rebuilds the
interactive system the paper describes from the paper alone, and you measure
how much of it works. The procedure comes from Adar et al., "Revibing Code
from Papers: Reimplementing HCI Artifacts".

## What you need

- A laptop with a coding agent installed and signed in: Claude Code (`claude`)
  or Codex (`codex`).
- Python 3 and git. Node.js helps, since many rebuilt systems are web apps.

You do not need an API key. When the rebuilt system calls a language model,
it goes through your signed-in agent (see `llm-bridge/`).

## Start

Follow the workshop's hackathon page: **https://revibe-hci.github.io/hackathon/**. It walks
you through the procedure step by step and has every prompt to copy.

In short:

    git clone https://github.com/revibe-hci/uist2026-workshop.git
    cd uist2026-workshop
    claude        # or: codex

Send the agent the procedure's prompts from the hackathon page, one step at a time.
The first starts with the paper's name ("We are revibing Misty."). You grade
each version on the hackathon page, against a rubric the workshop prepared for
your paper, and paste your grades back to the agent for the next version.

The agent reads `AGENTS.md`, which tells it where the paper is, how to call a
language model without an API key, and what to note down. It does not run
the procedure for you: you drive each step. After each version it writes a
short note on what it built in `revibes/<paper>/changes/`.

## The papers

| Folder | System | Venue |
|---|---|---|
| misty | Misty: UI prototyping through interactive conceptual blending | CHI 2025 |
| videodiff | VideoDiff: human-AI video co-creation with alternatives | CHI 2025 |
| selenite | Selenite: comprehensive overviews for online sensemaking | CHI 2024 |
| talebrush | TaleBrush: sketching stories with language models | CHI 2022 |

Full citations and licenses are in `papers/README.md` and each paper's
`README.md`. The papers' text and figures belong to their authors.

## What is here

    AGENTS.md            background for the coding agent (CLAUDE.md points to it)
    papers/<paper>/      each paper, converted for the agent
    prompts/             the procedure's five prompts, word for word
    llm-bridge/          lets the rebuilt system call an LLM through your agent
    revibes/             your revibes, created by the agent
