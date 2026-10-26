# Controlled local model routing — Phase 1 (read-only)

## Scope and evidence

The 2026-10-26 operator evidence is in [LOCAL_MODEL_ACCEPTANCE_20261026.md](LOCAL_MODEL_ACCEPTANCE_20261026.md). On the Mac, the three new models passed **native** Ollama inference; Qwen3.6 also passed a separate no-tools `agent exec` smoke. A Gateway-backed `openclaw-dev --model` test was correctly rejected by its exact model-policy allowlist. **Do not change that allowlist**, the Agent tools, or the Watcher to make model routing easier.

This first stage provides `src/local-model-routing.mjs` (fixed deterministic policy) and `scripts/local-model-plan.mjs` (read-only inventory/proposal). It does not run a model, modify configuration, create an Agent, send messages, or interact with a browser. The CLI does not classify free-form prompts and does not change the default model.

| Explicit task type | Proposed model |
| --- | --- |
| `daily` | `ollama/gemma4:26b-a4b` |
| `architecture` | `ollama/gemma4:31b-mlx` |
| `coding` | `ollama/qwen3.6:27b-coding` |
| `planning` | `ollama/nemotron-3-nano:30b-mlx` |

These are user-selected roles, **not benchmark rankings**.

## Mac operator commands

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS" || exit 1
git status --short
git fetch origin main
git pull --ff-only origin main
bash scripts/dev-env.sh check
bash scripts/dev-env.sh exec node --test
bash scripts/dev-env.sh exec node scripts/local-model-plan.mjs --task coding
bash scripts/dev-env.sh exec node scripts/local-model-plan.mjs --task architecture
bash scripts/dev-env.sh exec node scripts/local-model-plan.mjs --task planning
bash scripts/dev-env.sh exec node scripts/local-model-plan.mjs --task daily
```

Before `pull`, ensure `git status --short` is empty or independently review any uncommitted work. Never reset/clean/stash/switch/merge to get a clean tree. The current Node CLI tests were executed in a Linux container with Node 22, but the full existing repository suite and live Mac route plans remain **operator acceptance pending**.

A plan is `ready_for_separate_operator_run` only when the locally configured native Ollama provider is the exact `127.0.0.1:11435` endpoint, the selected model is uniquely registered and installed, and `/api/ps` reports no resident models. All unknown states fail closed. The output is a sanitized JSON route proposal with `execution:"none"`. A clear `/api/ps` sample is **point-in-time**, not a global lock against other Gateway/Ollama callers.

## Next stage — not deployed

Develop a separately opted-in isolated no-tools `agent exec` adapter using only validated task types, a private short-lived config, bounded stdin, serialized router-owned calls, model release evidence, and safe diagnostics. Preserve current Agent policies, Gateway PID, browser/watchers and user state. A router-owned lock cannot arbitrate unrelated Ollama/Gateway traffic; resolve external concurrency before claiming 32 GB protection. Subsequent Whisper/Kokoro adaptation requires a strict disconnected runtime smoke before promising offline voice. Do not repeat downloads or model capability benchmarks.
