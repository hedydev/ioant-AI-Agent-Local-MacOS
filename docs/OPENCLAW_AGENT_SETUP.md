# OpenClaw multi-agent onboarding — Mac, 2026-10-24

## Intent and current observations

The user's running OpenClaw Web Control UI at `http://127.0.0.1:18789` reported a connected Gateway (OpenClaw `2026.10.6`) with main Agent but **no configured model providers** during the last read. A fixed read-only Mac `environment-scan` (task `openclaw-model-preflight-20261024-008`) confirmed Ollama `http://127.0.0.1:11435` reachable, with `gemma4:26b-a4b`, `gpt-oss:20b`, `granite4:3b`, `functiongemma:270m` and `embeddinggemma:latest`. Default `11434` was not reachable during that observation. That **does not** prove model tool-call fidelity or Web/Gateway credential authorization.

The Stage-2 ChatGPT↔Mac worker is an independent project-owned process, **not** itself an Agent in OpenClaw Web's Agent list. It invokes the existing CLI/browser Gateway, and its opt-in self-updater has already passed a 159/159 Mac end-to-end canary. Do not change the live browser profile, Gateway lifecycle, SSH access or worker configuration as part of this read-only first stage.

## Step 1 — auto-discover (implemented; read-only)

New fixed three-field task `openclaw-config-preflight`, without caller-supplied paths, URLs, hostnames or shell arguments:
- Inspects only current user's OpenClaw configuration file type, owner and private mode; refuses symlinks and unsafe state.
- Reads at most two allowlisted local OpenClaw CLI APIs (`config get models.providers.ollama --json` and `agents list --json`) and parses the replies locally, discarding all raw config/agent text.
- Queries only local Ollama `127.0.0.1:11435/api/tags` and returns **only** preapproved model identifiers.
- Outputs `IOANT_OPENCLAW_CONFIG_PREFLIGHT` JSON with `config`, `ollama`, `installed`, `provider`, `agents`, and `next`. Never returns API keys, account names, other agent IDs, domains, cookies, SSH paths, JSON5 config bodies or chat text.
- Any missing/unsafe/unknown provider or an existing `alice-ai` must stop at `manual_review`; `eligible_for_separate_write_approval` is still **not permission to write**.

This action does not change the current updater, BDS, OS service, Gateway or authentication.

## Step 2 — controlled model provider configuration (planned, NOT implemented or authorized)

Use the official **native Ollama API** at `http://127.0.0.1:11435`, not `/v1`; ensure the provider advertises `api: "ollama"` and `baseUrl` exact. The observed OpenClaw installation is a running Gateway, so `openclaw config set` is not the correct online write primitive. Before implementing a mutating task, inspect OpenClaw's *actual* `config.schema.lookup` and `config.get` response, obtain a compatible config revision/hash, and use its supported Gateway `config.patch` RPC with optimistic concurrency; require verified pre-change private backup of the exact config file. Never print config content, credentials or raw RPC responses.

Only after a real provider and model smoke test should the user select a default model; `gemma4:26b-a4b` and `gpt-oss:20b` are **candidates**, not tool-calling acceptance. Do not override an existing provider, `main` model or user OAuth settings automatically.

## Step 3 — project Agent and shared skills (templates provided, NOT installed)

Create a dedicated `alice-ai` Agent with its **own** workspace, session storage and project knowledge, not the source repository as a writable workspace. Keep state under LunaDrive in a project-specific private directory after validating its mount and permissions. Prefer `openclaw agents add alice-ai --workspace <fixed-private-workspace> --model <verified-model> --non-interactive` using an approved fixed-argument tool; current OpenClaw docs state this can target a running Gateway. Validate with `agents list --json` before **and** after; never retry an uncertain create blindly.

