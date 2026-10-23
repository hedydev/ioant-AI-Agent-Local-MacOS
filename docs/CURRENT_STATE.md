# Current Project State — 2026-10-23

## Objective
Stage 1 local AI website audit: OpenClaw **read-only snapshot** of one explicitly approved page, then local Ollama analysis, evidence/provenance and private report. No ChatDock integration.

## Delivered to GitHub
- Repo initialized, auditable CLI/source/config/scripts/test suite added.
- Hero Skills governance pinned to the current main revision.
- Phase-1 security and environment contracts documented.
- Fixed browser commands are `tabs` and `snapshot`; untrusted page text is never executed.

## Validation evidence
- GitHub remote tree/HEAD and AI commit trailers checked with GitHub connector.
- Source compilation check (imports stripped) and a six-case direct pure-logic V8 smoke run passed.
- Container-to-GitHub clone failed on DNS resolution; full Node tests and live Mac browser/Ollama tests **not executed by this conversation**.
- User's Mac environment, OpenClaw version, running Gateway, and installed Ollama model remain unverified this turn.

## Acceptance still required on Mac
1. `bash scripts/dev-env.sh check` against mounted LunaDrive.
2. `bash scripts/dev-env.sh exec node --test` and `bash -n scripts/*.sh`.
3. `bash scripts/preflight.sh` checks Gateway and local models.
4. Open an authorized page manually under OpenClaw managed browser.
5. `bash scripts/dev-env.sh exec node src/audit.mjs --once --id example`, inspect report.
6. Repeat run: UNCHANGED and no duplicate inference; `--force` should create a new report.
7. Verify privacy/security with non-sensitive test pages only.

## Known limitations
Snapshot text cannot audit visual overlap; reports are model assessments, not confirmed UX functional tests. Redaction best-effort; do not inspect secret-bearing pages. Single-writer runtime, no retention automation, no autonomous agent, no service daemon, no browser clicking.

## Next milestone (not authorized for this phase)
After user acceptance, decide visual screenshot audit and a local dashboard. GitHub/doc/project actions and any browser interaction require separate permission and evidence.

## Environment Registry addition (2026-10-23)

The first-stage project now also provides `src/environment.mjs` (`scan`, `save`, `check`) and `docs/ENVIRONMENT_REGISTRY.md`. It discovers on-PATH/off-PATH binaries and probes known local Ollama ports, so AI assistants can avoid recommending redundant installs. Private data is written only on explicit save/preflight to LunaDrive, not GitHub. Four environment-tool tests were run in a Linux Node 22 container against the same discovery logic and passed; **Mac installation state and complete repository tests remain unverified**. Cross-AI automatic consumption/cloud access is not implemented.

## Node version-manager integration correction (2026-10-23)

User reported that entering newly cloned repository triggered a `fnm` install prompt for `>=24.22.1`, while system Node v24.21.0 and project-specific Node runtimes already existed. Cause: the `package.json` `engines.node` mistakenly copied OpenClaw's requirement. Removed the project-wide engines requirement and separated the CLI script Node 20+ check from OpenClaw's stricter requirements. **Awaiting real Mac validation:** `cd` should no longer trigger this specific fnm prompt; Node 24.21.0 should run inventory/tests without installing a second Node. OpenClaw may still need its own patched runtime when launched; inspect it separately.

## Single-command installer and smoke audit

Added `scripts/bootstrap-phase1.sh` which safely reuses/installs an isolated OpenClaw CLI, tests the repository, checks Ollama, launches a temporary loopback-only token-protected Gateway if needed, starts a separate browser profile, opens a public test page, and attempts one real report. No global Node upgrade, daemon installation, credential import, or cloud model changes. Script shell syntax and static contract tests are part of verification; actual installer + Gateway + browser behavior **requires Mac acceptance**.

## One-command bootstrap acceptance: false positive fixed (2026-10-23)

Operator log: isolated Node 24.22.1 and OpenClaw 2026.10.6 (fe06181) were installed successfully. Bootstrap then stopped after **16/17** project tests passed; the only failure was a misleading static-test regex `/fnm install/` matching the narrative `fnm installation` in `scripts/bootstrap-phase1.sh`. No evidence of an actual unwanted install command; browser/Gateway/Ollama inference were **not yet exercised** by this bootstrap attempt.

Corrected `test/bootstrap-contract.test.mjs` to check command-shaped lines, with a regression test for the exact false-positive case. On next Mac execution, existing `~/.openclaw/bin/openclaw` will be reused: do not repeat the first-time installation.

## First successful live local browser audit (2026-10-23, operator evidence)

