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


## OpenClaw isolated proxy browser: documented SSRF block, choose existing Chrome (2026-10-24)

Operator evidence: OpenClaw 2026.10.6 validates `browser.extraArgs` containing `--proxy-server=http://127.0.0.1:6789`, and the managed browser reports running. Navigation to the authorized ChatGPT conversation is refused **before loading**: `strict browser SSRF policy cannot be enforced while this browser profile is proxy-routed`. This exactly matches OpenClaw's documented strict SSRF prohibition for proxy-routed managed Chromium. The secure response is **not** `dangerouslyAllowPrivateNetwork`; it is to use the signed-in existing Chrome through an explicitly selected `user` (interactive Chrome MCP consent) or `chrome` (approved extension, preferably Selected tabs) profile.

The Stage-2 launcher previously hard-coded `openclaw` even though worker read `IOANT_CHATGPT_BROWSER_PROFILE`; now both accept only `openclaw|user|chrome`, and the launcher passes the choice consistently. Existing Chrome must already contain exactly one matching authorized conversation URL: no automated tab open when missing, no arbitrary profile selection, no Chrome proxy or browser policy changes. New contract tests cover profile selection and refusal of duplicate/missing existing-Chrome tabs. A real Mac read-only `--once` test is the next step; neither existing-Chrome attach nor live ChatGPT message sending has been verified.


## Chrome existing-session attach failed after debug enabled; corrected --once (2026-10-24)

The user enabled Chrome Remote Debugging and the OpenClaw `user` attach still failed: `Could not find DevToolsActivePort`. Previous read-only shell inspection showed the default Chrome `DevToolsActivePort` path exists but cannot be read by that shell. This proves only the attach failure, not a specific permissions root cause. Research confirms the official OpenClaw `chrome` extension mode drives approved existing Chrome tabs via `chrome.debugger`, independent of DevToolsActivePort. Selected tabs authorization should be used for an always-on ChatGPT monitoring workflow. Browser extension installation, activation and live tab visibility are not yet verified on the user's Mac.

Fixed Stage-2 `--once` to return after exact-URL/composer inspection without entering executable task processing. Prior `--once` could execute a stable structured latest assistant task despite being documented as 'read-only'. Added a mock browser regression asserting no type/press or task execution on a page that advertises an allowlisted task. Full macOS acceptance is still pending.


## Extension tab was once found then lost; composer diagnostics expanded (2026-10-24)

Fresh real Mac Chrome extension traces with the current `ai-mc-alice` ChatGPT project path: first `Reusing exactly one matching ChatGPT tab in browser profile: chrome` and worker started, but `readPage` could not find `#prompt-textarea` and incorrectly instructed sign-in to the isolated profile. Second run said `No matching ChatGPT tab`. This is not evidence that the user was signed out or that OneBox failed; the second error means the extension no longer exposed an exact authorized target at query time.

Improved narrowly scoped ChatGPT composer detection and read-only SPA hydration retries; structured errors report only readiness, editable count, known login-form evidence, main region and assistant-role presence. Browser launcher gives count-only feedback for zero authorized tabs, same conversation ID with renamed project path, or unrelated eligible tabs. No new access privileges or auto-opening personal Chrome tabs. Existing `--once` remains strictly read-only; Chrome extension tab visibility and full page/message roundtrip remain unverified on the Mac.


## 2026-10-24 test regression fixed after Chrome tab diagnostics

Latest Mac test output showed a stale regex `expected: /TAB_COUNT=/` and a failing `test/chatgpt-loop-once-readonly.test.mjs` file. Code inspection found the launcher computes `TAB_COUNTS` before assigning `TAB_COUNT`, while the test still required the old assignment and obsolete error text. The read-only loop also queried the exact tab and composer **twice** under normal success, violating its test's read-only single-probe contract. Updated launcher tests to the current metadata-only behavior and moved `--once` success return immediately after the initial verified read, with lock cleanup in `finally`. Isolated Node 22 mock reproduction passes 1/1 and contract predicates all true. Full Mac test suite and browser same-chat roundtrip are pending, and no commands were run on user's Mac from the assistant.

## 2026-10-24: Mac 71-test run exposed malformed read-only test source

Real user Mac Node v24.21.0 `node --test` reported 71 tests, 70 passing, 1 failing at test module parse time. The file `test/chatgpt-loop-once-readonly.test.mjs` had a literal linefeed between single quotes in `trim().split('...')` (a source generation escape bug), so Node reported `SyntaxError: Invalid or unexpected token` at line 43. The failure occurred before the test's runtime assertions, and is unrelated to OpenClaw, Gateway, Chrome or AliceAI. Fixed the malformed JavaScript string delimiter to literal backslash+n (`'\\n'`) and made JSON line parsing an explicit one-argument callback. `node --check` and focused `node --test test/chatgpt-loop-once-readonly.test.mjs` passed 1/1 on isolated Node 22 in the model's container using the matching mock browser fixture. All 71 Mac tests and browser read-only check remain pending real Mac revalidation.


## 2026-10-24: Persistent privacy-filtered Mac loop diagnostics

The operator requested default persistent logging for future failures. After a successful real Mac `chrome --once` page/composer read, added opt-in Stage-2 launcher diagnostics: private per-run 0600 JSONL files on LunaDrive at `$PROJECT_DEV_CACHE/logs/chatgpt-loop/`, a 0700 directory, random-name collision protection, four 2 MiB parts per run, and old regular same-owner file pruning after 30 days. The launch path logs only event labels, browser profile, stage/classification, validated task ID, status, duration, and exit code. It avoids messages, DOM, cookies, other tabs, full URLs, Gateway secrets, raw stderr/stdout or report content. The worker now records initialization, page health, action, feedback and two-minute heartbeat events; the launcher captures start, existing/temporary Gateway, tab visibility and exit code. Existing Desktop task-specific reports remain as the detailed execution evidence.

Added `bash scripts/chatgpt-loop-logs.sh [latest|tail|bundle]` to inspect/export event-only logs without OpenClaw access. Six Node 22 isolated log tests cover permissions, disallowed metadata, rotation, retention, classification and default no-op when used outside the launcher. A first test caught same-second `EEXIST` on log creation; corrected filename construction with an 8-hex nonce, then 6/6 passed. Real Mac full suite and multi-round ChatGPT send/receipt remain pending. No ongoing background log service or automated test execution on user's Mac has been claimed.


## Chrome extension zero-eligible-tabs run and bounded retry (2026-10-24)

The operator's first real logged `--watch` start created a LunaDrive event log but aborted: temporary Gateway could query `chrome` profile, yet relay reported **0 authorized tabs**. Earlier live `--once` had successfully discovered the `ai-mc-alice` ChatGPT tab and composer, so the new evidence supports a transient relay state or removed/paused Selected-tabs permission, not a verified Chrome login failure. Official OpenClaw docs confirm extension connected vs eligible tab counts are different facts.

