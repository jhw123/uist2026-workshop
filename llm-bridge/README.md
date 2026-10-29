# LLM bridge

Many systems in these papers call a language model. At the workshop there are
no API keys, so the bridge lets the system you rebuild call a model through
the coding agent you are already signed in to: Claude Code or Codex. Model
calls then count against that agent's plan or credits.

## Start it

    python3 llm-bridge/bridge.py codex     # if you work in Codex
    python3 llm-bridge/bridge.py claude    # if you work in Claude Code

It prints the address (`http://localhost:8787`) and which agent it uses.
Leave it running in its own terminal while you use the system. Check it with
`http://localhost:8787/health` in a browser.

It needs Python 3 and the `claude` or `codex` command, signed in. Name the
agent you are working with, so the system's calls use the same plan. Without a
name it picks `claude` when both are installed.

## Call it

The bridge speaks the OpenAI and Anthropic formats, so code written for either
works by changing the base URL. Any string works as the API key.

```js
// Browser or Node, no SDK
const r = await fetch("http://localhost:8787/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Suggest three titles for a story about a lighthouse." },
    ],
  }),
});
const text = (await r.json()).choices[0].message.content;
```

```python
# OpenAI SDK
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8787/v1", api_key="bridge")
reply = client.chat.completions.create(model="gpt-4o", messages=[{"role": "user", "content": "Hi"}])

# Anthropic SDK
from anthropic import Anthropic
client = Anthropic(base_url="http://localhost:8787", api_key="bridge")
reply = client.messages.create(model="claude", max_tokens=500, messages=[{"role": "user", "content": "Hi"}])
```

## What works

- System prompts, earlier turns of a conversation, and images (OpenAI
  `image_url` with a data URL or a web URL; Anthropic `image` blocks).
- JSON output: OpenAI `response_format` of `json_object` or `json_schema`. The
  bridge asks for JSON only and strips code fences.
- `stream: true`: the whole answer arrives as one chunk.

## What does not

- Tool or function calling: tool definitions are ignored and the model answers
  in text. Ask for JSON instead.
- Temperature, token limits and the requested model name are ignored. The
  bridge picks the model (see Settings).
- Speed: each call starts the agent's command-line tool, so it takes a few
  seconds (about 2 to 4 with either agent in our tests). At most 4
  calls run at once; more wait their turn.
- Embeddings and image generation are not available.

## Settings

Set these as environment variables before starting, for example
`BRIDGE_BACKEND=codex python3 llm-bridge/bridge.py`.

| Variable | Default | Meaning |
|---|---|---|
| `BRIDGE_BACKEND` | `claude` if installed, else `codex` | which agent answers; the first argument (`codex` or `claude`) does the same |
| `BRIDGE_MODEL` | `haiku` for Claude Code; for Codex, the newest model its model list describes as fast | model passed to the agent; set it to use a larger one |
| `BRIDGE_EFFORT` | `low` | Codex reasoning effort |
| `BRIDGE_PORT` | `8787` | port; the second argument does the same (`bridge.py codex 8788`) |
| `BRIDGE_PARALLEL` | `4` | calls allowed at once |
| `BRIDGE_TIMEOUT` | `300` | seconds before a call is given up |
| `BRIDGE_CACHE` | off | `1` reuses answers to identical requests, kept in `.bridge-cache/` |

## How it works

For each request the bridge asks the agent once, in an empty temporary folder,
and returns its final answer in the format the caller used.

- Claude Code: one `claude -p` call with all tools turned off.
- Codex: a fresh, temporary conversation on one long-running `codex
  app-server`, with a read-only sandbox and an instruction to answer without
  using tools. Keeping the server running skips Codex's few seconds of startup
  on every call. The app server is marked experimental by Codex, so if it is
  missing or fails, the bridge says so once and uses `codex exec` instead.