User-reported Mac terminal output after corrected bootstrap:
- `opened: https://example.com/`, `tab: t1` with a browser target ID; proves OpenClaw opened the explicitly allowed public test page.
- `[phase1] Running one real read-only website audit with local Ollama`.
- `REPORT example: .../audits/example/2026-10-23T15-27-58-766Z-b6fc7a9f.md` under the private LunaDrive project cache; proves the program emitted a report path after its local model analysis.
- `[phase1] Success. OpenClaw is installed, project tests passed and a report path was printed.`
- Temporary Gateway cleanup was invoked on exit; no persistent Gateway installation is claimed.

**Status:** phase-1 initial real-Mac smoke workflow **passed** based on operator logs; local runtime/browser/model integration is no longer merely theoretical. Report content and accuracy were not inspected in this conversation; unchanged-page skip behavior, independent report quality, security of actual browser state, and opt-in watch lifecycle remain unverified.

**No extra installation required for recheck:** reuse isolated OpenClaw in `~/.openclaw`, existing Ollama on `127.0.0.1:11435`, and original fnm Node for the project scripts. Run `node --test` or `scripts/bootstrap-phase1.sh` only as needed.

**Next acceptance evidence:** open/review the single local Markdown report for grounded observations and uncertainty; run a second `--once` against the same unchanged page while a Gateway/browser is available and verify an `UNCHANGED` log with no second model inference. Keep model output and private diagnostic files local.

## Current work: Phase-1 evidence grounding and repeat-scan acceptance (2026-10-23)

The initial live report demonstrated inference but provided only free-text model claims and no source excerpts. Evidence-v2 changes:
- New `src/evidence.mjs`: bounded/redacted numbered browser source lines and deterministic citation resolution.
- `src/core.mjs`: parse structured citation IDs; Markdown report separately labels line-linked interpretations and invalid/uncited model claims.
- `src/audit.mjs`: feed numbered source, record v2 schema and evidence counts; regenerate once on schema transition, otherwise skip unchanged SHA.
- `scripts/bootstrap-phase1.sh`: reuse a unique open example tab; a second same-session capture must print `UNCHANGED`.
- Add evidence/force/dedup/invalid citation tests; adjust existing mocked integration test.

**Verification boundary:** existing v1 real-Mac smoke was successful. v2 changes have not yet been executed against user's Mac/OpenClaw/Ollama, so do not mark v2 accepted or presume model citation quality. Use the single copy-paste Mac command from README, review the new report, confirm `UNCHANGED` and no unwanted environment changes. Keep credential-bearing pages out of audits.

## Desktop reports preference and implementation (2026-10-24)

User wants **all readable audit reports visible on the Mac Desktop**. Code changes introduce a default report output directory `~/Desktop/Ioant-AI-Agent-Reports/<site-id>/`. Only Markdown reports move to Desktop; SHA deduplication state and event diagnostics remain on LunaDrive under `DeveloperCache/projects/ioant-ai-agent-local-macos/audits/`.

The new `src/report-storage.mjs` validates private output folders and report names, detects whether the existing report is present on Desktop before returning `UNCHANGED`, and safely copies legacy reports. `scripts/export-reports.mjs` performs an idempotent, non-overwriting copy of old `.md` reports, leaving originals intact; `scripts/bootstrap-phase1.sh` invokes it automatically. Tests cover report destination, file permissions, repeat export and report-absent regeneration.

The change is committed to GitHub but requires Mac execution to copy the user's historical report and validate the actual Desktop location. Do not claim the Mac Desktop has already been modified remotely.

## Mac Desktop report test correction — 2026-10-24

Operator ran the Desktop rollout tests: `29` total, `28` passed, `1` failed at `test/report-storage.test.mjs:64` (`Missing expected rejection`). The fixture called `mkdir({mode:0o755})` while `scripts/dev-env.sh` sets `umask 077`; the directory actually had private `0700` permissions, so correctly no rejection occurred. This was a **test fixture error**, not a failed security guard.

Corrected the test to `chmod(0o755)` explicitly and assert the resulting mode before expecting `privateReportDir` to reject it, then `chmod(0o700)` to verify acceptance. A separate local Node reproduction of `umask 077` and the corrected positive/negative behavior passed. Production report paths and permission validation are unchanged.

**Rollout state:** the operator's previously supplied terminal sequence stopped at the failing test (it used `&&`), so old reports were **not yet copied to Desktop** by that sequence. Mac full-suite pass and actual Desktop export remain to be verified by the operator. Use one command from the updated handoff; no OpenClaw, Ollama or Node installation needed.


## Real report comparison and calibrated triage (2026-10-24)