Added startup-only, fail-closed retry for **chrome + 0 eligible tabs**: up to eight `tabs` checks at two-second intervals, keeping existing Gateway for the run, no navigation or changes in Chrome access policy. Any authorized tab stops the retry; original exact-URL/multiple-tab guards remain in charge. Added allowlisted private log events for retry start, success, timeout, malformed metadata and a regression test covering fixed retry bounds and no permission expansion. The operator still must grant the target tab via the OpenClaw group and unpause it if the zero count persists. Real Mac `--watch` send/receipt/Alice execution acceptance remains pending.


### Screenshot evidence disambiguates tab ACL from relay status

The operator supplied a Chrome extension popup screenshot on the exact ChatGPT tab: `Access: All tabs`, `Pause on this tab`, `OpenClaw relay unavailable`. This rules out the specific claim that missing `Selected tabs` group membership explains the observed condition. It does **not** prove the relay was down during the failed query if the screenshot was captured after the temporary Gateway was stopped by the launcher. Updated startup failure language to avoid claiming the extension is connected on zero tabs, to respect All tabs mode, and to ask for popup observation **while the launcher is active**. The fixed retry remains limited to 8 × 2 seconds on Chrome profile + initial zero eligible tabs. A stable persistent Gateway is a future architecture item and was not installed, configured or started by this commit.

### 2026-10-24: stale composer diagnostics test after All-tabs relay guidance

The operator's Mac `node --test` failed at `expected: /Selected tabs mode, move the intended ChatGPT tab into the OpenClaw tab group/`. This is an obsolete string assertion in `test/chatgpt-composer-diagnostic.test.mjs`, not a new browser error. The launcher had deliberately changed the explanation after a real screenshot showed `Access: All tabs` and `OpenClaw relay unavailable`. Updated the test to assert both current All-tabs and Selected-tabs guidance. Reviewed every repository `test/*.mjs` for the old warning and previously renamed tab metadata messages; no other stale positive assertions were found. Compared the new regex checks directly with the current GitHub main launcher: both match. The operator must still re-run the full Mac suite; no live Mac test was conducted by the assistant during this source-only correction.


## 2026-10-24: Initial ChatGPT message delivered but confirmation false-negative

After the Chrome relay recovered at retry 4 (11 authorized tabs), the experimental foreground `--watch` worker entered the correct `ai-mc-alice` chat and sent its Alice initialization. The worker then stopped with `Message send could not be confirmed`; however, the operator provided the initial message and the recipient AI's response, so this is a demonstrable false-negative confirmation, not evidence of a failed send. Recipient AI correctly refused to emit a `witness-preflight` task because earlier requested work was `witness-lab-startup-probe` (experimental BDS 17880), a distinct unapproved operation. No AliceAI action execution was demonstrated.

Fixed worker: user-role receipt-only DOM scanner across up to 100 displayed user turns, no user text; eight spaced read-only post-Enter receipt checks; durable private `initPending` saved before Enter, automatic reconciliation of truly observed existing receipts on restart, and no auto-repost on missing evidence. A legacy no-pending previous initialization can also be discovered via its existing receipt and skipped. Added allowlisted log phases for initialization pending, reconciled, uncertain. Tests cover delayed successful DOM, existing-message recovery, unresolved-pending abort, and receipt extraction. Mac full-suite and real resumed watcher are pending; maintain prior non-destructive task allowlist.

## 2026-10-24: Alice initialization confirmation tests failed at missing mock SSH guard

The Mac operator's Node suite reported 88 tests, 85 passed, 3 failed, all in `test/chatgpt-init-confirmation.test.mjs`. Every failure stopped at the opt-in Stage-2 worker guard `Provide ALICE_SSH_TARGET on the Mac before --enable-alice-preflight`, before the mock Chrome send/confirmation code could run. This was a **test fixture bug**, not evidence of a real Mint, Gateway, browser or message-delivery failure.

The mock child-process launcher now supplies `ALICE_SSH_TARGET=mockalice@127.0.0.1` in its *test-only environment*, alongside the preexisting mock OpenClaw CLI/browser page. This satisfies the worker's required explicit opt-in guard without granting access to the operator's actual Mint server or executing Alice commands. Added a dedicated regression assertion that the fixture env contains this exact synthetic target, mock browser binary and page state file. Production Alice SSH validation and safety gates are intentionally unchanged. Source syntax and fixture wiring reviewed; the full Mac Node suite remains to be re-run and accepted.

## 2026-10-24: Verified watcher idle after recipient AI explicitly refuses a lab probe

Real Mac operator screenshot and console confirmed relay recovered after one retry (11 authorized tabs) and the one exact Alice chat was being monitored. The recipient ChatGPT replied in ordinary prose that the requested pending work is `alice-mac.sh sync` followed by `witness-lab-startup-probe` (experimental 17880 BDS), **not** `witness-preflight`. The current watcher's allowlist contains only the fixed `alice-witness-preflight` action for AliceAI; it does not parse normal prose as shell commands and does not grant authorization for `witness-lab-startup-probe`, which the Alice repo documents as short BDS launch and graceful stop in the experimental 17880 instance. Therefore no task should run and the previous silent console was intentional, not a hang.

Improved operator visibility without changing execution permissions: when the latest ChatGPT message has no protocol task, the foreground watcher prints a one-time `Waiting for a structured ChatGPT task` notice. It also shows transitions into `generating`, `handled` and `candidate` (requires a second stable read), and prints a bounded heartbeat about every 120 seconds. Private JSONL heartbeat now uses the corresponding status. This is status-only; it never sends new chat messages, schedules lab work, retries a potentially uncertain send, or auto-approves experimental BDS operations. Local Mac tests and live post-change watcher visibility still need acceptance.


## 2026-10-24: Opt-in Stage-2 17880 lab startup probe handoff

New separate `alice-lab-startup-probe` action to bridge the proven idle ChatGPT interaction. The user agreed to permit scoped development for 17880. Verified the Alice repo already has `alice-mac.sh witness-lab-startup-check` and one-shot `witness-lab-startup-probe`, schemaVersion 1 private sanitized Mac Desktop reports and lab-only process guards. The probe includes a short actual BDS launch in disposable 17880, unlike read-only 17879 `witness-preflight`; no aliasing or shared authorization.

