# ADR 0011 — Supervised local development coordination

- Date: 2026-11-09
- Status: Proposed for review. Implementation authorized by the owner; local execution activation is not authorized.
- Scope: RO-034 Phase 2; follows merged PR #44 and coexists with open PR #38.

## Context

The owner requests bounded local Claude Code/Codex coordination, independent worktrees, deterministic state,
complete current-head review/CI gates, and a project-agnostic architecture path. ADR 0005's subscription-only
spending rule and manual merging remain binding. PR #38 provides GitHub summaries and a manual runbook;
it does not implement a local launcher. No overlapping #38 files are changed here.

## Decision

1. Keep Phase 1 read-only. Add a separate supervised CLI and neutral state machine with private per-project
   configuration. Allowlist task IDs, PRs, branches and merged prerequisite PRs; never infer execution authority
   from a GitHub comment or issue. Task assignment and non-machine-verifiable conditions require owner confirmation.
2. Each launch requires a foreground interactive approval tied to configuration, task, action, full head SHA,
   journal sequence and pinned executable. Refresh evidence after approval. Use native executables without a shell,
   restrictive CLI flags, subscription authentication checks and a small forwarded environment. There is no batch
   launch, unattended mode, saved approval or automatic next session.
3. Serialize all worktrees/configs of one Git repository using a common-directory lock and a permanent state
   directory binding. Append and flush the reservation before starting an agent. The hash-linked journal is the
   recovery record. Never replay uncertain launches; preserve consumed rounds and escalate to the owner.
4. A task may have one explicitly allowed draft implementation, then at most two fix rounds. Existing maintainer
   PR round records are a floor. A new head, a new task label, recovery or re-enrollment cannot refund a round.
5. Claude works in its task worktree; Codex reviews the same SHA in a different clean worktree/branch. Local
   review output is advisory. Reuse Phase 1's authenticated GitHub Codex review evidence; require current-head
   workflow completion and every configured job in the matching suite before reporting an owner merge decision.
6. No controller GitHub writes, pushes, approvals or merging. Conditional auto-merge stays disabled and requires
   a separately approved design. Do not create scheduled jobs, install CLIs or enable the private execution switch
   as part of this implementation task.

## Consequences and boundaries

- Existing subscriptions are used; no AI SDK, API call, provider credential, paid infrastructure or new dependency
  is added. Native CLI/account settings and paid-overage controls still require owner verification before rollout.
- This controller coordinates an owner-supervised workflow. It is not an OS isolation boundary against a malicious
  same-user process. CLI plugins/managed settings and branch ownership must be reviewed before the pilot.
- A 30-minute timeout bounds one parent session. Surviving subprocesses require owner inspection; interrupted tasks
  remain blocked. Automatic reset/unblock and journal repair are deliberately absent.
- Queue enrollment and manual branch preparation add owner steps. They avoid selecting work, overwriting worktrees
  or consuming subscription capacity without a concrete approval.
- There remains a remote-head race after the last read; this phase requires exclusive human branch ownership and
  stopping if an external push occurs. Merge decisions must always be rechecked at the actual current head.
- The journal is integrity-checked, not signed against its owner. Backup and preserve it; deleting it is not recovery.

## Future extraction

The pure policy/state module, durable store, orchestration ports and GitHub/Git/CLI adapters are separate. Repository
identity, base branch, workflows/jobs, worktrees and task allowlist are configuration. A later standalone package can
reuse the schema and replace provider/task-board adapters without embedding RepOne names or application code.
Multi-project scheduling, remote dispatch, new billing methods and conditional auto-merge are outside this decision.

## Validation

Focused tests cover gate failures, two-round reservations, state identity, corruption, lock/binding conflicts,
authentication settings, approval refusal and stale evidence, durable-before-launch ordering and timeout recovery.
All launching tests use fakes. See the handoff and PR for exact executed results and rollout blockers.
