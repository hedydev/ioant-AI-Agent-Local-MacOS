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

## 2026-10-24 — One-time launcher stop after historical successful updates

After successful `openclaw-ollama-code-sync-20261024-011` with 171/171 candidate tests, the existing foreground launcher stopped with `STOP: too many consecutive self-update reloads`. Root cause is a mistaken **lifetime cumulative** three-reload quota, not the current update failing. See `docs/CHATGPT_LOOP.md` for the exact evidence and the revision-progress guard correction. The process must be brought up **once manually** after a clean ff-only pull because it is already stopped; do not submit an automated task to an absent watcher. Existing OpenClaw Gateway, Ollama service and browser connection need no restart on this evidence. When manually restarting, `--enable-openclaw-provision` is a separately authorized flag; it does not automatically write the provider or create any project Agent.

## 2026-10-24 — Provider write blocked before mutation; add read-only shape evidence

Real Mac feedback: `openclaw-ollama-provision-20261024-012`, `Session: 6cb53c89`, `Status: failed`, `{"state":"blocked","note":"config_revision_or_provider_changed"}`. In `stage2/openclaw-ollama-provision.mjs`, this branch is reached after the provider schema RPC succeeds, **before private backup or config.patch**. The error does **not** prove someone changed configuration. Potential causes include an unexpected `config.get` reply shape, an opaque revision that is not 32–128 hexadecimal characters, absent/invalid parsed snapshot or unexpectedly present Ollama config. Do not guess which without live evidence.

New baseline read-only `openclaw-config-rpc-diagnostic` action inspects ONLY the shape of `config.get` from the same Gateway CLI and outputs fixed classifications for hash format/length, object presence (`config`, `parsed`, `resolved`, `sourceConfig`), booleans for `valid` and `exists`, and whether the Ollama provider key is present. It never sends hash contents, config values, other key names, paths, auth material or raw CLI responses; no Gateway writes, model installs, restarts or Agent creation. First self-update candidate must pass all tests; then run this diagnostic once and assess the exact discrepancy before changing the write handler or retrying `openclaw-ollama-provision`.