Mac implementation: new opt-in `--enable-alice-lab-startup-probe` + local SSH target; immutable action name and fixed argc, guarded Git main/origin/clean fetch/ff-only pull + maintained sync/tests → read-only check report validation → single probe report validation. Requires positive lab BDS shutdown and module import evidence for pass. Strict private 0600 report path checks and key allowlist prevent extraneous secret output; raw SSH/stdout is not fed back. Before any actions persist `state.labProbeAttempted` one-shot barrier. On any failure, uncertain shutdown or timeout, never auto-relaunch lab; require operator inspection and fresh scoped approval. The existing 17879 world, MCSManager and Alice live client are deliberately excluded.

New isolated mocking tests and static watcher opt-in tests added; real Mac full tests and live 17880 probe acceptance remain to be performed by operator. Mac launcher remains foreground-only; debug logs remain on LunaDrive. No Mint changes committed.


## 2026-10-25 — OpenClaw Alice text Agent: LIVE GATEWAY SMOKE ACCEPTED (task 051)

**This is a verified, separately scoped Stage-2 local text-Agent acceptance; not an Alice Minecraft controller integration and not part of the read-only Stage-1 site audit.** Latest tested Mac checkout before this documentation-only update: `9a96672317b73d6ab8b95396557a7aa1bc88cc8e`. The Mac foreground self-updater task `openclaw-alice-smoke-sync-20261025-050` reported fast-forward update to that commit and **275/275** Node tests passing. Those tests and the live evidence below were actually reported by the operator; no new Mac test occurred as a consequence of this documentation commit.

Live `openclaw-alice-agent-smoke-20261025-051` returned exit 0, `Status: passed`, `state: passed`, `gateway: observed`, `response: matched`, `configuredModel: ollama/gemma4:26b-a4b`, `durationMs: 33980`, `configWrite:false`, `channelDelivery:false`. A fixed Gateway-backed `openclaw agent --agent alice-ai --session-key agent:alice-ai:smoke-<nonce> --message <fixed challenge> --timeout 120 --json` produced the exact random challenge response in ~34 seconds. It was a real Gateway Agent turn, not a direct Ollama API smoke. It can create an Alice-specific session record, but did not modify Agent config or deliver to an external chat channel. The configured model is supported by config + successful Gateway reply; **this receipt alone is not an independent GPU/weights/runtime-route attestation**.

The private config post-write audit: task 042 produced `inconclusive / readback_not_confirmed`; importantly it was **not retried**. Task 044 confirmed Alice present with correct model, workspace, per-agent exact tool policy and main owner in Gateway `sourceConfig/config/parsed/resolved` (all four), with `deny:['*']`, no exec, code mode or elevated access, no Alice bindings, no skills or subagents. Task 047 identified no comparable main object; task 049 resolved why: before Alice, disk `agents.entries` was absent and ownership unset; after Alice, `main` and `alice-ai` were explicit, ownership explicit, system Agent pinned to `main`. Private before/current comparison found **bindings, configured default model and Ollama provider unchanged**. Therefore `mainPreserved:no` in the former strict structural comparator did *not* demonstrate removal/corruption of a previous authored main entry. No configuration rollback or second Agent registration was needed.

Operational facts: Mac OpenClaw CLI/Gateway `2026.10.6`; native Ollama endpoint `127.0.0.1:11435`, Gemma4 and `gpt-oss:20b` previously passed separate direct model smoke task 037. The same-chat Mac worker uses already-paired Chrome **extension profile `chrome`** when `IOANT_CHATGPT_BROWSER_PROFILE=chrome`; do not silently replace it with proxy-routed managed `openclaw` profile, weaken SSRF protection or restart services.

**Completed scope:** local provider provisioned; Alice text Agent persisted with no-tool policy; one actual Gateway text response matched; all 275 project tests passed. **Not completed:** Minecraft Bedrock/Mint ↔ OpenClaw Alice model bridge, world observation serialization, action schema/validator, human override, per-step server-origin position proof, autonomously executed Minecraft plan, BDS 17880 lab resolution, performance budgeting beyond one ~34s response. The existing Mint Alice deterministic/optional Ollama planner is a **different execution path**; do not mark it integrated or treat this as in-game acceptance. See [OpenClaw Agent Setup](OPENCLAW_AGENT_SETUP.md) for the authoritative text-Agent onboarding and acceptance evidence. The separate Minecraft AliceAI repository is unchanged.

**Ordinary usage:** select `alice-ai` in the OpenClaw Chat UI and converse directly. Unlike the automated smoke, free-form multi-turn chat and its usability have not yet been independently exercised in this project; avoid claiming otherwise. Any future Minecraft world-observation bridge is out of scope and requires its own design and authorization. No low-level movement/frame control through the ~34s Agent, no automatic Mint service restarts, Gateway tool enablement, production world changes, or privileged SSH as part of this document update.


## 2026-10-25 — ChatGPT ↔ OpenClaw AliceAI developer dialogue bridge (STAGED)

The user confirmed that the purpose of the ChatGPT Mac watcher plus standalone OpenClaw `alice-ai` Agent is **AI-to-AI collaboration on AliceAI software development**, not dialogue inside the Minecraft world. ChatGPT is the planner, GitHub/code reviewer and final tester; local Alice is a separate, no-tools technical second opinion whose messages go back into the SAME authorized ChatGPT development conversation automatically via the existing Mac watcher.

Implementation staged on `main`: new strict text-only `openclaw-alice-dev-discuss` structured action has a bounded `prompt`, derives a conversation-specific Alice Gateway session from the exact selected ChatGPT URL, pipes prompt over stdin to the pinned Gateway-backed `alice-ai` CLI, and returns a bounded, explicitly **untrusted** advisory into the same chat. It reuses the existing safety policy preflight and same-chat exactly-once receipt logic, sends no messages to outside channels and has no model tool/exec, shell, Mint, Git or BDS privileges. A failed/uncertain model call does not retry. This is **NOT YET real-Mac accepted** until full candidate `node --test` and one actual non-test dialogue complete. Existing task 051 still establishes only a fixed nonce challenge on the local Gemma4-configured agent. Read `docs/CHATGPT_LOOP.md` for the schema and acceptance boundaries. The separate Minecraft Alice project is unchanged.

The first planned acceptance: ChatGPT sends a short AliceAI architecture question (without sensitive files), Mac routes it to `alice-ai`, Alice produces a technical proposal, Mac posts that proposal back to the original ChatGPT development chat, and ChatGPT summarizes agreement/disagreement. A second NEW-ID question in the same chat should continue the same Alice session while a different ChatGPT chat cannot accidentally share it. Only after this evidence consider controlled read-only project context injection and distinct developer/tester roles.


## 2026-10-25 — Developer dialogue crash-replay fence (STAGED; Mac acceptance pending)

