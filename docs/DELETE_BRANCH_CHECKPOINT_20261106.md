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

Full regression:1400/1400 passed at concurrency4, zero failures/skips/cancellations.
Source commit187335ea7ddec632c17e1e7eb67de5caa9d24fb5 was pushed and verified
against origin/main. No WinCat deletion executed.

## Deployment and read-only acceptance

On 2026-11-06 at approximately17:47 Asia/Shanghai, after verifying native lane
idle, zero waiting tasks and zero executing fixed tasks, the existing console's
memory-key restart loaded the new MCP child. Web was not restarted and its key
was not read/recovered. Healthy managed Tunnel PID1232 replaced84700, with ready
polling at local health endpoint127.0.0.1:50076. Subsequent unrelated repository
execution was observed passed in the UI; it was not initiated by this acceptance.

Real cloud openclaw_project_actions returned repository_delete_branch enabled
for both openclaw-workflow and repo-ioant-wincat-7a1cac1f0b, with no model,
no task file, no clean-worktree requirement and no required local commit pin.
This proves backend rollout, not deletion of any business branch.

The current Chat's cached project_execute definition still has the old action
enum and no branch parameter. Refresh tools in OpenClaw Mac plugin management
is the remaining caller-catalog step. Chrome was in active use; UI control was
interrupted, so no attempt was made to interfere with that chat or send messages.
Do not route deletion back through Gemma or claim caller-schema acceptance.

After Refresh, verify project_execute.action includes repository_delete_branch
and a branch string field. For an explicitly authorized exact target use:

```json
{
  "project_key": "<registered-project>",
  "conversation_key": "<current-chat-key>",
  "operation_id": "<unique-operation-id>",
  "action": "repository_delete_branch",
  "branch": "<exact-authorized-remote-branch>"
}
```

Poll project_result using the same project and operation ID. Success requires
branchDeletion.remoteAbsenceVerified=true, or an alreadyAbsent result accurately
reported as previously absent. Unknown results are reconciled, never resubmitted
under another ID. Default and currently checked out branches remain protected.
