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

## Operator Mac route-plan acceptance — 2026-10-26 23:36

The operator cleanly fast-forwarded local main from `63b7b2b` to `a51f4b7`. Running `scripts/local-model-plan.mjs --task` sequentially for all four explicit categories returned `status="ready_for_separate_operator_run"`, `reason="fixed_task_route_verified"`, `execution="none"` for each: daily → `ollama/gemma4:26b-a4b`, architecture → `ollama/gemma4:31b-mlx`, coding → `ollama/qwen3.6:27b-coding`, planning → `ollama/nemotron-3-nano:30b-mlx`. **All four real-Mac read-only route decisions passed.**

This is model selection and local-catalog validation, **not** four fresh inferences or the presence of an active automatic executor. The report's `tools="deny-all"` describes the proposed isolated *analysis* execution; it is not a mandate to disable Mac development tools. User explicitly confirmed that the local primary AI should retain working Mac command execution. The real main Gateway `exec` tool already succeeded separately; preserve existing main permissions and existing two development-advisor policies.

The next source candidate is an operator-triggered, standalone Phase-2 `local-model-run` that distinguishes `analysis` and explicitly selected tool-enabled `work` runs. Treat it as staged until real Mac test passes. Do not wire it into the ChatGPT watcher, install a service, or modify existing Agent policies as part of this route-plan milestone.

## 2026-10-27 test-gate hardening (Mac pending)

Previous Mac full suite: 413/415 tests, with two nested `project-tests` fixtures recording `tests:null` even though the nested child status was passed. A separate standalone default/TAP reporter probe correctly parsed 1/1, so root cause is not proven from existing evidence. Nested project-tests and the guarded self-updater now explicitly request Node's stable TAP format. More importantly, the Watcher refuses to mark an exit-zero nested run `passed` unless a valid nonzero `tests` count, equal `pass` count and zero `fail` count are parsed. No raw assertion output is exposed. This narrows the false-pass gap; Mac full-suite confirmation is required before declaring the two failed tests resolved. No Gateway, Agent, approval, Ollama or browser state is changed.

## 2026-10-27 Mac acceptance: full suite fixed; Qwen work timeout isolated

Operator Mac evidence after fast-forward to `89fa585`:

- TAP-focused tests: **15 / 15 passed**. Full `node --test` suite: **417 / 417 passed**, zero failures; total duration ~31.7s. The earlier nested `tests:null` issue no longer reproduces with the pinned TAP child reporter and strict summary checks. Full test log is private to operator at `/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/verification/full-test-20261027.log`; do not commit it or its contents.
- Standalone Phase-2 v3 diagnostics candidate: **26 / 26 targeted tests passed** on the Mac, but is **not merged** into this repository; its actual Qwen `coding work` run was **not accepted**.
- Qwen v3 runtime: `modelMatched=true`; `toolCalls=1`, `toolsObserved=["exec"]`; `toolFailures=0`; `final=""`; `agentStatus="timeout"`, `errorKind="timeout"`, `errorClass="timeout"`, `execExitCode=2`, `execTimedOut=false`, `stderrPresent=true`. `TARGET_RELEASE: confirmed`, `RESIDENT_AFTER: empty`, `RUN_LOCK: released`. Gateway health remained normal.
- Root cause remains **undetermined**: OpenClaw `agent exec` itself returned timeout after one successful tool call. Current candidate gives OpenClaw `--timeout 330` (seconds) and an outer 360-second process deadline, so raising the outer timeout alone will not fix the internal deadline. One successful tool call with zero recorded tool failures does not prove a final model turn succeeded.
- Next research-only diagnostic (separate ZIP, not installed in repository) is a minimal **native Ollama two-turn simulated function** probe at `127.0.0.1:11435`: first ask the model to invoke a declared synthetic tool, then provide a fixed `27.0.1` result and check for a final reply. This probe never executes a Mac command or alters Gateway/Agent policies; it records only bounded timing/token counts and boolean outcome. **Mac result pending**. A native Ollama pass would narrow troubleshooting toward OpenClaw prompting/tool-result handling or longer context; a native failure would point earlier at model/tool-call conversation processing. Neither outcome alone proves the entire root cause.
- User explicitly wants working local AI terminal execution for development. Do **not** disable existing `main` exec permissions, widen the isolated developer advisors by accident, or repeatedly trigger 330-second failing runs without new evidence.