Review found that the initial bridge persisted a completion receipt only *after* Gateway inference. A crash or shutdown during a turn could therefore cause the same task ID to run a second model call after watcher restart. The watcher now writes a private, per-chat durable `devDiscussionClaims` reservation **before** calling Gateway. Any previously claimed ID, malformed ledger, or exhausted (1024-entry) ledger fails closed; a crash after reservation is `inconclusive` even if inference never started. The reservation stores only ID and time, not the question or reply. It does not clear old claims or retry the model. New isolated tests cover first claim, same-ID replay and invalid/full ledger. Existing strict action-specific JSON, assistant-role DOM, feedback receipt, Mint one-shot protection, and update verification remain unchanged. No Mac deployment or live dialogue has been verified for this revision yet.


## 2026-10-25 — Bound per-project OpenClaw Agent collaboration (STAGED)

Architecture correction (user-confirmed): The ChatGPT OpenClaw workflow conversation needs an OpenClaw infrastructure development advisor named openclaw-dev. The separate Minecraft AliceAI development conversation may use existing alice-ai. The Mac Stage-2 watcher is transport and a fixed-command executor, not an AI Agent. Existing main remains system owner with no new or inferred permissions.

New action openclaw-agent-dev-discuss accepts exactly protocol/id/action plus bounded prompt; no task field selects an Agent. The Mac operator instead pins the exact selected ChatGPT URL by launching the watcher with --dev-agent openclaw-dev or --dev-agent alice-ai. Without --dev-agent, all model discussions are disabled, while fixed safe diagnostics and separately enabled project-update-verify remain available. Legacy openclaw-alice-dev-discuss requires an explicit alice-ai binding; it cannot run against openclaw-dev. No fallback to main, no arbitrary Agent ID, no model or browser override.

Before a model turn, the worker verifies all four live Gateway config.get layers: main system owner; explicit ownership; exact target Gemma 4 26B model and model allowlist; target-specific deny-all tool policy (exec, privileges, agent-to-agent calls, code mode, skills, subagents disabled); no target channel binding or unknown third-party Agents; and canonical private LunaDrive Agent workspace plus AGENTS.md. The model question is sent via stdin, never host-command arguments. Separate model sessions use agent:<bound-agent>:dev-<exact-chat-URL-digest>. A durable per-chat devDiscussionClaims record is persisted before inference to block automatic replay after crashes or uncertain receipts. Replies are bounded untrusted advice, not proof of development, tests or game operations.

No openclaw-dev Agent or workspace has been created by this code update. It is allowlisted for future separate opt-in provisioning only. Until that occurs, openclaw-dev discussion safely reports agent_missing_or_unsafe and performs no inference. Do not reuse consumed Alice creation action or grant Gateway writes through ChatGPT text. Existing alice-ai, main, Gateway, Minecraft AliceAI source, Mint and BDS remain unchanged.

Exact-tab diagnostics now state the ACTUAL browser profile, number of visible eligible tabs, ChatGPT tabs, same-conversation-ID tabs and exact matches, plus fixed reason. The previous unconditional phrase isolated OpenClaw profile wrongly suggested that chrome mode was not active. A zero count is not proof of logout. Neither the launcher nor worker automatically changes tab URL, browser profile, extension authorization, proxy or Gateway configuration.

Real Mac acceptance still pending: restore one exact authorized ChatGPT tab through the already-paired Chrome extension; use IOANT_CHATGPT_BROWSER_PROFILE=chrome and the same exact --chat-url; add --enable-self-update for guarded candidate-test/fast-forward/reload. Bind --dev-agent openclaw-dev only after selecting the infrastructure development role. Full candidate node --test must pass before deploying, followed by separately approved no-tools openclaw-dev provisioning and actual two-way multi-turn ChatGPT ↔ Agent feedback. An untested GitHub commit or unit fixture is not a live acceptance result.


## 2026-10-25 — Restricted OpenClaw Dev Agent creation gate (STAGED; real Mac acceptance pending)

After the safe self-update to ebd715036f6509b864de24385e7878e5e00689f5, the Mac reported 294/294 passing tests. This proved code acceptance, NOT that OpenClaw Dev existed or that the ChatGPT watcher process had already reloaded. The current work prepares a separately operator-approved dev Agent in the SAME existing local Gateway, without touching main, alice-ai, Mint, Minecraft or channel bindings.

- Read-only automatic action: openclaw-dev-preflight. It probes fixed Ollama availability and expected models, private config, exactly main plus the already verified no-tools alice-ai in all config.get roots, original main owner and private Alice workspace, and absence of a dev workspace. Returns only bounded ready/blocked/inconclusive flags; no raw configuration or secrets, no Agent creation.
- Separately opted-in write action: openclaw-dev-create. Requires a local foreground watcher launch with --enable-openclaw-dev-create; it is NEVER automatically authorized and accepts exactly protocol/id/action. Prior to any possible side effect, the watcher saves a durable per-chat devAgentCreationAttempted claim. Any new attempt in this chat after an ambiguous/failed one is blocked without retry.
- The one allowed config change is agents.entries.openclaw-dev with a fixed Gemma 4 26B model, same fixed model allowlist as Alice, strict tools.deny ['*'], no exec/elevated/code/skills/subagents/agent-to-agent, and no channels. The Mac checks main and Alice in all four live Gateway config views, requires an unused private LunaDrive workspace, runs fixed OpenClaw schema dry-run, backs up the existing private config with a distinct file prefix, creates only the fixed private Agent workspace and AGENTS.md, then sends exactly one config.patch with the observed baseHash. On positive response it reads config.get again and compares original main, Alice, owner/defaults, models, bindings, Gateway and other preserved fields. Lost/uncertain acknowledgements are NOT retried.
- Alice's existing smoke verification now tolerates ONLY the additional allowlisted, equally restrictive OpenClaw Dev Agent; unknown entries or broadened tool rights still block. This avoids a false failure after the new Agent joins the roster.
- The existing openclaw-agent-dev-discuss stays disabled until the operator binds --dev-agent openclaw-dev and the live config/workspace verification passes. No fallback to main or Alice, and no external channel delivery.

Operator sequence: (1) project-update-verify after candidate test gate; (2) openclaw-dev-preflight (read-only) and inspect receipt; (3) request explicit approval for the local config write; (4) only after that stop the foreground watcher, restart with --enable-openclaw-dev-create and --dev-agent openclaw-dev, and execute one new openclaw-dev-create task ID; (5) verify fresh readback, a no-tools model smoke and a real two-way same-chat development dialogue. The exact project ChatGPT URL must remain pinned. Never use --initialize, never silently grant tools, change model owner, or retry uncertain writes.

This stage changes repository code, not the user's local Gateway configuration. Native Mac node --test, self-update, preflight, creation and end-to-end dev dialogue are unverified until their individual live receipts arrive.


## 2026-10-25 — Fix multi-Agent no-tools roster validation (STAGED: Mac candidate tests pending)

