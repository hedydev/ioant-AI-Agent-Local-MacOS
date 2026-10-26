# Local Ollama multimodel acceptance — operator evidence (2026-10-26)

> Scope: exact Mac observations supplied by the operator. This document records acceptance evidence, **not** a claim that the source repository has deployed routing or that this conversation directly accessed the Mac. No secrets or private configuration snapshots are included.

## Environment witnessed

- Mac: M1 Pro, 32 GB unified memory.
- OpenClaw 2026.10.7; CLI `~/.openclaw/bin/openclaw`; Gateway loopback `127.0.0.1:18789`.
- Ollama 0.40.5 at `127.0.0.1:11435`; model storage under `/Volumes/LunaDrive/AI/Models/ollama-mc`.
- Main, alice-ai, openclaw-dev Agent defaults remain `ollama/gemma4:26b-a4b`. The two development advisors retain `tools.profile=minimal`, `tools.deny=["*"]` and their existing restrictive model policy. No Agent or Gateway restart is requested or evidenced as part of acceptance.
- Independent MLX Whisper Large V3 Turbo and Kokoro 82M had previously passed a local speech smoke, but strict offline execution was not yet validated.

## Three new models: registration and inference

| Ollama model id | Show metadata | Provider config | Gateway catalog | Native Ollama chat |
| --- | --- | --- | --- | --- |
| `qwen3.6:27b-coding` | ctx 262144, vision/tools/thinking claimed | PASS | PASS | PASS |
| `gemma4:31b-mlx` | ctx 262144, vision/tools/thinking claimed | PASS | PASS | PASS |
| `nemotron-3-nano:30b-mlx` | ctx 262144, tools/thinking claimed; no vision | PASS | PASS | PASS |

Operator ran `preflight`, one backed-up `config.patch`, and `verify`. The only changed config path reported was `models.providers.ollama.models`; existing model IDs `gemma4:26b-a4b` and `gpt-oss:20b` remained present. `config.get` readback and validation passed; Gateway PID was unchanged at 1319 at patch acceptance. New model entries use active context 16384; the Ollama model metadata advertises a 262144 maximum, which is not the configured active context.

The original Qwen smoke allowed 32 output tokens and did not disable thinking. It failed the script's requirement for non-empty final `content`. The revised minimal nonthinking smoke used `think=false`, `num_predict=256`, sequential execution, and `keep_alive=0`; all three returned `OK`, `done=true`, `done_reason=stop`, `eval_count=1`, with no thinking text. After each test, Ollama `/api/ps` showed no resident models. This proves **minimal direct Ollama inference**, not coding/vision/tool-call correctness.

## OpenClaw Agent paths: distinct outcomes

1. A Gateway-backed `openclaw agent --agent openclaw-dev --model ollama/qwen3.6:27b-coding` was **rejected before inference** by `agents.entries.*.modelPolicy.allow`. The unchanged security policy is correctly restrictive. Do **not** fix this by adding `ollama/*` or widening `openclaw-dev` / `alice-ai` policies; existing repository `stage2/development-agent-route.mjs` verifies exact Agent security fields.
2. The separately downloaded isolated `agent exec` smoke used a temporary model-only config, exact Qwen model allowlist, minimal / deny-all tools, `--code-mode direct`, no delivery, and no persistent Agent modification. The operator's five unit tests passed, and the real `agent exec` result was `RESULT: PASS`, `MODEL_ID_MATCH: True`, `PROVIDER_MATCH: True`, `REPLY_MATCH: True`, `CLI_EXIT: 0`. The tool-call-count field was **not reported**; never describe this as an observed zero-tool-call count. `TARGET_UNLOAD: CONFIRMED`, `RESIDENT_AFTER: EMPTY`.
3. Post-run `openclaw health` reported normal Gateway event loop with 42 ms check duration. This does **not** prove Gateway-backed model override, which remains rejected as designed.

## Next controlled routing milestone — not yet implemented

- Keep `main`, `alice-ai`, `openclaw-dev`, the Watcher, and current policies unchanged. Do not add a new persistent Gateway Agent or expand Stage-2 allowlisted tasks without separate security review.
- Establish an independent model router boundary. Candidate operator-declared task categories: daily Q&A → Gemma 4 26B; architecture/deep reasoning → Gemma 4 31B; code → Qwen3.6 Coding; planning → Nemotron 3 Nano. These are **proposed roles**, not measured rankings.
- First milestone should be a read-only route decision (model ref, reason, context budget, permission profile), with deterministic tests and no execution. Next add opt-in one-shot isolated no-tools `agent exec` execution with explicit prompt source, real result provenance, serialized local runs, resource-release checks, and bounded private diagnostics. A local lock cannot guarantee no model is loaded concurrently by other Gateway/Ollama clients; never claim global memory isolation.
- Do not infer a running Gateway automatically authorizes any Agent model override. Test the Gateway path separately after explicit model-policy design and approval.
- Whisper/Kokoro should be integrated as independent bounded local speech tools only after testing with network access disabled and confirming no runtime dependency downloads.
- Do not repeat Ollama downloads or the suspended comparative model benchmarks. Native smoke has already passed all three models. Separate isolated Agent smoke for Gemma 4 31B / Nemotron is optional adapter evidence only, not a prerequisite for recording existing direct-inference success.
- Follow repo Git safety: pre-change exact main HEAD, no reset/clean/stash/switch/merge, scoped atomic commits with AI trailers; run Mac acceptance before declaring local deployment.

## Validation boundary

All observations in this note are operator-supplied terminal logs, not assistant-executed tests on the Mac. This documentation commit neither modifies any Mac file nor deploys the routing runtime.