User supplied two real Markdown reports for `https://example.com/`:
- 2026-10-23 15:27:58 UTC (pre-evidence): `Severity: info`, no source citations.
- 2026-10-23 16:06:30 UTC (evidence-v2): `Severity: warning`, nine numbered source lines, with cited multilingual paragraphs and an IANA link, no invalid citations.
- Both reports had the **same SHA-256** `e1efa1a3f803749fcda6a145d3c0a1798156d1b742cb8a9d4a41b576e0970941`. The change in model severity is **not evidence of a page change**.
- The warning came from unverified concerns (possible missing heading, no contrast/keyboard evidence), not source-linked evidence of an observed defect. A language description also compressed multiple separate paragraphs into one multilingual paragraph. Source line IDs alone do not prove factual entailment.

Code introduces `analysisPolicyVersion: 2` (separate from `evidenceSchemaVersion: 2`), structured optional `issues[]`, cited issue candidates, and two distinct fields in reports: provisional review priority and model-suggested severity. If there are no cited issue candidates, priority stays `info`; invalid/missing issue IDs cannot elevate. All issue candidates still require human verification. Prompt asks the model not to treat absent tests as observed defects. The first audit after the policy revision intentionally regenerates the desktop report, while following snapshots stay deduplicated.

**Status:** GitHub implementation and local V8 smoke tests only at present; real Mac v3 report generation and exact second-pass dedup remain to be tested. No OpenClaw or Ollama reinstall needed. Next operator action: run single-command bootstrap, then inspect the new desktop report.


## Third Mac report and evidence semantic guard (2026-10-24)

Operator uploaded an actual v2 audit report `2026-10-23T16-35-00-703Z-dd12805e.md`:
- Page: `https://example.com/`; SHA-256 matches both prior reports (`e1efa1a3f803749fcda6a145d3c0a1798156d1b742cb8a9d4a41b576e0970941`).
- The `info` review priority and model-suggested `info` are aligned; no sourced issue candidates or invalid citation IDs.
- Two residual model mistakes: claims that *one paragraph* has multilingual text while citing **four different paragraph nodes**, and unconditionally proposes `Add a clear heading` even though whether a heading exists is expressly uncertain.

Fixed in evidence guard and report renderer: a narrow structural contradiction check demotes a singular multilingual-paragraph claim backed by multiple separate paragraph nodes to "insufficient evidence"; truly single multilingual paragraph claims are unaffected. When there are **no source-linked issue candidates**, the report emits a fixed non-mutating manual-verification instruction instead of exposing unsolicited model modification orders. When candidates exist, any model suggestion is explicitly labeled unverified and requires manual confirmation. Prompt also reinforces both boundaries.

This creates `analysisPolicyVersion: 3`: first new-policy run generates one Desktop Markdown report despite unchanged source SHA, and next same-page run is eligible to return `UNCHANGED`. Old Desktop reports and LunaDrive state/log history are not deleted. Pure-logic V8 regression scenarios passed 5/5; full Node and Mac OpenClaw/Ollama tests are still pending. Do not claim the attached report alone proves the `UNCHANGED` second capture.


## Mac policy-v3 rerun: stale test assertion (2026-10-24)

User provided real Mac bootstrap output for analysis policy v3: 38 tests ran, 37 passed, 1 failed before Gateway/browser activity. Failure: `test/evidence.test.mjs` still asserted the former section heading `Model claims without valid line citations`, while the intentionally expanded renderer now emits `Model claims with insufficient evidence (unverified)`. The report in the failing test otherwise correctly kept valid source-linked observations and grouped missing/invalid citations separately; there is no evidence of an inference regression.

Corrected the **single stale test expectation**, not the report renderer or other runtime behavior. The scenario was replayed against the repository's `parseAnalysis`, `attachEvidence`, and `reportMarkdown` logic in a V8 smoke test: updated heading, valid citation and all three unsupported cases matched. Full Mac `node --test` and live browser acceptance **still require rerun**. Avoid installing or changing OpenClaw, fnm or Ollama for this test-only fix.


## Fourth real Mac report and evidence count correction (2026-10-24)

User submitted `2026-10-23T16-52-25-399Z-8d7c8aae.md`, a fourth actual `example.com` Markdown report. The snapshot SHA-256 is **unchanged** across the historical captures: `e1efa1a3f803749fcda6a145d3c0a1798156d1b742cb8a9d4a41b576e0970941`. The report showed:
- `Review priority: info` and `Model-suggested severity: info`, no issue candidates and no insufficient-evidence observations.
- The earlier singular-multilingual-paragraph claim was replaced by the more accurate **multiple language-specific paragraphs**.
- The manual verification section no longer instructs a page modification without a confirmed defect.
- One remaining provenance gap: the claim names six languages (English, Arabic, Chinese, French, Russian, Spanish), but the Markdown shows just **four** paragraph citations (L0002-L0005). The snapshot is said to have nine model input lines; the remaining languages are **not verified by this report's quoted evidence**.
- No accompanying terminal output was supplied, so the report alone does **not** establish a passing test count or the second `UNCHANGED` audit pass.

