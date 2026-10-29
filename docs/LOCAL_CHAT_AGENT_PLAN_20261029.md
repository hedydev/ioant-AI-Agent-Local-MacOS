# Independent local chat Agent — installed configuration and evidence

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

## Applied configuration

The pre-configuration checkpoint was pushed first as `4cacf91`, with remote SHA
verified. A new Agent is installed: **本地聊天** (`local-chat`), using
`ollama/gpt-oss:20b`, embedded runtime, default `low` thinking, no fallback and
an allowlist initially containing only this local model. The later Qwen
supplement below adds one explicit local alternative. Its independent workspace is
`/Volumes/LunaDrive/DeveloperCache/openclaw-agents/local-chat`.

Action tools, skills, delegation, heartbeat and cross-conversation memory search
are disabled. Sessions retain their own conversation context. Fast mode is
disabled: no claim that it accelerates local hardware. Short Chinese workspace
instructions define a conversational role, separate from project execution.
The helper validated the native schema, saved private prewrite backups and
verified exact disk/live configuration. Existing Agent entries were unchanged.
No Gateway restart, Worker update or model download was performed.

An explicit high-effort request initially failed before inference because the
installed GPT-OSS catalog record omitted reasoning support. The reviewed
`--enable-thinking` helper added only `reasoning:true` and supported efforts
`low/medium/high` to that existing model record. This is shared model capability
metadata, not a change to other models, Agent selections, provider URLs,
credentials or permissions. A second private backup and whole-config disk
comparison confirmed this exact change.

## Measurements and verification

Serial native local API probes on this Mac:

| Case | First visible answer | Total | Result |
| --- | --- | --- | --- |
| Gemma 26B greeting, thinking off | 11.22 s | 11.67 s | Natural Chinese |
| Gemma 26B reasoning, thinking on | No final answer | 11.36 s | Hit deliberately small 384-token limit |
| GPT-OSS greeting, thinking low | 8.70 s | 9.12 s | Natural Chinese |
| GPT-OSS reasoning, thinking low | 4.06 s | 9.20 s | Correct: 10.5 days |
| Qwen 27B greeting, thinking off | 18.64 s | 20.27 s | Natural Chinese |
| Qwen 27B reasoning, thinking on | 26.99 s | 35.80 s | Correct: 10.5 days |

These four bounded probes are not a general ranking. Gemma's capped probe does
not prove inability to solve the problem. GPT-OSS generated about 32 tokens/s.
Actual Gateway multi-turn chat took 23.82 s initially and 6.92 s next, retained
the test conversation code, and solved the work-rate problem. Those turns
preceded the metadata correction and do not verify a specific thinking level.
After correction, explicit `--thinking high` succeeded with the correct answer
391 for 17×23, taking 36.12 s. A separate explicit `--thinking low` greeting
then succeeded in 15.96 s. These check accepted efforts and local inference,
not a benchmark of difficult reasoning. Cold loading and thinking length matter.

The prompt report lists generic lazy tool-discovery wrappers; the Agent's
deny-all action policy remains configured. No computer/file/shell actions were
requested in these chat tests. Full native regression: **1215/1215 passed**.
Shell syntax and whitespace checks also pass.

## Use

In OpenClaw Chat select **本地聊天** (`local-chat`) and start a new conversation.
Send `/think high` by itself for harder questions; send `/think low` by itself
to return to everyday mode. Higher effort may take longer. The local model is
not equivalent to hosted ChatGPT quality. It is currently text-only, with no
browsing/computer actions or tool-based cross-chat memory.

Inference uses neither paid model APIs nor Codex inference. Normal ChatGPT web
use remains subject to that account's own plan limits. Thinking reference:
https://docs.openclaw.ai/tools/thinking

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
# Read-only inventory; the Agent is already configured:
"$HOME/.openclaw/bin/openclaw" agents list --json
# Optional real local-model chat:
"$HOME/.openclaw/bin/openclaw" agent --agent local-chat --thinking low --message '你好' --json
```

`scripts/configure-local-chat-agent.mjs --dry-run|--apply` is a fixed one-time
provisioner that refuses to overwrite an existing Agent. `--enable-thinking`
only corrects the verified chat policy's GPT-OSS capability metadata. Inspect
state after uncertain results rather than replay provisioning. Optional serial
model probes require explicit `scripts/chat-model-probe.py --run`. Private
reports, transcripts, config files and backups are excluded from Git.

## Qwen supplement (operator request, 2026-10-29)

The explicit `--run --qwen` probe uses the same two prompts, system instruction,
8192 context and 128/384 output limits as the original probes. Qwen answered
both, generating 7.39/7.75 tokens/s. GPT-OSS had about 32 tokens/s in the earlier
same-protocol sample. These are sequential samples taken at different times,
not a controlled general ranking; GPT-OSS low effort and Qwen boolean thinking
are different backend controls. This evidence favors retaining GPT-OSS for
responsive everyday conversation on this Mac, while keeping Qwen available.

`--enable-qwen` validated and backed up the private configuration, added only
`ollama/qwen3.8:27b-mlx` to `local-chat`'s model-policy allowlist, and updated its
private role's fixed GPT-OSS self-description to a model-neutral local role.
Exact config comparison preserved the default GPT-OSS selection and all action
permissions/other Agents. In a new 本地聊天 conversation, select
**qwen3.8:27b-mlx** in the model picker to use it; model changes stay session
scoped with the existing OpenClaw default scope. Do not mix these two large
models concurrently for this comparison.

Actual OpenClaw Gateway acceptance also passed with the explicit Qwen model
and `--thinking high`: provider `ollama`, model `qwen3.8:27b-mlx`, correct
`17 × 23 = 391`, total CLI wall time **123.47 seconds**. This verifies the
selected local route and accepted High setting, not that Qwen offers the same
graded effort semantics as GPT-OSS or that the delay was all reasoning. The
Gateway system prompt/loading differs from the short direct API probes. No
claim of fast deep thinking is supported by this sample; the default remains
GPT-OSS. Native regression after adding the option: **1216/1216 passed**; shell
syntax and whitespace checks passed. Disk and all four live config layers
confirmed the two-model allowlist, original default, and deny-all action policy.

The name is the installed local alias. The server advertises vision, tools and
thinking, 27.8B parameters, NVFP4, and architecture `qwen3_5`. The alias alone
does not establish the original upstream model version; weights provenance was
not independently audited here. No weights were downloaded or renamed.

Reproduce the two local API probes with:

```bash
bash scripts/dev-env.sh exec python3 scripts/chat-model-probe.py --run --qwen
```
