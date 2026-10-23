# Development Environment — ioant-ai-agent-local-macos

- Mac host: Apple Silicon macOS (operator machine)
- Root: `~/Documents/workspace/ioant-AI-Agent-Local-MacOS`
- Canonical environment entrypoint: `scripts/dev-env.sh`
- Hero Skills: `development-environment-storage`; `/Volumes/MacDev` retired
- Last verified on real Mac: **pending** (repository code prepared 2026-10-23)

## Storage

```text
/Volumes/LunaDrive/DeveloperCache/
  npm-cache/                                    # shared downloads
  projects/ioant-ai-agent-local-macos/
    audits/                                     # PRIVATE stage-1 reports + events
```

Source files stay on normal project checkout; large dependencies/caches belong on LunaDrive. `scripts/dev-env.sh` refuses missing/unmounted/unwritable volume; never silently falls back to Mac internal SSD. The repository does not use Rust, Gradle or Xcode, so no project Cargo target or DerivedData output is created. Node dependencies: none at this stage.

## Commands

```bash
bash scripts/dev-env.sh check
bash scripts/dev-env.sh exec node --test
bash scripts/dev-env.sh exec node src/audit.mjs --once --id example
source scripts/dev-env.sh
bash scripts/dev-env.sh shell
```

The wrapper checks resolved npm cache when npm is available; inherited environment variables and known dotfiles are screened for retired `/Volumes/MacDev` references. Alternate **mounted** volumes may be selected explicitly using `IOANT_DEV_VOLUME=/Volumes/OtherDisk` and are an operator-controlled exception, not a fallback.

## Validation

| Check | Status |
| --- | --- |
| Dev env script syntax | pending container test |
| Mac physical volume check | requires Mac |
| Resolved npm cache | requires Mac |
| Live audit files on LunaDrive | requires Mac |
| No legacy inherited paths | requires Mac |

No automated deletion or relocation of existing caches or personal files.
