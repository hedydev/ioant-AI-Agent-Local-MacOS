# Invalid task recovery receipt (2026-10-27)

A previous inline mac-terminal command exceeded the protocol 2048-character limit. The watcher remained live but logged invalid_task every ~2 minutes without sending an actionable error back to ChatGPT. This is a workflow deadlock, not an OpenClaw or Ollama crash.

This change does **not** relax input validation or execute malformed tasks. Only a JSON code block in the last complete assistant turn with exact protocol, safe ID, known action, a single code block, and successful parsing is eligible for a correction receipt. No untrusted task strings, command text, raw page DOM, credentials or system prompts appear in receipts. Confirm the exact authorized ChatGPT tab and two stable reads. Persist pending feedback before typing, persist press-intent before Enter, and reconcile via the existing user-message receipt mechanism. Each task ID is reported at most once. Other rejected snippets retain the old safe no-execution behavior.

Long-running task bodies belong in reviewed version-pinned source files under stage2/tasks. Keep short ChatGPT task envelopes. The 2048 character and 4096 byte safety limits remain unchanged.

After updating the Worker, run the full regression suite; then use an *intentionally malformed, harmless* task to verify the exact-chat correction receipt and follow-up. Do not use production commands to test malformed reporting. Any ambiguous feedback delivery must not cause replay or re-press.
