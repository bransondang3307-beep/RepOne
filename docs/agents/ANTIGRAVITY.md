# Google Antigravity — RepOne session instructions

Use with [Lenovo Windows onboarding](ANTIGRAVITY_WINDOWS_SETUP.md). Shared project
rules live in [AGENTS.md](../../AGENTS.md); changes to shared policy belong there
through a coordinated PR, not a competing copy here.

## Role and scope

Antigravity is an editor/agent environment, not a replacement project coordinator.
Preserve the roles in `AGENTS.md`: Claude Code implements; Codex tests, debugs and
reviews; Gemini researches architecture/design; ChatGPT coordinates; the owner
approves scope, merges, and tests devices/hardware. Use Gemini's documentation and
research scope by default. An owner assignment may explicitly authorize a different
task and file set; record that assignment without silently taking another agent's work.

For task-board identity, use the assigned agent name, not the model currently
selected in Antigravity. Research assigned to Gemini uses `gemini/<TASK-ID>-<slug>`;
Codex work uses `codex/...`; a new Antigravity task identity requires an explicit
owner/ChatGPT assignment. Never claim an independent review of your own implementation.

## Read and sync before every task

1. Check `git status --short --branch`, repository root, remotes, and current commit.
   If files are dirty or another agent is working in this checkout, preserve them.
   Agree file ownership before switching branches. Use a separate checkout for
   concurrent agent work; one shared directory has one active branch for everyone.
2. Fetch with `git fetch origin --prune`. Read current `origin/main` versions of
   `AGENTS.md`, `REPONE_SOURCE_OF_TRUTH.md`, `PROJECT_STATUS.md`, `TASKS.md`, newest
   `docs/handoffs/` files, accepted ADRs, and `README.md`, in the shared reading order.
   Inspect open PRs and their handoffs too: status documents may lag GitHub.
3. Read this guide explicitly. Read `apps/mobile/AGENTS.md` before mobile work.
   Inspect actual paths and scripts: the current routes are `apps/mobile/app/`;
   the mobile instruction's generic `src/app/` statement conflicts with the tree.
   Report that discrepancy; do not move routes as an onboarding step.
4. State implemented vs planned behavior, your task ID, assigned agent, allowed files,
   base SHA, and dependencies. Stop unassigned implementation and ask the owner/
   ChatGPT to assign it. Read-only orientation is allowed without taking a task.

Follow the precedence in `AGENTS.md`; owner decisions supersede repository plans.
Code and executed tests establish implementation, not a handoff's aspirations.

## Architecture and milestone guardrails

As of `main` @ `2959751` (2026-10-28), Milestone 1 is merged (PR #3, `cd884fc`;
ADR 0003). The pure-TypeScript packages are `@repone/sensor-contracts`,
`@repone/rep-engine` and `@repone/workout-domain`. `apps/mobile` uses Expo Router
routes in `apps/mobile/app/` and the `src/application`, `src/features`, `src/shared`
and `src/infrastructure` layers, with Zustand and expo-sqlite. `npm run
check:boundaries` enforces the module boundaries. Keep units and provenance
explicit. No new framework, dependency migration, detector tuning, sensor contract
change, or native project generation is part of onboarding.

RO-008 addresses the ownership table in `docs/architecture.md` §6 separately.
Milestones 2–5 are Sprint 1 alignment work, gated by previous merges and owner
approval. **Milestone 2 (RO-012) is paused by the owner:** its stacked PRs #14–#17
are open and unmerged. Do not treat them as merged, build on them, or merge them.
Sprint 2 has not started.

Rep data remains simulated. No verified real sensor-to-app path, hardware accuracy,
or owner Expo Go success is established by these documents. Keep those gates open.

## Work, review, and handoff

- Confirm the task is assigned in `TASKS.md` and no open PR owns the same files.
  An explicit owner instruction for a documentation follow-up can name that scope;
  record it in the handoff and coordinate the board entry rather than editing a
  task board already owned by another open PR.
- Create the assigned agent's task branch from `origin/main`, unless explicitly
  assigned a different base. Never commit to `main`. Prefix commits with the task ID.
- Run `npm run verify` (module boundaries, workflow policy, typecheck and tests).
  In PowerShell, check each exit code and stop after failure. Record commands,
  counts, failures, and environment. Docs-only changes follow `AGENTS.md`'s docs
  exception; configuration changes require its additional test check.
- Add a dated handoff using `docs/handoffs/TEMPLATE.md`, including assignment,
  branch/base, changes, checks, limitations and the exact next task.
- Inspect the diff, stage only assigned paths, push the branch, and open a PR to
  `main` using `.github/pull_request_template.md`. Record the PR URL in the handoff
  and only your task row when it is safe to update it. Code PRs require independent
  Codex or owner review and green CI before the owner merges. The Codex review
  hand-off is in `docs/automation/claude-codex-workflow.md`.
- Never mark unmerged work `done`. After merge and green CI on `main`, follow
  `AGENTS.md` §3 step 9 (owner decision of 2026-10-28): the agent that completed the
  work opens its own status-update PR. Only Claude Code may also record the owner's
  device checks, Codex review tasks and closeouts the owner explicitly directs.
  Do not update other agents' rows or silently reconcile stale status.

Use exactly `todo`, `in-progress`, `in-review`, `done`, `blocked` for task status.
Report objective, files changed, actual checks/results, risks, and next task.

## Safety boundaries

- Review proposed terminal actions and file changes in Antigravity. Keep execution
  approval enabled; onboarding does not authorize unrestricted autonomous commands.
- Never reset, clean, force-push, discard edits, delete branches, or overwrite another
  agent's changes to make synchronization succeed. Resolve conflicts visibly.
- Never commit tokens, `.env`, health data, identifying gym photos, or local account
  settings. Authenticate in the official sign-in UI; do not paste passwords into chat.
- No API keys, paid automation, deployments, EAS publishing, firmware flashing, or
  production migrations are authorized by this setup task.
- **Zero additional AI API cost** (owner rule, ADR 0005; `AGENTS.md` §5). Development
  uses subscriptions only; for Antigravity that means signing in with the owner's
  Google account. Never add AI API keys or tokens, paid AI services, AI actions or
  AI SDK dependencies. `npm run check:workflows` enforces this in CI. The old
  API-powered review loop (PR #4) was closed unmerged and is archived; do not revive it.
- Hardware stays on a controlled unloaded rig. Verify components and voltage before
  wiring, disconnect USB while wiring, and do not attach prototypes to active gym equipment.

## First prompt to paste into Antigravity

```text
Open RepOne on my Lenovo Windows laptop. Read ANTIGRAVITY.md and
docs/agents/ANTIGRAVITY.md explicitly, then the current shared files in AGENTS.md's
reading order and relevant open PRs. Start with a read-only setup audit: report the
actual repository path, dirty files, branch/SHA, Node/npm/Git versions, package
scripts, merged vs unmerged architecture, and the next assigned task. Preserve
Claude/Codex/Gemini/ChatGPT roles, owner-only device testing, the $0 AI API rule,
and the Milestone 2 (RO-012) pause. Do not install, edit code, switch a dirty
checkout, add automation, or merge.
Give me the next setup command justified by what you actually observed.
```