Cause found in current source: `src/core.mjs` and `src/evidence.mjs` forcibly capped every observation at **four** evidence line IDs, and the prompt also instructed the model to provide at most four. This directly prevents a single six-language observation from showing all six supporting paragraph lines.

Fix: raise the per-claim cap to **eight** in the prompt/parser/evidence binding, and add a narrow deterministic structural rule: when a claim enumerates three or more named languages and plural paragraph nodes, there must be at least one distinct cited paragraph source line for every named language. Fewer citations result in "insufficient evidence". The rule checks **count**, not actual translation/language identity; manual review is still required. New source policy is `analysisPolicyVersion: 4`, requiring one new report under the updated policy (then unchanged SHA skipping resumes).

**Validation:** source syntax and eleven evidence/observation pure-code regression checks ran and passed in V8 isolation. Full Node suite and physical Mac OpenClaw/Ollama browser acceptance remain pending. Do not report final Phase-1 sign-off until operator supplies test and/or unchanged output. Stage-one stays read-only; Desktop report destination unchanged.


## Fifth real report: evidence-content acceptance on Mac (2026-10-24)

Operator supplied the fifth `example.com` read-only report, `2026-10-23T17-07-25-282Z-3b628081.md` (timestamp 2026-10-23 17:07:25 UTC):
- Snapshot SHA-256: `e1efa1a3f803749fcda6a145d3c0a1798156d1b742cb8a9d4a41b576e0970941` — the same as all four earlier supplied reports.
- `Review priority: info`; `Model-suggested severity: info`; no issue candidates and no insufficient-evidence claims.
- **All six separate language paragraphs** are cited individually: English `L0002`, Arabic `L0003`, Chinese `L0004`, French `L0005`, Russian `L0006`, Spanish `L0007`.
- `Learn more` link and destination are grounded separately by `L0008` and `L0009`.
- Manual verification notice is conditional and explicitly does not require changing the page without evidence.

This establishes **operator-evidenced content acceptance** for the Stage-1 sample site's evidence/report behavior, including the eight-reference cap and model instruction corrections. It is **not** proof of accessibility, that the live link works, of passing the complete test suite, or of the second `UNCHANGED` capture; no latest terminal output was provided. Do not keep revising the example-domain prompt unless a concrete regression emerges.

**Next priority:** one-time confirmation of `node --test` passing and the automated same-snapshot `UNCHANGED example` output (run the existing safe one-command bootstrap, preserve a short log). Thereafter test a user-explicitly-authorized, non-sensitive owned real site through the exact-URL allowlist; do not preauthorize or access another site automatically.


## New project milestone: opt-in ChatGPT ↔ Mac feedback worker (2026-10-24)

User explicitly requested a repeating workflow: inspect a chosen ChatGPT conversation, run any required authorized Mac checks, return the result to the same ChatGPT conversation, and continue waiting for the next instruction.

Implementation is deliberately in **separate Stage 2**: `stage2/protocol.mjs` validates a specific ChatGPT URL and an assistant-authored structured task JSON schema; `stage2/runner.mjs` maps four hard-coded safe project actions to non-shell child processes; `stage2/chatgpt-loop.mjs` observes only that assistant turn through static OpenClaw evaluate, checks the exact conversation, validates action IDs, executes, saves a task/result receipt on LunaDrive, sends bounded/credential-redacted results back via OpenClaw browser type/press, and remains in a foreground wait loop. Duplicate task IDs and pending uncertain sends are not auto-run or re-posted. `scripts/chatgpt-loop.sh` reuses the existing OpenClaw CLI and an already healthy gateway or runs an isolated temporary loopback token Gateway, and never alters the Phase-1 audit/Gateway/browser security rules.

A single opt-in `--initialize` sends the task protocol as a normal ChatGPT user message. The protocol only runs `project-tests`, `project-status`, `project-head`, and `environment-scan`. Arbitrary scripts or requests (including destructive and deployment actions) are rejected with `approval_required`; implementing user approval for further command classes is **not complete**.

