# TaleBrush

A local reconstruction of **TaleBrush: Sketching Stories with Generative Pretrained Language Models** (Chung et al., CHI 2022), built from the workshop's paper text and figures. Workshop identity: table 1, group 2.

## Launch

Requires Python 3.9+ and a signed-in `codex` CLI. Node 18+ is needed only for the JavaScript tests. No pip/npm installation and no API key are needed.

From the **workshop repository root**, start the shared bridge in one terminal:

```sh
python3 llm-bridge/bridge.py codex
```

In a second terminal, also starting at the repository root:

```sh
cd revibes/talebrush/app
python3 server.py
```

Open **http://localhost:5173**. Stop each process with Ctrl+C. The app binds only to localhost. Check http://localhost:8787/health; `backend` must be `codex`. The app's connection indicator means the bridge process is reachable, not that the account has permission to use its selected model.

If the app port is in use, run `python3 server.py --port 5174`. If another group owns the bridge port, use `python3 llm-bridge/bridge.py codex 8788` and start the app with `TALEBRUSH_BRIDGE_URL=http://localhost:8788 python3 server.py`.

### Working command on this laptop

The shell's older Codex CLI (0.133.0) returned `model_not_found` even for the configured model. The desktop app bundles a newer CLI (0.166.0-alpha.5.1). Using that binary through the bridge's process-local PATH fixed the failure. From the repository root, use this command for the bridge on this Mac:

```sh
PATH="/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin:$PATH" BRIDGE_MODEL=gpt-6.1-sol python3 llm-bridge/bridge.py codex
```

This uses the existing sign-in, does not modify your shell settings or the shared bridge, and requires no installation. Live recognition and a four-sentence sketch-to-story generation succeeded with this command. For other computers, the standard command above works when `codex` resolves a current, compatible CLI and the selected model is available to that account.

If model access fails, check which CLI `command -v codex` resolves, choose a model your signed-in account supports, and restart the bridge with its documented `BRIDGE_MODEL` setting. Check the bridge terminal for the underlying error. If no model is available, the workshop instructions say to ask an organizer for Codex access/credits. The app preserves your draft when a request fails and never silently invents a live response.

## Use

1. Name the protagonist above the graph. Edit the title and opening sentences on the left. Each row is one sentence slot.
2. Draw on the fortune canvas across blank slots. Higher means better fortune; left to right follows sentence order. Releasing a stroke generates only the touched range. Slow drawing creates a narrower green envelope and considers three candidates rather than two.
3. Generated text and independently recognized fortune points are blue. Author-written sentences are gray. Hover over a row or graph position to link them. Blank rows break the arc. **Analyze fortune** recognizes existing text; direct edits also schedule recognition after a pause.
4. Redraw over AI sentences to replace that range, or click **Generate Again** for another version with the last range and controls. Author text is protected as context; clear a row to make it replaceable.
5. To **infill**, write an ending after several blank rows and sketch across those rows. The model receives both sides of the gap as fixed context.
6. Use **Erase** to remove fortune constraints; then **Generate Again** explores that range without a fortune target.
7. Enable **Make room for surprise** and sketch the desired surprise on the separate graph. Higher means more unexpected; changes apply at the next generation.
8. **History** overlays past arcs. Hover or keyboard-focus an entry to preview text and arc, then select it to restore the complete draft. Undo restores local actions. Browser storage retains up to 50 history entries. **Export story** saves a plain-text copy.

Enter inserts a row at the cursor, Backspace removes an empty row, and Shift+Enter makes a line break inside a row. Multiline paste creates multiple rows. The canvas supports up to 30 rows; a generation can change up to 24 rows at once. Keyboard shortcuts outside text inputs: P for Draw, E for Erase. Focus a graph point and press Enter to focus its sentence.

## Substitutions and limits

The original soft-prompt-tuned GPT-Neo 2.7B and modified GeDi/GPT2-medium are replaced with two prompt-based Codex bridge requests: candidate generation, then independent fortune recognition without the target values. Candidate generation is batched, rather than sequentially regenerating/alternating infill directions. A first candidate within 0.2 of its target is kept; otherwise the closest allowed candidate is chosen. Recognition context uses the first candidate at earlier generated slots, so choosing another candidate can alter that context. Surprise is an instruction, because bridge temperature settings are ignored. Pointer-speed calibration and envelope sizes are reconstruction choices. The UI labels these substitutions; model quality and the paper's experimental results are not reproduced.

This is the workshop's initial build step. The separate feature-check prompt, human grading, later revisions and sharing have not been run. See [DEVELOPER.md](DEVELOPER.md) for architecture and checks.
