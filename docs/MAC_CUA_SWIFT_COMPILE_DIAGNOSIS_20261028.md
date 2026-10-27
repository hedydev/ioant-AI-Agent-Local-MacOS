# CUA Fixture compiler-stage forensics — 2026-10-28

## Live Mac evidence

154B failed before GUI launch with a broad fixture preparation error.
155B confirmed `diagnosis.phase=swift_compile` and
`diagnosis.category=swift_compiler_failed`; it reported no pointer, keyboard,
browser or desktop modification. The broad classification does not prove the
cause is a Swift source error. A ~291 ms operation is not enough to infer a
specific compiler/SDK/linker failure.

## New tool

`scripts/openclaw-cua-compile-forensics.mjs` performs *only* compiler
operations on the fixed, known fixture source:

1. `xcrun --find swiftc` — verify developer tool is resolvable.
2. `xcrun swiftc -frontend -parse Fixture.swift` — syntax.
3. `xcrun swiftc -typecheck Fixture.swift` — AppKit and Swift types.
4. `xcrun swiftc Fixture.swift -o <private temporary binary>` — link.

Compilation does not launch the resulting GUI app. The binary lives only
inside an owner-only private temporary directory and is removed.

The output includes only an allowlisted failed stage, categorized diagnostic,
exit code, unique compiler-output digest prefix and source line numbers in
`Fixture.swift`. It does not include full compiler stderr, arbitrary CLI
messages, filesystem paths, browser data or application inventories.

If all stages pass, `state=compiled`; that does not automatically mean the
original packaging/preparation tool has passed. Only after reviewing the
compiler-stage evidence should we correct original preparation and run it
again, keeping real `computer.act` input out of scope.

## Safely deploying

Deploy the exact new main commit via the existing `project-update-verify`
worker action and require full tests. Then run one exact-version `mac-terminal`
command:

`node scripts/openclaw-cua-compile-forensics.mjs`

from the pinned private runtime. No permissions, Gateway, Chrome, or AliceAI
configuration changes.