The first 8ec480d1 OpenClaw Dev provisioning candidate was **correctly blocked** by the Mac self-update gate: 309 tests, 308 passed, one failed in `test/openclaw-alice-agent-smoke.test.mjs:104`. The added test exposed an actual permissions gap: validating only the selected `alice-ai` did not reject a second approved-name `openclaw-dev` Agent whose tools.deny policy had drifted. Do NOT weaken or remove that test. The fixed `verifyBoundAgentConfig` now checks every present approved Agent in all four Gateway config layers, compares the complete roster consistently across layers, rejects unknown Agent identities, and forbids any per-Agent channel binding even when evaluating the other Agent. The selected Agent still must be present, and both main ownership and strict source/config model/tool policies remain pinned. Two additional regression tests cover reciprocal unsafe Agent policies, unexpected bindings, unknown agents, and partial-layer rosters. This fix changes repository code only; native Mac candidate suite and actual provisioning remain pending. No Gateway config write or Minecraft/Mint action was performed.


## 2026-10-25 — OpenClaw Dev first creation interrupted before invocation

The exact-chat watcher restarted in Chrome with both --enable-openclaw-dev-create and --dev-agent openclaw-dev. It recognized the fixed openclaw-dev-create-20261025-062 task, then exited with `STOP: Unknown diagnostic event`. Code inspection conclusively identifies the synchronous unallowlisted `recordDiagnosticEvent('openclaw_dev_create_claimed')` after the durable `devAgentCreationAttempted` state save and BEFORE the sole `runAction(openclaw-dev-create)` call. This failure provides no evidence that OpenClaw Dev was created. The persisted claim MUST NOT be blindly deleted or retried.

The diagnostic whitelist now includes both previously omitted `openclaw_dev_create_claimed` and `dev_discussion_claimed`, covering the Agent creation and future model dialogue branches. A regression test enumerates every literal watcher diagnostic event and verifies membership in the diagnostics allowlist, as well as privacy constraints.

One incident-scoped `stage2/openclaw-dev-interrupted-claim.mjs` recovery exists with fixed original task ID, exact project ChatGPT URL and old run log name. It accepts NO command-line arguments and has no Gateway write, Agent creation or shell execution. When no watcher holds the per-chat lock, it acquires that same lock, reads owner-private fixed state and original diagnostic JSONL, checks event order and absence of any run-completion or execution marker, AND requires fresh `openclaw-dev-preflight` state=ready (no target Agent/workspace). Only then does it atomically close the old attempt claim, record a one-time recovery marker and mark original 062 task handled. All ambiguous/unsafe cases fail closed and leave the claim. Any new creation still requires --enable-openclaw-dev-create plus a NEW structured task ID.

Because the watcher exited, an operator must first run the repo's existing test-gated self-update command locally (not git pull without tests), then run the exact incident recovery script with the protected dev-env. Only after a `state=recovered` response should the foreground Chrome watcher be restarted, followed by one fresh new creation task and a separate verification. This repair does not touch Gateway model config, AliceAI, Mint or Minecraft. Native Mac candidate tests and the local incident recovery have not yet been run as of this GitHub commit.


## 2026-10-25 — First real Dev creation blocked at backup cache check (STAGED FIX)

The actual ChatGPT-watcher task `openclaw-dev-create-20261025-064` returned `failed`, audit `IOANT_OPENCLAW_DEV_CREATE`, state `blocked`, backup=false, workspace=false and note=`unsafe_backup_cache`. In the fixed creation function the backup-cache test runs before opening a backup folder, creating the Agent workspace or invoking Gateway config.patch. Therefore no Dev Agent creation was attempted, but the watcher retains its durable one-shot `devAgentCreationAttempted=064` claim. NEVER clear that claim without an independent, scoped reconciliation.

Root-cause code review found a safety-policy mismatch: `openclaw-dev-preflight` previously did not validate the cache parent used by `privateDevBackup`, and the backup demanded owner-only read access (0700) to the entire shared `/Volumes/LunaDrive/DeveloperCache` tree. The shared cache may safely be group/other *readable* (0755); it MUST NOT be group/other writable. `inspectDevBackupCache` now enforces canonical volume and cache, plain non-symlink directory, current-user ownership, and no group/other write access (mode&022=0). Crucially the dedicated `openclaw-agent-backups` directory and the actual private backup files STILL require owner-only 0700/0600, respectively. The exact same cache check now runs in the readonly Dev preflight and supplies a bounded reason if blocked. Never chmod the shared DeveloperCache parent as a workaround.

A new separately gated exact-chat action `openclaw-dev-prewrite-reconcile` (requires the same `--enable-openclaw-dev-create` Mac launcher authorization) handles ONLY the known 064 `unsafe_backup_cache` failure. The already-running watcher must hold its exclusive conversation lock. The reconciliation checks the actual last handled task and persisted 064 attempt, a single original private 064 generated failure report showing `blocked,backup:false,workspace:false`, the complete 064 task/claim/action-finished/feedback-confirmed diagnostic event sequence, and a fresh readonly `openclaw-dev-preflight` with state=ready proving the Agent and target workspace are still absent. Any missing, contradictory, changed, exposed or ambiguous evidence stops WITHOUT mutating the state. If and only if verified, a recovery marker is committed atomically and ONLY the old 064 claim is removed. This does not execute Agent creation or Gateway writes; a distinct new structured creation task ID is still necessary.

Operator sequence: first update the already-running watcher through fixed test-gated `project-update-verify`; then call the scoped recovery action and require `state=recovered`. If preflight shows unsafe cache owner/write/path, investigate on Mac rather than changing system-wide permissions or bypassing checks. After a successful recovery receipt, send a NEW `openclaw-dev-create` task. As of this note, these new changes are GitHub-only; the full Mac tests, reconciliation and actual Agent creation remain unverified.


Follow-up gate correction: the fixed `project-update-verify` task to stage this repair has ID `openclaw-dev-backup-update-20261025-065` and necessarily becomes the watcher's `lastTaskId` before the 064 reconciliation. To avoid an impossible state check, the recovery accepts lastTaskId equal ONLY to the original 064 or this exact newly verified self-update task 065. It still requires the persisted original 064 one-shot claim, matching private 064 report and log events, fresh safe no-Agent preflight and exclusive per-chat watcher lock. No arbitrary recent task ID or unapproved claim reset can reconcile.


## 2026-10-25 — VERIFIED: independently bound OpenClaw Dev Agent and ChatGPT exchange

The complete safety-gated Mac acceptance sequence has now succeeded. These are actual same-chat Mac worker receipts, not inferred test successes:

