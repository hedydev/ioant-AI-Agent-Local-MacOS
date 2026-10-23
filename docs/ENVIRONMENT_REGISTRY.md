# Local Environment Registry — Phase 1

## Problem and authority

Chat conversations and project docs are **not** reliable live inventories. A tool may be installed but off PATH (e.g. Android platform-tools), a service may run on a nondefault port (Ollama 11435), or a documented state may be stale.

**Canonical live source:** this repository's read-only local scan, stored privately on the Mac. **Canonical reusable rules:** Hero Skills. **Canonical project requirements:** each project's docs/config. Do not duplicate volatile host status in Hero Skills or a public Git repo.

## Mac Terminal

From this repo:

```bash
# No disk writes, no installers; stdout only:
node src/environment.mjs scan

# Save latest private JSON inventory on mounted LunaDrive:
bash scripts/dev-env.sh exec node src/environment.mjs save

# Check current phase-1 essentials; nonzero if needs repair:
node src/environment.mjs check

# Continue normal preflight (which now scans environment first):
bash scripts/preflight.sh
```

Private JSON file:
`/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/environment/latest.json`

The scan checks PATH, known Apple Silicon/Homebrew/local executable locations, and a **bounded, shallow** `~/Downloads/*/platform-tools/adb` pattern. It then probes only `http://127.0.0.1:11435/api/tags` and `http://127.0.0.1:11434/api/tags`, returning model names. No password/token/profile data, hostname, username or MAC address is collected. Home prefix is displayed as `~`.

## Status semantics

- `on_path`: executable found and executable bit set in a PATH directory. Does not prove its behavior.
- `found_off_path`: executable exists in a checked known location but isn't available as an ordinary shell command; set PATH or use full path, **do not reinstall automatically**.
- `not_detected`: not found in the bounded inspection; **not proof of not installed**.
- Ollama `reachable`: local model catalog API responded with expected JSON, **not proof of inference or model suitability**.
- `check` compares requirements and labels `ready`, `needs_path`, `not_detected` and `not_ready` without modifying the computer.

## How other AIs can use this

1. **Local OpenClaw / other local agents:** read the latest JSON after running an up-to-date scan; if older than the chosen freshness threshold, ask the operator to refresh or perform an authorized read-only scan.
2. **Cloud ChatGPT:** it does not automatically see private files on your Mac. Share a reviewed JSON summary, or build an explicit authenticated connector later. This phase deliberately does not expose an HTTP service or auto-push snapshots.
3. **Cross-project assistants:** consult the same local JSON before proposing downloads or environment changes; verify real tool versions and actual health where required.
4. **Never interpret a model's recollection as stronger evidence than a fresh local probe.**

Limitations: not a full installed-app audit; some applications may live in unscanned paths; no OpenClaw Gateway health assertion from mere binary discovery; the port catalog is not a full Ollama inference test. New detection targets should be added with tests and privacy review. No scheduled scans, network discovery, remote shell or web dashboard in phase 1.

## Independent OpenClaw CLI detection

Following the first Mac bootstrap, the private executable lives at `~/.openclaw/bin/openclaw`. Environment scan now inspects that known location and reports `found_off_path` when it is not on the current shell PATH. Preflight can reuse this exact existing executable without changing fnm defaults or installing another runtime.
