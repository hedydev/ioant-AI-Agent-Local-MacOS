# Rust build environment in fixed MCP tasks

## Reproduction

Drama Studio reported `rustup could not choose a version of cargo to run ... no
default is configured`. This was reproduced with the exact sanitized execution
environment and `/Volumes/LunaDrive/DeveloperCache/cargo-home/bin/cargo --version`.
The installed proxy was found, but RUSTUP_HOME was absent and Cargo selected
`/Users/ted/.rustup`, whose settings have no default_toolchain. That directory
also contains an installed stable toolchain, so absence of a default is not
evidence that Rust itself is uninstalled.

Existing `/Volumes/LunaDrive/DeveloperCache/rustup-home` has a configured stable
toolchain. With explicit CARGO_HOME and that RUSTUP_HOME, the same proxy reports
Cargo1.99.0 successfully. Homebrew's separate rustup wrapper can resolve a default
through its own fallback settings; that does not configure the standalone Cargo
proxy. Locating cargo alone is insufficient for a relocated Rustup installation.

Rustup documents RUSTUP_HOME as the toolchain/config root, and requires relocated
installations to keep both home variables plus Cargo bin on PATH:
https://rust-lang.github.io/rustup/installation/index.html
RUSTUP_AUTO_INSTALL=0 disables automatic toolchain installation:
https://rust-lang.github.io/rustup/environment-variables.html

## Scoped implementation

An optional owner-private repository-build-environment.json enrolls existing
volumeRoot/cargoHome/rustupHome/targetRoot paths. It is local operator configuration,
never MCP request input or task-supplied arbitrary environment. Existing profile
changes need separate review. Configure only after the no-install version probes
succeed. Publication does not overwrite a competing existing configuration.

Each repository_task step loads and validates the profile: actual mounted volume,
canonical owner-controlled existing directories and executable Cargo/Rustc proxies
whose targets remain inside the configured Cargo bin. Missing/unsafe/unmounted
configured storage fails explicitly, never falls back to internal disk.

The step gets CARGO_HOME, RUSTUP_HOME, Cargo bin prepended to the sanitized PATH,
RUSTUP_AUTO_INSTALL=0 and CARGO_TARGET_DIR under targetRoot/<checkout-name>.
Project rust-toolchain files still select their required installed version; no
RUSTUP_TOOLCHAIN override is imposed. Repo-owned dev-env scripts may refine their
project environment. Script code remains trusted user code, not an OS sandbox.

Git/health/transport and native model/desktop environments remain unchanged. This
does not modify Gateway, shell startup, global Rust defaults, credentials, models
or business repositories. It does not claim to repair arbitrary Gemma-authored
terminal commands. Rust builds/tests should use committed fixed repository tasks.

## Maintainer and acceptance

```bash
bash scripts/dev-env.sh exec node scripts/configure-repository-build-environment.mjs \
  enable /Volumes/LunaDrive \
  /Volumes/LunaDrive/DeveloperCache/cargo-home \
  /Volumes/LunaDrive/DeveloperCache/rustup-home \
  /Volumes/LunaDrive/DeveloperCache/cargo-target
```

This probes installed rustup/cargo/rustc read-only, without changing the default
or downloading a toolchain. Profile contains no secrets and remains outside Git.
Existing default settings hashes are compared before and after actual enrollment.

The committed `.openclaw/tasks/rust-toolchain-status.json` provides a45s,
model-free, read-only acceptance through the actual MCP fixed runner. It only
reports tool versions, configured cache homes and automatic-install state. New
detached job processes load the updated code/profile; no Tunnel/Web restart or
plugin schema refresh is needed. This is toolchain readiness, not a Tauri build.

Four targeted tests cover credential/override filtering, target separation,
operation/output identity, no-profile compatibility, unavailable volume, private
configuration, malformed paths and unsafe executable symlinks. Full regressions,
actual enrollment and MCP receipt/report evidence are recorded below.

Full1414/1414 tests pass both without the profile (41.8s) and after real profile
enrollment (40.7s), zero failures/skips/cancellations. Enrollment reused the
existing external stable toolchain: cargo1.99.0/rustc1.99.0. Both internal and
external rustup settings hashes stayed identical. No toolchain was installed,
no global default changed, no model/service was started. Actual MCP acceptance
follows after the source commit is pinned.

## Actual MCP acceptance

Source ff1d9e8bb4c0d6b7390019d3b8727019610a4c18 was pushed and remote main
verified. Without restarting Tunnel/Web/Gateway, actual MCP project_execute ran
the pinned current-workspace status task once under openclaw-workflow, operation
`workflow_rust_env_accept_20261106_k4n8v2cs_01`. It returned passed/cached=true,
exitCode0, no timeout, modelInferenceInvoked=false and worktreeClean=true. Reading
its467-character log through project_report confirmed cargo/rustc1.99.0,
external Cargo/Rustup homes and the infrastructure project's separate target dir.
Log SHA2568fdafeb5c46a43b722b4e50a190f7f9003e2084c9d020d49e828f7848defb69d.

An additional bounded read-only local command under the identical profile ran
`cargo metadata --locked --offline --no-deps` against Drama Studio's Tauri manifest.
It returned0, packageCount1, targetDirectory ending cargo-target/ioant-ai-drama-studio.
At this observation the business checkout had independently advanced to9a3fbe0;
the maintainer did not sync/edit it. Its original untracked package/Cargo locks
and generated directory remained present. This check did not compile/download
dependencies, change a lockfile, start an application/service or run business tests.

This proves fixed-task toolchain routing and Cargo project discovery, not a passing
Tauri build or arbitrary model-driven terminal execution. No Refresh or service
restart is required. Project Chat should author its own committed Rust check task
under its own project key, preserving its existing files and task receipts.