- `openclaw-dev-backup-update-20261025-065`: safe project self-update from `94ff4450dc458bcd61dea04fc892bba25c33de52` to `c060096f1a613f7c44b2022f77702b72cfe55aad`, `324/324` native tests passed; launcher reloadRequired=true.
- `openclaw-dev-reconcile-20261025-066`: `IOANT_OPENCLAW_DEV_PREWRITE_RECONCILE` `state=recovered`, `reason=prior_prewrite_failure_reconciled`, `configWrite=false`, `agentCreation=false`. This was scoped only to the prior failed 064 attempt, not an arbitrary one-shot reset.
- `openclaw-dev-create-20261025-067`: `IOANT_OPENCLAW_DEV_CREATE` `state=applied`; private config backup=true, workspace=true, mainPreserved=true, alicePreserved=true, runtimeAcknowledged=true. Independently registered `openclaw-dev`, model `ollama/gemma4:26b-a4b`. The Gateway patch/readback passed the preserved-roster and no-tools checks.
- `openclaw-dev-discuss-20261025-068`: `IOANT_OPENCLAW_BOUND_DEV_DISCUSS` `state=answered`; agent=`openclaw-dev`, toolsEnabled=false, configWrite=false, externalDelivery=false. An actual Chinese answer from local Gemma 4 came back in this exact ChatGPT conversation via the bounded watcher protocol, discussing DOM/Accessibility-based GUI understanding, vision fallback and UI-TARS. Treat that answer as UNTRUSTED technical advice rather than proof of deployed UI features.

Acceptance boundary: this confirms the first ChatGPT -> fixed local watcher -> independent no-tools OpenClaw Dev Agent -> ChatGPT model-advisory loop. It does not authorize new tools or remote-control ability, verify real webpage DOM or screen capture, or prove that multiple Agents can autonomously plan, modify code, execute tests and supervise each other. The default owner `main` and independent `alice-ai` remain preserved per the creation audit, not yet re-smoked after creation.

Recommended next phase: first run a fresh no-tools Alice smoke in the newly expanded Agent roster. Then prototype a separate READ-ONLY, exact-tab, privacy-scoped GUI observation capability using OpenClaw's structured DOM and accessibility snapshots with deterministic button labels/roles/visible state. Use screenshots or Gemma 4 vision only when the structured tree cannot disambiguate a target. A VLM can propose a target but MUST NOT send raw click coordinates or gain executor privileges; all actions require fixed allowlists, fresh target re-observation, a separate authorized executor and post-action verification. The optional Qwen3-VL 4B/UI-TARS models should not be installed or auto-started without measured recognition failures and resource acceptance on Mac M1 Pro 32GB. Vision, GUI automation and agent collaboration remain proposals, not implemented.


## 2026-10-25 — Phase 1 browser GUI observation (STAGED; Mac acceptance pending)

The post-creation `openclaw-alice-post-dev-smoke-20261025-070` Mac receipt is PASSED: independent `alice-ai` Gateway response matched `ollama/gemma4:26b-a4b` in 26.5 seconds; configWrite=false, channelDelivery=false. This validates Alice still functions after the separate `openclaw-dev` Agent was added. It does NOT give either Agent browser tools.

New `stage2/gui-readonly-observation.mjs` prototypes a minimal, read-only computer-vision precursor WITHOUT loading a second model and WITHOUT any action. The known protocol action `openclaw-gui-readonly-probe` is NOT automatically authorized; it requires a separate foreground Mac launcher flag `--enable-gui-readonly`. Even when enabled it is restricted to the one exact, already authorized ChatGPT conversation tab, rechecks tab identity and URL, and makes ONE fixed `browser --json evaluate` call. The browser function may inspect only limited potential interactive elements (button/link/textbox/checkbox/combobox/tab/menuitem), bounding rectangles and viewport, visibility/occlusion and disabled state. It returns at most 24 controls, scoped safe label words (exact-match whitelist), and aggregate counts. The watcher strictly validates the output schema, marker and exact URL before accepting it. NEVER return free-form DOM text, user message contents, input values, hrefs, cookies, screenshot pixels, page titles, arbitrary aria-labels, or arbitrary selectors. No clicking, typing, scrolling, navigation, filesystem access or screenshot is part of the read-only phase. Unknown labels are represented as `other`; control geometry is transient and NOT a stable target ID.

New tests cover secret-bearing controls, hidden/offscreen/occluded elements, schema injection, fixed browser-evaluate-only invocation, strict exact-tab gating, and the local launcher opt-in. Javascript syntax and isolated synthetic-DOM observation have been checked from the GitHub candidate, including wrapped browser --json results. Native Mac `node --test` and a real Chrome-tab observation are NOT YET VERIFIED.

Intended sequence: stage this commit using `project-update-verify` (candidate tests before ff-only). Then restart the exact-chat watcher in the foreground with `--enable-gui-readonly` added to the existing safe flags (do not broaden profiles/tabs), request one read-only GUI probe, review privacy-bounded counts and geometry, and only then determine whether existing Gemma 4 vision materially improves recognition. The read-only observation action does NOT approve subsequent clicks. Model installation, additional screenshots, UI-TARS, Qwen3-VL or cross-Agent tool grants are out of scope.


## 2026-10-25 — Ops supervisor groundwork for unattended watcher updates (STAGED)

The user asked to avoid copying a new long Mac terminal command every time a ChatGPT/OpenClaw feature requires watcher restart, and suggested an additional OpenClaw Agent for operations. The current existing project-update-verify workflow already auto-reloads pretested Git updates under one fixed set of launcher flags, but DOES NOT allow a model to grant itself a new flag such as --enable-gui-readonly.

The first safe milestone adds a separate, user-installable macOS LaunchAgent supervisor implementation at stage2/ops-supervisor.mjs and docs/OPS_SUPERVISOR.md. It is an execution substrate, NOT another autonomous or shell-enabled LLM Agent. A local Mac operator runs exactly one setup command AFTER the pretested update, and only after shutting down the existing foreground watcher. Fixed launchd ProgramArguments pin the already tested ChatGPT conversation, Chrome profile, --enable-self-update, --enable-gui-readonly, --dev-agent openclaw-dev and --watch. Explicitly NO Agent creation/provisioning, tools, Alice/Mint operations, arbitrary flags or shell from model content. The installer requires an expected clean main repo/origin, canonical LunaDrive cache, noninteractive Gateway health, owner-private logs and no existing watcher lock. Installation runs in the GUI user's LaunchAgents domain only, without sudo; KeepAlive=false to fail closed rather than loop on unavailable browser/Gateway. Status/uninstall are local operator commands.

An additional text-only no-tools openclaw-ops Agent is a possible later advisory role; real lifecycle calls must remain allowlisted, not become arbitrary exec permissions. A second milestone should offer fixed read-only supervisor-status and gracefully acknowledged restart requests gated by locally installed permissions. That feature has NOT been implemented yet. The first version also does NOT heal every browser/Gateway fault autonomously.