## 2026-10-27 native Qwen tool-return smoke and App capability discrepancy

Operator's real Mac `ioant_qwen_tool_roundtrip_probe.py`:
- Python mock/unit tests: **10/10 passed**.
- Ollama `127.0.0.1:11435`, `qwen3.6:27b-coding`, native `/api/chat` with a declared **synthetic** tool: first turn **27.81 s**, `tool_call_count=1`, `done=true`, `done_reason=stop`, `eval_count=18`; reported model load **14.917 s**.
- Fixed fake tool result `27.0.1` was sent back in a correctly paired tool message. Second turn **2.31 s**, `tool_call_count=0`, `content_chars=15`, `done=true`, `done_reason=stop`, `eval_count=9`. `TOOL_ROUNDTRIP: PASS`.
- `MODEL_RELEASE: confirmed`, `OLLAMA_RESIDENT: empty`. The running Gateway was healthy. No host command was executed by this synthetic probe.
- This confirms the basic native Ollama model/tool-message two-turn path. The independent OpenClaw `agent exec` coding-work candidate still returned `agentStatus=timeout` and `execExitCode=2` after a tool call, and has **not** passed. Focus next on OpenClaw run-specific tool-result handling, prompt/tool-schema size, inference duration, or execution context, instead of reinstalling Qwen.

The operator also displayed a **Control UI/App assistant reply** claiming it can use the OpenClaw workspace but cannot execute terminal commands on the Mac host. That assistant self-description is **not execution evidence** and conflicts with the independently validated Gateway-backed `main` one-shot run, which had `toolSummary={calls:1,tools:["exec"],failures:0}`, `sandbox.mode=off`, and returned the real `sw_vers -productVersion` output. However, that CLI success was in a separate explicit `main` session; this does not prove the App's selected session has identical effective tools. Verify the **exact App session** with a harmless real `exec` call and inspect its tool activity and session key; do not modify global exec permissions based on the model's claim. Also distinguish read-only **Side chat** from the active Agent Chat. If the App run has working tools but its prose still claims "cloud-only", inspect the configured main workspace `AGENTS.md`, `SOUL.md`, `IDENTITY.md` and that session's prior conversation for stale host identity instructions, without overwriting user content.

## 2026-10-27 Control UI Mac terminal execution is confirmed

The operator's Control UI screenshot showed a **completed actual tool call** `/bin/date -u +%Y-%m-%dT%H:%M:%SZ`, returning `2026-10-26T17:24:05Z`. The UI displayed the completed command (one command plus another unclassified operation), and the full turn took ~82 seconds. The other operation displayed `Outcome unknown`; do not count that as an observed success. Combined with the earlier Gateway-backed `main` CLI execution of `/usr/bin/sw_vers -productVersion`, **Mac terminal execution has been verified through both surfaces**. Prior assistant claims that this host must be a cloud container or cannot access the Mac are false for these verified turns. This does not validate every future session, browser control, or arbitrary terminal workflow.

A separate source/test candidate (2026-10-27, **not merged / not deployed**) was produced for two opt-in actions: (1) inspect then append a bounded host-capability note to the current `main` workspace `AGENTS.md`, only after making a private backup and without modifying permissions, and (2) one Qwen `agent exec` differential probe with **only the `exec` tool**, `--code-mode direct`, `--local-model-lean`, 120-second internal timeout and 145-second outer bound. Fourteen isolated Node tests passed in a Node 22 container. No real Mac run has yet validated either action. The Qwen probe does not automatically retry, enable auto-routing or modify the Gateway. A failure or successful short probe alone is not proof of the original 330-second failure's root cause.

Performance still requires measurements: the latest App action lasted ~82s; the earlier Gateway-backed `main` CLI smoke lasted ~56s. These are whole-turn durations, not measurements of the `date`/`sw_vers` subprocess. Avoid attributing the entire delay to a single component until loading, prefill, decoding and tool stages are separated.
