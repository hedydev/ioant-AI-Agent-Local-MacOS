# Deterministic remote branch deletion — 2026-11-06

User request: improve generic MCP execution so an explicitly authorized remote
branch delete uses fixed Git argv directly, never local model reasoning. WinCat
is the motivating report, not authority to replay its uncertain operations.

Implemented action: repository_delete_branch, required branch, optional
expected_branch_commit; no task JSON, model, clean checkout or local HEAD pin.
Preflight validates enrolled origin/default/current branch and branch tip. Delete
uses exact force-with-lease against that ref and verifies remote absence. Local
checkout is unchanged. Same-ID cache survives; changing branch/tip conflicts.
Timeout or failed mutating push keeps the project lease for reconciliation.
No reset/stash/checkout/clone/user-code script is involved.

Read-only current observation: WinCat's two recent computer attempts are final
inconclusive/agent_run_timeout; no native reservations or repository leases were
present. This does not prove earlier branch commands never ran or authorize replay.
No WinCat repository mutation or branch deletion has been performed in this Chat.

Five focused tests pass, including real async admission + fixed runner against a
local bare Git remote, remote absence verification, unchanged dirty file/index/HEAD,
and same-ID no-repeat. Full suite and cloud deployment results are recorded below.

Full regression:1400/1400 passed at concurrency4, zero failures/skips/cancellations. Cloud tool catalog rollout still pending at source commit; no WinCat deletion executed.
