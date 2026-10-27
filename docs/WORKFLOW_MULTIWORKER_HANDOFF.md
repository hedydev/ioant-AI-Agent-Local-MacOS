# IOANT Multi-Worker / Agent Binding / Handoff

Status: 2026-10-27, experimental foundation. This document distinguishes working code from live-tested deployment.

## Verified environment
- Existing mac-ops-01 LaunchAgent is running with ChatGPT Project exact conversation 6adfdfb9-65b0-83ec-b6ac-155e7852c6af; latest live task receipts are confirmed by that conversation.
- The existing project-update-verify action has a prior live, fixed-origin main fast-forward test and feedback-then-reload acceptance. Each new code revision must pass its own gate.
- Gateway 2026.10.7 remains loopback; Tailscale Serve foreground HTTPS 443 -> loopback was independently witnessed on 2026-10-27.
- The Google Drive native sheet was created and read back: https://docs.google.com/spreadsheets/d/1fIt5ptZh_OjveG4RDx15s7OyR4NdQtD5Bk0RGk3O_PQ/edit

## Implemented this revision
- stage2/workflow-engine.mjs: pure, deterministic revision-checked workflow reducer.
- Each Workflow has task DAG, capability-scoped Workers, explicit Agent-to-Worker binding, immutable task execution receipts, and separate acceptance before an item unblocks dependents.
- Task split preserves superseded parent and requires each child to be accepted. Cancellation requests do not promise rollback; running tasks require evidence of confirmed stop before cancellation.
- Voiding a running task is refused; state mutation events use unique IDs and compare expectedRevision.
- Binding Agent identity supplies attribution and routing only; it never grants model tools, shell, SSH, browser writes, or additional capability.
- test/workflow-engine.test.mjs exercises dependencies, receipts, cancellation, splitting and capability isolation.
- config/chat-projects.json now points to the live bound Project conversation instead of a previously retired conversation.

## Not implemented yet / do not claim ready
- Workflow reducer does not schedule/execute subprocesses. No second live Worker exists, and multi-process leasing/persistent CAS has not been integrated with the watcher.
- Google Sheets is a read-only-friendly dashboard and human-readable projection, not a trusted source for executable instructions. Automated bidirectional Sheets sync and credentials are not configured.
- Existing chat-handoff.mjs and handoff-journal.mjs provide staged safeguards; they do not themselves create/send a new Project chat or rebind the LaunchAgent.
- No ChatGPT token-remaining percentage is available to the Worker. A manual trigger and exact application-level context-limit banner are trusted signals; measured slowdown is advisory until reproducible.
- OpenClaw App image handling and Ollama response times are pending benchmarks. AliceAI production services remain untouched.

## Required safe operation lifecycle
1. Coordinator creates Workflow / Task IDs and validates dependencies and separately granted capabilities.
2. One Worker claims a task with a unique lease; model-produced text alone cannot authorize arbitrary execution.
3. Each attempt emits an immutable Receipt ID and evidence digest. Completion is verification_pending until separately accepted.
4. Cancellation becomes cancel_requested, then cancelled only with stop evidence if execution began. Never call this rollback.
5. A split parent is superseded; downstream tasks depending on the parent wait for every child to be accepted.
6. Uncertain operation results are not automatically retried. Preserve original state and audit evidence.
7. Cross-chat handoff: create successor within the exact Project, deliver handoff, verify user-role receipt, stop old watcher, rebind and start, prove new-chat canary, then promote active route.
8. Watcher updates: fixed origin/main only, pretest candidate, ff-only, confirm feedback before reload; never reset/clean/stash/force-push or restart Gateway/Alice BDS.

## Separate sources of truth
- Git main task ledger remains canonical for development task identities and human acceptance under Hero Skills development governance.
- A future private durable local execution ledger on LunaDrive should own leases and receipts. Sheets is a synchronized projection; it must never become a remote command queue just because a cell was edited.

## Planned phases
- P1: full Mac node --test and project-update-verify feedback; verify running Worker consumes updated runtime.
- P2: durable local ledger and coordinator; second isolated Worker, robust heartbeat/de-duplication, fixed capability manifests.
- P3: same Project new-chat creation/send/receipt/rebind end-to-end; detect slowdown with trustworthy evidence.
- P4: Ollama cold/warm generation benchmarks, per-Agent selection, app image ingestion test, then AliceAI service discovery.

## Mac operator fallback if self-update is not delivered
On the Mac, in the validated repository checkout:
  cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
  git fetch --no-tags origin main
  git status --short --branch
  git pull --ff-only origin main
  bash scripts/dev-env.sh exec node --test
Do not manually restart the running worker or copy code into its private runtime until its self-update state and exact launchd target are inspected. The fixed project-update-verify action is the preferred update path.