Code was checked syntactically offline; actual native Mac test suite, LaunchAgent install and a live gui-readonly receipt are PENDING. This commit does not install any LaunchAgent or change the running Mac watcher. The next task should first run project-update-verify and check all candidate tests; only afterward should the user make the once-only Mac-local installation and verify the real launchd/Chrome/Gateway environment. Never claim that the supervisor is installed merely because it is in Git.


## 2026-10-25 — Mac supervisor installation blocked by Node PATH assumption

The user's first direct Mac installation attempt, after a successful 332/332 test-gated update to d9ab84d1a6b9ebcff376e29e892d41e3cf1f76c2, returned `IOANT_MAC_OPS_SUPERVISOR state=blocked reason=unsupported_node_path`. The original installer demanded that `/usr/bin/which node` be directly within a fixed Homebrew/system PATH. Their existing Node runtime was outside those limited directories, which may happen with nvm/fnm/Volta or private Node installations. This check ran before plist registration; no Supervisor was installed, and the original Gateway/Agent configuration was unchanged.

Staged fix: `inspectNodeRuntime` resolves the **running** `process.execPath` to a canonical binary. It permits only exact user-home, /opt/homebrew, /usr/local, /usr/bin or mounted LunaDrive roots, and verifies every ancestor directory and the binary itself is plain, non-symlink, owned by current user/root, and not group/other writable; binary must have executable mode. Install pins only this validated Node directory as the first service PATH entry, followed by the fixed safe system PATH. It rejects unknown or unsafe runtimes rather than copying current shell PATH. `status` and `uninstall` verify the entire fixed generated LaunchAgent template using the pinned runtime directory, instead of assuming the terminal always uses the original Node version. Added positive and fail-closed regression tests.

IMPORTANT: GitHub-only until real Mac update and native tests pass. Since the user stopped the foreground watcher as directed, the next once-only Mac terminal command should run fixed `node stage2/project-self-update.mjs` via `scripts/dev-env.sh exec` and THEN installer/status (not raw git pull without tests). If update fails stop. If install is blocked, do not manually chmod symlinks, change system PATH, or discard existing locks. The actual Mac Node runtime directory has not been disclosed or independently observed.


## 2026-10-25 — Mac candidate gate catches incorrect synthetic Node fixture

The Mac user ran the exact protected sequence (project-self-update -> ops-supervisor install -> status). Self-update blocked with `candidate_tests_failed`: 334 tests, 333 passed, one failed at `test/ops-supervisor.test.mjs:65`. Shell `&&` stopped; supervisor installation and status were NOT attempted and the Mac remained on the previous known-good HEAD `d9ab84d1a6b9ebcff376e29e892d41e3cf1f76c2`.

An isolated reproduction found that the added nvm/LunaDrive acceptance test reused its original nvm-only `stat` mock when testing a different LunaDrive Node executable. The mock returned a *directory* object instead of a regular executable file for LunaDrive's Node path, so the correct fail-closed `inspectNodeRuntime` check rejected it as `unsafe_node_runtime`. The test fixture has been repaired to stat its own LunaDrive executable as a current-user-owned regular executable while keeping directory ancestor checks and an explicit negative assertion: an actual directory MUST be rejected as a Node binary. No production permission guard or installer behavior is weakened. Synthetic nvm success, LunaDrive success and directory rejection have been checked against the exact function, but native Mac test-gated candidate and real launchd installation still need fresh receipts.

Next: since the foreground watcher was stopped for the one-time install, run the same three-step protected Mac terminal command again. Only after Mac full suite passes and update completes should install be attempted. No raw git reset/clean/stash, no manual chmod of Node directories or LaunchAgent, and never bypass failed candidate tests.


## 2026-10-25 — Supervisor registered but did not spawn; external log redirection suspected

User provided a fresh local inspection after first successful service install: `launchctl print gui/$UID/com.ioant.openclaw.safe-watcher` reported `state = not running`, `runs = 1`, `last exit code = 78: EX_CONFIG`; `pgrep` showed no watcher and the LunaDrive external-volume stdout/stderr were empty. The earlier project `state=registered` only proved the label existed, not a running process. No real ChatGPT GUI probe was performed and task 073 MUST NOT be treated as delivered. Prior complete candidate suite passed 334/334 at `7c1195db4db9afd6304804b277f43e0c3bad4447`.

Published macOS launchd/OpenClaw issue investigations describe `EX_CONFIG(78)` and empty stdout/stderr when launchd's pre-exec StandardOutPath/StandardErrorPath are on external volumes. This is strong evidence of the likely cause but remains unconfirmed locally until a new on-disk launch. A candidate fix moves only those two launchd redirect files to private `~/Library/Logs/ioant-openclaw-ops`; project cache and diagnostics remain on LunaDrive. Native installer preflight refuses symlinked or non-user-owned/other-writable Logs parent, and log files must remain private. New `status` differentiates running PID vs registered/stopped, exposes a bounded numeric last exit code, and recognizes a known legacy external-log plist only if every other field matches exactly. `uninstall` only performs a graceful bootout for that exact known label, then deletes the verified plist (legacy log files are preserved). No arbitrary process shutdown or Gateway/Agent config write is added.

Pending sequence: use test-gated local `project-self-update.mjs` with the stopped Supervisor; after ALL tests pass, perform explicit exact-service `uninstall`, new local-log `install`, and `status`. If running, send a fresh read-only GUI probe; claim end-to-end healthy only after receipt. If EX_CONFIG persists, inspect sanitized unified launchd logs before any further changes. See docs/OPS_SUPERVISOR.md. GitHub candidate alone does NOT prove local repair.


## 2026-10-25 — Confirmed EX_CONFIG remediation boundary: macOS Documents TCC blocks launchd script

Actual Mac feedback after migration to local launchd stdout/stderr: tested update `337/337` passed; `uninstall`, `install` succeeded, but local `status` reported `state=stopped`, `lastExitCode=126`, with `logLocation=local`. The new local stderr directly confirms `/bin/bash: /Users/ted/Documents/workspace/ioant-AI-Agent-Local-MacOS/scripts/chatgpt-loop.sh: Operation not permitted`. Directory/owner metadata show `~/Documents` is owner-restricted with macOS extended metadata and `chatgpt-loop.sh` is `-rw-------`. This is consistent with a TCC-protected Documents access denial for a background LaunchAgent; chmod/sudo/Full Disk Access broadening is neither necessary nor appropriate. The earlier suspected LunaDrive launchd log issue was fixed separately; it exposed this next failure but did not fix the Documents permission.