OpenClaw docs describe `config.get` as a config snapshot with an **opaque** authored `hash` (see https://docs.openclaw.ai/gateway/protocol/rpc-talk-config-and-agents), and `config.patch` needs its exact `baseHash` (https://docs.openclaw.ai/gateway/configuration/config-rpc). Therefore a hex-only hash assumption is a suspect, not a verified fact.

## 2026-10-24 — Live root cause of blocked provider: opaque non-hex revision

The user submitted `openclaw-rpc-diagnostic-20261024-014` and the **real Mac** returned `status=observed`, `hashKind=opaque_non_hex`, `hashLengthBand=le_64`, `sources={config:object,parsed:object,resolved:object,sourceConfig:object}`, `validFlag=true`, `existsFlag=true`, `provider=absent`, `previousGuard=rejected`; previous full suite was 177/177. This directly confirms the old hex-only `ALLOWED_KEY` check rejected the native Gateway's valid opaque `config.get.hash` **before any backup/write**. OpenClaw documents the `hash` as an opaque authored revision that must be relayed unchanged as `config.patch.baseHash` (https://docs.openclaw.ai/gateway/protocol/rpc-talk-config-and-agents and https://docs.openclaw.ai/gateway/configuration/config-rpc).

**Correction:** accept a strictly bounded printable ASCII opaque hash (8–256 bytes of U+0021..U+007E); do not trim, normalize, re-encode, guess hex digests or print the value. Reject known `valid=false`, `exists=false`, empty/missing/non-object config snapshots and any existing `models.providers.ollama` key in `config`, `parsed`, `resolved` or `sourceConfig`. Preserve fresh schema check, private 0600 before-image, exact `baseHash`, one `config.patch`, summary acknowledgement and readback; do not modify `main` model or other agents. The new fixture covers a **nonhex opaque revision and exact pass-through to patch**, plus negative control character, whitespace, invalid snapshot and provider-conflict gates.

**Acceptance boundary:** GitHub commit is not proof of live registration. Run the existing `project-update-verify` one-shot, require candidate full Mac suite pass and feedback-confirmed fast-forward, then issue a **new unique task ID** for `openclaw-ollama-provision` only when the originally opt-in foreground watcher is still active; inspect outcome, never retry after an inconclusive patch receipt. No Gateway/Mint/BDS restart is authorized.

## 2026-10-24 — No provider after uncertain config.patch; inspect Gateway logs read-only

The live `openclaw-ollama-provision-20261024-016` returned `state=inconclusive,backup=true,note=patch_receipt_unavailable` from `Session f089b39a`. This means the snapshot validation and private before-image succeeded, and **one** `config.patch` was attempted but the CLI rejected/failed before a parseable receipt. The immediately following independent `openclaw-post-patch-reconcile-20261024-017` read-only probe returned `provider=absent`, `agents=absent`, `ollama=reachable`. It confirms the provider is **not currently configured** but does not prove whether the Gateway briefly accepted and rolled back the patch. Do not blindly retry or report a successful model connection.

Official Gateway documentation says `config.patch` requires administrative scope `operator.admin` (https://docs.openclaw.ai/gateway/clients), uses strict parameter validation (https://docs.openclaw.ai/cli/gateway/query), and failed RPC calls ordinarily produce Gateway error logs (https://docs.openclaw.ai/gateway/logging). Missing admin scope, schema validation, baseHash conflict, a read-only owner and connection loss are still **hypotheses**, not an observed root cause.

A new **automatically allowed read-only** fixed `openclaw-patch-failure-diagnostic` action calls only `logs.tail` with a 200-line/128KiB bound through the already-connected local CLI and reports `IOANT_OPENCLAW_PATCH_FAILURE_DIAGNOSTIC`: number of scanned lines, number of lines containing the explicit config.patch method string, a fixed error category (or `unclassified`) and whether any error evidence exists. It **never sends raw log lines, credentials, unrelated log text, paths, connection strings, or free-form error messages** to ChatGPT. Categories are hints from a limited log window, not conclusive request correlation or proof of failed persistence. Read-only behavior and private output are covered by fixture tests. Only after reviewing this evidence should implementation propose a new single-write attempt or alternative authorized access path.

The existing operator-enabled provider write action remains unchanged. The new diagnostic requires no new CLI flags, no Web UI clicking or Gateway/BDS restart. The next deployment uses the existing vetted `project-update-verify` with a fresh task ID and full Mac test gate.

## 2026-10-24 — 019 returned two-or-more classification hits on one Gateway log record

The real Mac `openclaw-patch-failure-diagnostic-20261024-019` returned `status=observed`, `scannedLines=107`, `matchedPatchLines=1`, `category=unclassified`, `recentErrorEvidence=true`. **Because the actual implementation uses a Set of fixed regex categories, then returns `unclassified` whenever Set size is not exactly 1**, this specific combination proves the single `config.patch` log record matched **at least two** fixed patterns. It does **not** mean no error clue was found. The regexes may overlap and record correlation to the earlier failed patch is not independently proven. Do not guess an administrative-scope failure or retry.

The read-only `openclaw-patch-failure-diagnostic` now includes `matchedCategories` (a strictly allowlisted enum array) and `ambiguity` (`none`, `single_category`, `multiple_categories_same_record`, `multiple_categories_multiple_records`). It preserves the `category=unclassified` status when ambiguous rather than silently picking a winner. Never include any log text, hashes, tokens, paths, raw RPC errors, or arbitrary category names in the ChatGPT response. Added regression tests for one record with two matches, payload redaction, conflicting separate records, and no-match evidence.

The actual documented Gateway `config.patch` accepts `raw`, `baseHash`, `note`, and `response: "summary"` (https://docs.openclaw.ai/gateway/configuration/config-rpc). Therefore don't remove those accepted params speculatively. A future patch retry requires a verified root cause and a new explicitly scoped authorization. Next, use `project-update-verify` with full Mac tests, then a **new unique read-only** `openclaw-patch-failure-diagnostic` task. This diagnostic is not a provider install and cannot touch Gateway state.

## 2026-10-24 — Read-only local dry-run after overlapping config.patch error categories

Live `openclaw-patch-diagnostic-20261024-021` on Mac (Session `02922687`) returned `scannedLines=103`, `matchedPatchLines=1`, `matchedCategories=["invalid_rpc_params","config_validation"]`, `ambiguity="multiple_categories_same_record"`. These are **regex clues from one line** and do not prove two distinct root causes. The last independently verified provider state was `absent` after a prior patch with an inconclusive receipt. No further config write is authorized without validation.

Official OpenClaw docs show `config.patch` supports `raw`, `baseHash`, `note`, and `response: "summary"` (https://docs.openclaw.ai/gateway/configuration/config-rpc); native Ollama provider accepts `api: "ollama"`, `baseUrl` without `/v1`, and a local `ollama-local` marker (https://docs.openclaw.ai/providers/ollama/configuration). Model `contextTokens` is a **valid optional input cap**, separate from `contextWindow`; neither field should be declared the cause without a version-specific schema check (https://docs.openclaw.ai/gateway/config-tools/custom-providers). The CLI provides `config patch --stdin --dry-run` explicitly for validation without saving (https://docs.openclaw.ai/cli/config).

To distinguish strict validation from Gateway write transport/RPC problems, the new fixed baseline read-only `openclaw-ollama-dryrun` action:
- Rechecks owner-private config, exact local Ollama service/inventory, absence of an existing Ollama provider and `alice-ai`.
- Runs **three fixed local CLI dry-runs without mutation**, through `openclaw config patch --stdin --dry-run` with fixed, program-owned JSON only: `as_authored` (the exact previously attempted two-model config), `official_explicit` (same models with native `contextWindow`/output `maxTokens` instead of `contextTokens` cap), and `minimal_discovery` (only native local Ollama provider URL/marker/api, no manual model entries).
- Does **not** call Gateway `config.patch`, start/stop the Gateway, change the actual config, write a model file, contact a remote host or create agents. It observes the installed CLI's own schema dry-run output locally, sends only bounded candidate names plus `passed/failed` and fixed error classes, never raw stdout/stderr/values/secrets.
- If a live Gateway's exclusive ownership blocks even `--dry-run`, report `offline_owner`, do not try offline writes or stop Gateway.

Proceed with existing vetted `project-update-verify` full Mac suite, then call `openclaw-ollama-dryrun` once. Do not send `openclaw-ollama-provision` until there is evidence of a valid candidate and a new reviewed single-write procedure. No default-model, Agent or SSH permission changes belong to this dry-run.

## 2026-10-24: dry-run candidate import fix

The Mac candidate update task 022 safely stopped before deployment: 188 tests, 187 passed, one module-level failure in the new dry-run test. Isolated Node reproduction found that a string constant named URL masked the built-in URL constructor used by the module startup guard. Renaming it to OLLAMA_ENDPOINT restored seven isolated tests, including a new regression check. No Gateway patch or provider write occurred. Full Mac acceptance remains required.

## 2026-10-24 — All three native CLI dry-runs passed; refine Gateway rejection evidence

Real Mac task `openclaw-ollama-dryrun-20261024-024` on session `e6e232d8` returned three **passed** local schema dry-runs: `as_authored`, `official_explicit`, and `minimal_discovery`. These check the live Mac CLI's schema and current on-disk config without writing. No model provider was registered by dry-run, and the last independent read-only `config.get` reconciliation saw `provider=absent`.

The official OpenClaw docs distinguish **offline CLI** `openclaw config patch --stdin --dry-run` validation from **online Gateway** `config.patch` (a revision-gated merge patch validated/published against current Gateway state). A dry-run pass does not explain the prior RPC-side rejection, but does make a simple local schema error less likely; the earlier Gateway log had **one** `config.patch` record matching both `invalid_rpc_params` and `config_validation` by broad regex. Source: https://docs.openclaw.ai/cli/config and https://docs.openclaw.ai/gateway/configuration/config-rpc .

The existing fixed **read-only** `openclaw-patch-failure-diagnostic` is extended to output `issueScopes` and `issueKinds`: allowlisted enum arrays describing any recognized error path family (`ollama_models`, `ollama_provider`, `other_model_provider`, `model_catalog`, `agent_configuration`, `gateway_configuration`, `plugin_configuration`, `secrets_configuration`, `config_root`) and error shape (`unknown_key`, `missing_required`, `invalid_type`, `value_too_small`, `invalid_choice`, `write_guard`). Arrays are empty when logs contain no recognized detail. No specific config paths/values, tokens, keys, host names, original message, stderr or version hash are exported. Every label is heuristic from log text, not a request-correlated proof. Three extra fixture tests cover Ollama model error, unrelated provider error and secret-bearing unknown fields.

A small local V8 fixture found and corrected an escaping bug in these new regexes **before GitHub commit**; the fixed classifier passes direct sample tests. Full candidate Mac Node suite must still pass through `project-update-verify`. Then rerun only `openclaw-patch-failure-diagnostic` with a new task ID; do not retry any Gateway config writes until the actual rejected path/type has been reconciled.

## 2026-10-24 — Logs rotated; read-only rejection evidence replaces repeated log tails

The Mac result `openclaw-patch-detail-diagnostic-20261024-026` (Session `0ee670a4`) was `scannedLines=113`, `matchedPatchLines=0`, with no errors identified. The earlier matched config.patch line had aged out of the live tail. Do not treat no recent log match as recovery, and do not blindly retry a write. Earlier `openclaw-ollama-dryrun-20261024-024` passed all three candidate formats but did not mutate the Gateway; last independent provider readback was `absent`.

The official troubleshooting page describes timestamped `openclaw.json.rejected.*` markers for rejected OpenClaw-owned writes: https://docs.openclaw.ai/gateway/troubleshooting/config-validation-and-probes . The new fixed baseline **read-only** `openclaw-rejection-evidence` action inspects *metadata only* for those and optional `openclaw.json.clobbered.*` siblings under the exact current user's private `~/.openclaw` directory. It fails closed on custom profiles, public/symlink folders, unsafe marker files and oversized directories; **it never opens or reads marker content**. It returns bounded marker counts and broad newest-age class, not filenames, timestamps, config bytes or hashes. Presence of a marker does not prove it belongs to the previous RPC attempt.

The same diagnostic asks the currently connected Gateway's `config.schema.lookup` for five fixed Ollama config paths (provider, timeout, models, per-model contextTokens and id). It reports only exact path recognition and allowed primitive type class; no raw schema, unknown path, description, auth, model catalog or remote endpoint is returned. No Gateway `config.patch`, CLI config write, model install, restart, SSH, Git change or web UI interaction occurs. Full tests are gated by the existing `project-update-verify` action; once deployed, use one fresh `openclaw-rejection-evidence` task and evaluate without retrying a write. A rejected marker and live-schema difference are separate indicators, not conclusive proof of a singular cause.

## 2026-10-25 — Gateway provider snapshot discrepancy after rejection check

Real Mac read-only result `openclaw-rejection-evidence-20261025-028`: private marker directory observed, `rejected=0`, `clobbered=0`, newest `none`. Live Gateway schema recognizes `models.providers.ollama` as an object, `timeoutSeconds` as integer, `models` as array; nested `models[].contextTokens` and `models[].id` lookup returned `unresolved`. An unresolved schema lookup at an array-item path does **not** prove the field is invalid. All three CLI dry-run forms passed earlier. No marker does not prove that the prior Gateway RPC committed or that all other provider roots are valid.

A historic upstream issue https://github.com/openclaw/openclaw/issues/98270 describes a Gateway-only `config.patch` validation mismatch where built-in providers in the **runtime resolved** config gained `baseUrl:""` and blocked unrelated patches while local validation succeeded. This is a possible class of failure, **not confirmed for this Mac/version**.

The existing fixed read-only `openclaw-rejection-evidence` now additionally checks a live `config.get` snapshot's `sourceConfig`, `config`, `parsed`, `resolved` provider groups and classifies only count bands and booleans for other-provider missing/empty `baseUrl`, invalid provider shape or unexpected Ollama presence. It also invokes only `openclaw config validate --json` and reports `valid`, `invalid`, `unknown` or `unavailable`. All content remains private locally; neither provider identities, endpoint strings, files nor errors can be emitted. This validation is read-only and **does not prove** that a subsequent Gateway write will succeed. It calls no mutating RPC and never edits configuration, starts/stops Gateway or resets the watcher. New fixture tests assert redaction and fixed probes.

Run the existing strict `project-update-verify` task, demand complete Mac test pass and reload, then rerun only `openclaw-rejection-evidence` with a fresh task ID. If a resolved-only anomalous provider root is found, determine whether it is a platform bug and prepare a separately reviewed write; never change other providers as part of automatic Ollama registration without explicit authorization.