**Local non-Mac validation evidence:** seven new protocol/runner/mock-browser tests passed, including one simulated end-to-end assistant task → command → Desktop report → reply → wait. Two additional static/shell tests also passed separately. These results are **not** real ChatGPT/macOS login/UI proof. Real Mac execution, login, one exact ChatGPT tab, and message receipt still require operator verification; do not claim the loop is currently running from ChatGPT itself. No background process or ChatGPT session access was created in the user's Mac by this GitHub-only update.


## ChatGPT/Mac AliceAI preflight feedback loop (2026-10-24)

The user provided a representative full cycle: ChatGPT requested AliceAI Git main ff-only update → Mint sync and tests → BDS witness-preflight report JSON → upload → ChatGPT diagnosis of import-path regression → Git fix → rerun. The user wants the Mac to do these operational steps repeatedly while ChatGPT does the reasoning and fixes, without manual command copying or report hunting.

Added a **separately opted-in** structured Stage-2 action `alice-witness-preflight`. It uses fixed repo and Mac script paths, validates the existing `origin` and `main`, refuses tracked dirty worktrees, performs only Git fetch/ff-only pull and maintained Alice sync/read-only witness commands, stops on nonzero output, extracts the Desktop report path from the actual script stdout and verifies freshness, filename, schema v2, timestamp, read-only flags. Sends a bounded, sanitized copy of the report's JSON fields inside the selected ChatGPT conversation as text; the original JSON remains on Desktop. The ChatGPT page never supplies Shell/cwd/argv/target. Mint sync is explicitly opt-in because it updates project files; no BDS restart/world writes are authorized.

Tests: six Alice-specific cases passed, and the targeted Stage-2 suite passed 15/15 under Linux Node 22, with a simulated browser. Real Mac browser DOM and looping assistant behavior, same-chat feedback and recovery after an uncertain send **not yet physically accepted**. Documentation: `docs/CHATGPT_LOOP.md`.

Important boundary: the loop is a foreground Mac process, not a task or background process running within this ChatGPT reply; requires explicit --initialize --enable-alice-preflight at startup. No literal binary attachment uploading yet; complete allowlisted report JSON is sent in message text after successful preflight.


## Mac OpenClaw Gateway authentication blocked before browser launch (2026-10-24)

Latest operator terminal evidence: `gateway health requires credentials before opening a websocket` and identical browser `status/tabs` authentication errors. The user's local `sing-box` listens at `:6789`; direct ChatGPT HTTPS HEAD timed out; proxy CONNECT returned 200 and final HTTP status 403. These observations isolate the first blocker to OpenClaw Gateway client authentication. They do **not** yet establish whether an authenticated OpenClaw-managed Chrome tab could reach ChatGPT (HTTP 403 may require a separate proxy/interactive browser diagnosis).

The old Stage-2 launcher discarded the actual authentication error and treated all failures on an occupied TCP 18789 as an unknowable listener, with no safe recovery path. It now prompts interactively for an already existing Gateway token or password **only** for the specific 'requires credentials' error plus local listener. The secret is hidden, never printed or saved by the launcher, and validated before reuse. Failed validation stops without stopping the other Gateway or changing local/browser config. As a follow-up security hardening, project-command subprocesses cannot inherit Gateway token/password/URL environment variables.

Added regression tests for the launcher contract and child secret stripping. Real-Mac Gateway authentication and browser ChatGPT access **remain pending**. Do not request token disclosure, gateway reset, or proxy/VPN changes.


## Mac ChatGPT loop open-tab success but blocked by prior watch.lock (2026-10-24)

New actual operator run: OpenClaw Gateway authenticated, isolated browser said `running: true`, and browser opened the explicitly selected ChatGPT conversation with target `92B4BF9F43325BA3806F52BD50DF87F6`. Stage-2 worker then failed at `open(.../chatgpt-loop/<chat-key>/watch.lock, 'wx')` with `EEXIST`; the script stopped only its own temporary Gateway. Page contents, ChatGPT login, and message send/receipt have **not** been verified by this evidence.

The lock had no stale-owner recovery. Added a separate lease module that accepts old-format PID metadata and cleans only a **provably dead** owner (process.kill(pid,0) -> ESRCH) under an exclusive recovery guard. A live/ambiguous owner, unsafe lock, corrupt metadata or competing recovery stops and keeps the lock. New lock owner nonce prevents cleanup removing a replacement. Also moved the asynchronous state read within the main cleanup try/finally to avoid leaking the lock after a state error. No application process signals or arbitrary lock deletion.

Five targeted Node 22 lock tests were run and passed outside the Mac; complete Mac suite and full ChatGPT message round-trip remain pending. A launcher rerun should reuse the already-open tab if unique and recover an orphaned legacy lock, or print a clear live-owner conflict without running two Mac workers.