Staged recovery on GitHub: keep the interactive source checkout where the user wants it, but during a single exact local installer invocation, clone the clean known GitHub main source to a private user-owned independent runtime at `~/Library/Application Support/ioant-openclaw-ops/runtime` using Git's `--no-local` option (no mutable Git object hardlinking). Verify canonical safe source and private runtime, tracked plain-file inventory, exact original HEAD and fixed GitHub origin, main and clean runtime, owned script and private parent. LaunchAgent now executes `runtime/scripts/chatgpt-loop.sh`, never any path under Documents. Runtime self-updates use the SAME existing candidate-tested fast-forward updater, but apply to the independent runtime clone, not the original Documents repo. Existing LunaDrive chat state and one-shot claims are reused without copying or resetting. Since background launchd can also be denied Desktop access, private task Markdown reports go under `~/Library/Application Support/ioant-openclaw-ops/reports/chatgpt-loop` only in background mode; foreground report behavior stays unchanged. Login plist still redirects stdout/stderr to local `~/Library/Logs/ioant-openclaw-ops`. The **two** previous exact Documents plist templates (external and local logs) are recognized for explicit bootout/uninstall; unknown services are rejected.

This is staging, NOT yet verified on Mac. Next Mac local action: execute fixed test-gated project-self-update.mjs from the existing interactive Documents source; only on full pass perform safe explicit uninstall, install (creates private runtime), and inspect status including PID. If a step is blocked, stop and inspect, don't remove stale private runtime or script locks. Even a status `running` must be followed by a new ChatGPT GUI-only read-only probe before considering the browser communication healthy. Full rationale and operators' commands: `docs/OPS_SUPERVISOR.md`.


## 2026-10-25 — Runtime isolation candidate blocked at test 25 (archive-relative legacy path)

User ran the existing fixed Mac update/install/status chain while known old Supervisor was still stopped. `project-self-update` failed safely with `candidate_tests_failed`: `341 tests / 340 pass / 1 fail`, at `test/ops-runtime-isolation.test.mjs:25`. The chained shell command stopped BEFORE uninstall or installation. Mac remained on known-good source HEAD `b53b979f867d68384c12e90f8c5e120c38ecee3f`, and legacy Documents-targeted LaunchAgent (lastExitCode 126) remained unchanged.

The updater deliberately tests code extracted into a private, random candidate directory under LunaDrive before applying a Git fast-forward. The prior candidate built `LEGACY_ARGS` using source-derived `ROOT`, which points to the temporary candidate test directory during this gate. However the real *previously installed* LaunchAgent was created from the fixed `~/Documents/workspace/ioant-AI-Agent-Local-MacOS` checkout. Consequently the legacy recognition test expecting the old Documents path failed. The fix defines `LEGACY_REPO=join(HOME,'Documents','workspace','ioant-AI-Agent-Local-MacOS')` exactly, using it only for reconstructing known previous plist templates, independent of candidate or isolated runtime module root. The new launch argv remains the private `~/Library/Application Support/ioant-openclaw-ops/runtime` path.

A mocked candidate-directory reproduction now confirms legacy paths still match the original Documents installation, `installedPlistKind` identifies known legacy plists, and no test-candidate path leaks into the reconstructed legacy plist. Added regression checks for this invariant. No filesystem privacy, Gatekeeper, Node permissions, Gateway config, one-shot state or live service has been modified. **Native Mac 341+ tests and the subsequent runtime install/actual browser probe remain pending.**

Next: from the existing Mac Terminal (user has source TCC access), re-run fixed `bash scripts/dev-env.sh exec node stage2/project-self-update.mjs`, followed by the explicitly scoped `ops-supervisor.mjs uninstall`, `install`, `status` only if each prior step passes. A blocked test must never be bypassed. Verify the new LaunchAgent path and PID before sending a fresh GUI-readonly task.


## 2026-10-25 — Chrome All-tabs visibility is incomplete; same conversation ID but project URL changed

The operator provided two screenshots of Chrome windows, both using profile `tiw`, showing 3 ChatGPT tabs in one window and 1 ChatGPT tab in another. The actual OpenClaw Chrome extension popup shows `Connection: Connected`, `Automatic bootstrap ready`, `Access: All tabs`. CLI `browser extension status --json` reports automatic local pairing ready, enabled exact Store extension, no setup issues; `browser --browser-profile chrome doctor` reports healthy gateway/profile/extension 2.3.0 with 2 visible tabs. The user's read-only count query then showed `authorizedTabs=2`, `chatgptTabs=1`, `exactConversation=0`, **sameConversationID=1**. These observations disprove unsupported earlier assumptions about a different Chrome user, selected-tab group, disconnected extension or missing ChatGPT login. Four actual ChatGPT tabs versus one returned is still an independent OpenClaw relay/native target enumeration discrepancy; the watcher MUST NOT claim to see all tabs.

The watcher also has a separate deterministic bug: it pinned the full ChatGPT project URL rather than the immutable conversation ID, so a legitimate changed project path was rejected both in the shell launcher and in `exactTab`/readPage. Proposed fix: preserve the original configured URL and same chat state/one-shot task key, but recognize an eligible tab only if BOTH URLs pass the existing HTTPS chatgpt.com strict `/c/<id>` or `/g/<project>/c/<id>` validator and their final conversation IDs match. Require exactly ONE matching exposed tab, reject duplicate IDs and unrelated paths/queries/fragments/origins; after resolving, revalidate the actual browser DOM URL by the same predicate before page reads or sends. No auto-navigation, extra tab access, privileged browser APIs or model-granted tools. New tests cover project relocation, duplicate tabs, malformed same-ID imposters and the shell count parser.

The browser extension's documented All-tabs mode should make eligible ordinary tabs accessible but does not itself prove native target enumeration complete. If the watcher still sees only 2 tabs after this fix, collect sanitized CLI/browser doctor state and, if needed, diagnose Chrome native attachments/paused tabs or other debugger clients. Do not change All tabs to Selected, rotate pairings, reinstall Chrome or reset Gateway without separate evidence. The Supervisor is currently stopped after an otherwise successful isolated-runtime launch; last error `No exact target tab among 1 authorized tabs (0 on ChatGPT)`. No real browser feedback, task 074/075 success, or model development action should be claimed yet.

The installed supervisor LaunchAgent points at private `~/Library/Application Support/ioant-openclaw-ops/runtime`; it is sufficient to run the full test-gated `stage2/project-self-update.mjs` separately in the operator's Documents source checkout and in the private runtime checkout (both have exact origin/main), then `launchctl kickstart` once and check PID/logs. No uninstall/reinstall is required for a code-only change, and any blocked test aborts the chain. Candidate full Mac tests and browser acceptance remain pending.