Approved-source templates (not active until separately deployed):
- `templates/openclaw/alice-ai/AGENTS.md` — project identity, knowledge, restricted operations.
- `templates/openclaw/shared-skills/ioant-safe-remote-ops/SKILL.md` — SSH, Git and file-transfer safety guidance for later sharing. This **does not grant SSH/SCP/rsync tool access**.
- Future projects (NetScale, Sowhat, ChatDock, ILS) should get their own workspaces, identities, approvals and project docs; no shared auth or mutable checkout by default.

## Explicit non-goals in this stage

No automatic provider writes, no Agent creation, no Web UI clicking, no Gateway restart, no OpenClaw CLI installation/upgrade, no remote SSH, no rsync uploads, no Mint/BDS changes, no altering `~/.openclaw/openclaw.json`, no copying profiles or API credentials.

## Validation

- New pure/fixture tests must pass in `node --test`; candidate full tests must pass before `project-update-verify` fast-forward.
- Live acceptance is a separate `openclaw-config-preflight` feedback report with exact JSON and no secrets. The report alone confirms only **read-only discovery**, not successful configuration.
- The next user authorization for mutating tasks must be specific, use separately opted-in fixed operations and preserve the existing ChatGPT same-conversation feedback/receipt barrier.

## Sources

- OpenClaw docs: https://docs.openclaw.ai/providers/ollama/configuration
- OpenClaw docs: https://docs.openclaw.ai/cli/agents
- OpenClaw docs: https://docs.openclaw.ai/cli/config
- OpenClaw docs: https://docs.openclaw.ai/tools/skills

## Step 2 implementation — guarded Ollama provider write (2026-10-24)

The operator's first `openclaw-config-preflight-20261024-010` returned `config=regular_private`, `ollama=reachable`, `provider=absent`, `agents=absent`, `next=eligible_for_separate_write_approval`. This **did not modify** OpenClaw. Live watcher session `822263c5` confirmed the prior self-update reloaded.

A new **known but not ordinarily authorized** fixed task `openclaw-ollama-provision` exists. It requires the Mac foreground launcher to have been started with the **separate explicit** `--enable-openclaw-provision` flag (not included in previous launcher flags). Its only mutating scope is `models.providers.ollama`, pointed at the verified native Ollama `http://127.0.0.1:11435`; it does NOT set `main`'s default model, create agents, change tool permissions, touch Chrome, open SSH, or upgrade services.

On invocation, it rechecks OpenClaw config ownership/private mode, exact model inventory and absence of an existing provider/Agent conflict; calls `config.schema.lookup` for the exact subtree; fetches a current `config.get` hash with no existing Ollama subtree; privately backs up the original config as a new 0600 file under the validated LunaDrive project cache; then issues **one** `config.patch` with exact baseHash and `response: "summary"`. The patch adds only the native Ollama provider, `ollama-local` marker, and the **already installed** `gemma4:26b-a4b` and `gpt-oss:20b` model references. It checks the patch acknowledgment, reads back the provider with the existing read-only preflight, returns only an allowlisted `IOANT_OPENCLAW_OLLAMA_PROVISION` envelope, and stops without automatic retry if the result is ambiguous. The original config bytes, logs, credentials, hash and backup filename are never returned to ChatGPT.

### Operator opt-in and lifecycle

Updating the repository using the existing `project-update-verify` action can install the code without changing the current watcher's opt-in flags. Therefore the new `openclaw-ollama-provision` action remains **unavailable until the user explicitly stops and restarts the foreground launcher once** with `--enable-openclaw-provision`. Do not silently add that flag, reinterpret previous flag consent, send an unauthorized task, or claim the provider was installed merely because the code was deployed. After the opt-in restart, the assistant may issue one new three-field JSON task, inspect the result and then recheck the Web UI Models page. Repeated uncertain writes are prohibited.

The next stage (live provider/model tool-call checks, independent `alice-ai` Agent with private workspace, shared skill deployment, permissions and channel binding) remains **not implemented and not authorized** by the provider registration flag. They require separate tested actions and approvals. Official config RPC contract: https://docs.openclaw.ai/gateway/configuration/config-rpc ; Ollama native API contract: https://docs.openclaw.ai/providers/ollama/configuration .
