# Stage-1 security model

## Trust boundaries

Operator-approved `config/sites.json` is the only watchlist. Runtime selects an **exact pre-existing tab** by OpenClaw browser profile and URL; it cannot click, type, evaluate JavaScript, navigate, submit forms, log in, SSH, install apps, or run page-supplied shell commands. The only subprocess is a fixed OpenClaw executable with fixed `browser tabs` / `browser snapshot` subcommands and selected profile/target arguments. No shell interpolation is used.

Browser snapshots are **untrusted input** and may contain prompt injection. A local Ollama call receives a bounded redacted snapshot; model replies are parsed as data, not commands. There is no agent tool interface exposed to that model.

Ollama endpoint must resolve to a literal HTTP loopback hostname. A remote/cloud URL is rejected. Model names, site ids and browser profiles are syntactically restricted. HTTPS site allowlisting and explicit operator tab opening are required.

## Privacy limitations

Best-effort redaction masks some tokens/emails/credentials and PEM keys before model prompt and before generated reports. It cannot promise to find every secret. Do not put logged-in personal inbox, banking, password manager, health or admin secrets into phase-1 watchlists. No raw snapshot or screenshot is stored by this project. Error text is bounded and sanitized, not a full stack trace.

Private report files and diagnostic events are created with permissions 0600; directories 0700 under an explicit data root. OpenClaw itself may separately log/store sessions; consult its retention and browser profile documentation. No credential import, Chrome extension installation or cookie synchronization is performed by these scripts.

## Installation & operator permissions

Never pipe remote installer code through a shell without operator review. Manual OpenClaw installation and Gateway startup are separate, documented operations. Keep Gateway bound to loopback and require its authentication. Use a dedicated browser profile. Don't attach this project to ChatDock's controlled profile or Chrome Bridge simultaneously.

## Out of scope

No automatic notifications, page-induced commands, changes to Git, file mutation outside private output and cache, browser mutation, network scanning, or remote Mint operations. Adding these requires new threat-model review and user approval.

## Diagnostics

Each audit has a run ID; JSONL logs contain timestamp, site ID, outcome, snapshot hash and bounded redacted error. Reports include observations vs uncertainties. No full model conversation or raw HTML is persisted. On failure, status is FAIL, not "passed".

## Local environment inventory privacy

The new read-only registry inspects bounded executable locations and Ollama loopback `/api/tags`. It reports executable paths with the home directory shortened to `~`, tool names and model names. Its `latest.json` stays under private LunaDrive storage, not this public GitHub repository. Do not post private inventories or enable remote registry serving automatically. Detection does not imply permission to start, install, execute, or configure programs.

## Evidence-v2 trust and privacy limits

Never use model-generated quotes as evidence. Construct snapshot line IDs and excerpts deterministically from redacted browser output; models may only return those IDs. Reject missing/invalid source IDs as unsupported claims rather than pretending they were verified. Source citations are provenance pointers, **not** semantic/factual, visual or functional verification. Treat even valid-citation interpretations as model assessments.

Each source excerpt is bounded and is included only for cited observations. Redaction remains best-effort, so excerpts can still expose sensitive information; prohibit login/secret-bearing pages until stronger privacy controls have real tests. Preserve no raw full-page snapshot. Changes to evidence version must not silently reuse stale old-schema reports.
