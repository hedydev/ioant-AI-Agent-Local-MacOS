# Independent local chat Agent — inventory and pending configuration

Operator request, 2026-10-29: configure an independent ChatGPT-like conversational
Agent in OpenClaw, preferably capable of deeper reasoning while responding
quickly. The operator then explicitly required committing/pushing current code
and documentation **before** changing OpenClaw for this new chat Agent.

## Actual local inventory

Read from the running local model server and OpenClaw catalog, not guessed from
remote model names. OpenClaw currently reports eight available local models:

| Model | Current local advertised input / role |
| --- | --- |
| `gemma4:26b-a4b` | Text/image; tools and thinking advertised |
| `gpt-oss:20b` | Text; tools and thinking advertised |
| `qwen3.8:27b-mlx` | Text/image; tools and thinking advertised |
| `qwen3.6:27b-coding` | Text/image; coding-oriented local installation |
| `gemma4:31b-mlx` | Text/image; larger local installation |
| `nemotron-3-nano:30b-mlx` | Text; local installation |
| `granite4:3b` | Text; completion/tools advertised, no thinking capability in inspected metadata |
| `functiongemma:270m` | Small tool-oriented model, not the default general chat candidate |

The model server additionally lists `embeddinggemma:latest`, an embedding model
rather than a conversational model. The active service is local port 11435;
the conventional 11434 port was unavailable. No model download or provider
installation was performed during inventory.

## Existing measurement evidence

The private 2026-10-26 completed benchmark with corrected answer extraction had
only twelve short fixed questions per model:

- Gemma 4 26B A4B: 11/12 correct, roughly 26.9 generation tokens/s,
  average total request time 1.51 seconds for those short tasks.
- GPT-OSS 20B with low thinking: 12/12 correct, roughly 32.8 generation tokens/s,
  average total request time 3.31 seconds for those short tasks.

These are small, historical local tests, not proof of broad model superiority,
current Chinese conversation latency, time to first token, or long-chat speed.
Cold loading and reasoning length affect visible latency. Larger-model names
alone do not establish the best model for this host. The next step is a small,
bounded serial conversation check of the strongest candidates, reusing the
installed models and avoiding concurrent large-model loads.

## Proposed configuration boundaries

- Create a separate chat Agent/workspace/session history; do not repurpose
  `openclaw-dev`, `alice-ai`, `mac-computer` or the system `main` Agent.
- Use local model inference only; no paid cloud fallback or Codex runtime.
- Keep its system/context prompt short and conversational. It is a chat partner,
  not a project executor with terminal/desktop tools.
- Prefer low/balanced everyday reasoning with an explicit deep-thinking switch
  for difficult questions, after confirming the selected model's actual support.
  Do not claim OpenClaw Fast mode can make arbitrary local inference faster.
- Preserve all existing project entries, routes, Gateway settings and services.
- Use official config validation, private prewrite backup, scoped mutation and
  disk/live readback, followed by actual ordinary-chat and reasoning checks.

## Status at this checkpoint

Inventory and existing benchmark review complete. No new chat Agent has been
created, and no model/configuration changes were made for this new request.
Complete and verify the Git push first, then implement and validate this setup.
Record the final chosen model, thinking settings, actual measured latency,
user-facing usage instructions and remaining limitations in this document.
