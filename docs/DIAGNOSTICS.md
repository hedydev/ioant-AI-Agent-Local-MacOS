# Diagnostic Sessions — CLI Worker

Profile: Hero Skills `cli-worker`. Every audit invocation creates a UTC timestamp + random correlation ID (runId). Runtime emits compact diagnostic JSONL lines in a private, site-specific directory on LunaDrive:

```text
/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/audits/
  example/
    events.jsonl
    state.json
    <UTC-runId>.md
```

Events: `audit_started`, `unchanged`, `report_written`, `audit_failed`. Each includes `runId`, timestamp, and site ID; successful scans also include the snapshot SHA-256 and model assessment severity. Models never receive executable tools.

Outputs exclude raw browser snapshots and screenshots. Errors are bounded and redacted; reports are 0600, directories 0700 when created under the project wrapper. Watch mode has no external daemon or hidden scheduling. There is no automatic rollover/retention or ZIP export in stage 1, documented as a gap.

Incident response: stop foreground watch with Ctrl-C; inspect this folder and `openclaw gateway status`, then share only manually reviewed redacted excerpts. Never share full browser profile directories, cookies or system tokens.

Verification (pending on user's Mac): run one successful audit, one unchanged audit and a deliberately unavailable site. Check corresponding JSONL events and report. Confirm raw snapshot absent and no commands were executed from page content.
