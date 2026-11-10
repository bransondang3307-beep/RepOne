# Supervised local controller (RO-034 Phase 2)

Status: implementation proposed for review. **Not activated on the owner's computer.**
PR #44's read-only `scripts/dev-host/` remains unchanged. PR #38 provides a GitHub summary/runbook;
this separate local layer changes none of its files and creates no competing workflow.

## Operating model

The deterministic queue sorts explicit allowlisted tasks by PR number. It never discovers work and starts it.
The owner copies assigned work from `TASKS.md` into private per-project configuration, including all prerequisite
PR numbers. The controller requires those prerequisites to be merged into the configured base. Non-PR conditions,
task assignment, device checks and accepted finding scope remain explicit owner checks at each launch.

- `init`: creates a durable journal and binds it permanently to this repository's Git common directory.
- `enroll`: adds newly allowlisted tasks, retaining every historical task/PR identity and round count.
- `plan [task]`: reads live evidence and reports the next action; never launches an agent.
- `run task`: offers exactly one foreground session, after an interactive approval of its digest.
- `recover`: after the owner stops surviving processes, clears a dead controller lock and blocks interrupted work.

States/actions: explicit draft implementation → independent review → fix if needed → review again → owner merge
decision. Waiting evidence stays waiting; unknown data, conflicts and exhausted budgets block. Recovery never
resumes an agent. A local review is allowed once per head; its output is advisory. GitHub Codex review evidence
is still required for the merge-decision report. The controller does not post comments, create PRs, publish commits,
approve, merge, or run tests on behalf of an agent. Those remain supervised session/owner actions.

Implementation requires an existing draft PR and `allowImplementation: true`; create the initial branch/draft
with a scoped handoff/design commit manually. The implementation reservation is one-shot. Ordinary existing PRs
use `false`. Mark a completed draft ready manually. Only Claude implements/fixes; Codex uses a separate worktree
and read-only review session. No background loop, scheduler, service or auto-merge exists.

## Owner setup, after review and manual merge

These are instructions, not actions this PR performs. Keep Phase 1 in use until a supervised pilot succeeds.

1. Update the owner's `C:\Users\dkhie\Desktop\RepOne` checkout to reviewed `main`. Run the controller from there,
   never an agent's development branch. Confirm no other agent sessions are using either agent worktree.
2. Create a private configuration and state directory outside every checkout:

   ```powershell
   $controllerHome = "$env:LOCALAPPDATA\dev-host\repone"
   New-Item -ItemType Directory -Force "$controllerHome\state" | Out-Null
   Copy-Item scripts/dev-host-supervised/project.example.json "$controllerHome\project.json"
   ```

   Keep access restricted to your Windows account. Do not put tokens, prompts, PR bodies or findings in this file.
   Leave `executionEnabled: false`, `autoMerge: false`, and `maxFixRounds: 2`.
3. Set actual absolute worktree paths. All three must be separate, non-nested Git worktrees of the same repository,
   with exactly the configured GitHub origin. Owner stays on `main`; Claude uses the configured `claude/...`
   task branch; Codex uses its own `codex/...` branch. Before each operation, both agent worktrees must be clean
   and at the **same current PR head SHA**. Fetch and prepare branches manually; the controller never resets,
   switches, cleans, fetches or changes an agent worktree. Commit/stash existing work deliberately first.
4. Add only an assigned, owner-approved task to `tasks`, for example:

   ```json
   { "id": "RO-034", "pr": 123, "branch": "claude/RO-034-example",
     "allowImplementation": false, "dependencies": [] }
   ```

   Replace all example values; 123 is not an approved PR. Record every prerequisite PR and check additional
   device/security/owner gates yourself. Do not enroll parked PRs or work already at the two-round cap.
5. Initialize and inspect, without enabling execution:

   ```powershell
   node scripts/dev-host-supervised/cli.mjs init "$controllerHome\project.json"
   node scripts/dev-host-supervised/cli.mjs enroll "$controllerHome\project.json"
   node scripts/dev-host-supervised/cli.mjs plan "$controllerHome\project.json" RO-034
   ```

   After adding later tasks to the private allowlist, use `enroll` again, **never reinitialize**. Removed tasks retain
   their budgets in the journal. The Git common directory holds `supervised-controller.json` (the state binding)
   and transient `controller.lock` (one controller across all worktrees/configurations).
6. If API rate limits require authentication, set `DEV_HOST_GITHUB_TOKEN` in your terminal using a fine-grained
   GitHub token restricted to this repository and read-only Contents, Pull requests, Issues, Actions and Checks.
   Never use a token in a command argument or commit it. It is not passed into agent processes.

## Separate owner activation decision

Only after a security review and a clean plan, explicitly choose to pilot execution. This PR does not make that decision.

1. Install/update supported native Claude Code and Codex CLI executables yourself if needed. Windows `.cmd`/`.ps1`
   wrappers are deliberately refused; select the actual vendor `.exe`. Set each absolute path and its SHA-256:

   ```powershell
   Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\actual\path\claude.exe'
   Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\actual\path\codex.exe'
   ```

   Put the lowercase hashes in `executables`. An update invalidates the pin; review it before updating the hash.
2. Sign in through Claude Pro and ChatGPT subscriptions. Check account settings: paid credits, extra usage and
   overages must be off; wait for subscription reset instead of paying. The launcher verifies the CLI's subscription
   login in the exact agent directory, before and after approval. Unknown auth output/version fails closed.
   Claude starts with `--setting-sources ""` and manual permissions; Codex is forced to ChatGPT auth, the OpenAI
   provider and read-only review. Environment forwarding is allowlisted. Inspect managed settings, CLI plugins,
   hooks and stored provider configuration before approving: this is supervised software, not a security sandbox
   against a malicious program running as your Windows user. No account billing settings are changed by code.
3. Change private `executionEnabled` to `true`. Run `run <task>` in a real foreground terminal. Review the displayed
   action/full SHA, then type its digest to approve one session. There is no `--yes`, saved approval or unattended mode.
   Supply the accepted implementation/finding scope in the agent terminal. Keep supervising its permission prompts.
4. On session exit, inspect changes and test results. Publish the branch yourself after inspection; record
   `Round n/2 started at <sha>` / `completed at <sha>` in the PR/handoff using the reserved round from the journal.
   Request GitHub review with `@codex review`. Move the separate reviewer worktree to the new head manually before
   the next plan. Never treat a successful CLI exit as a clean code review.
5. Review and all configured CI workflows/jobs must cover the current SHA. The newest PR workflow run/attempt
   must succeed, and every expected job must be present, successful and in its check suite. Missing, skipped,
   duplicate, foreign-suite or pending jobs never produce an owner merge decision. Add extra required workflows
   to `workflows` if repository rules change (including #38's tracker if the owner makes it required).
6. The owner checks device/security gates and merges manually. Set `executionEnabled` back to `false` to stop
   offering launches; an already-running session must be stopped in its terminal.

## Failures and recovery

The journal is append-only, sequence/hash-checked and flushed before each launch. It stores only identifiers,
SHAs, approval digests, fixed event/state names and counters: no credentials, GitHub text or agent transcripts.
The CLI likewise suppresses raw Git/network/provider errors. Vendor CLIs can maintain their own histories;
the controller does not collect them and cannot promise they contain no user-entered secrets.

A started fix consumes a round even if startup fails, the terminal closes, disk writes fail or the session times out.
The maximum is hard-coded to two, using the greater of local reservations and maintainer GitHub round records.
A single session has a 30-minute timeout. Terminating the parent does not guarantee all subprocesses stopped.
Inspect and stop survivors, then run `recover` interactively. It refuses to clear a lock owned by a live or
unverifiable process and **blocks** interrupted work without refunding its round. A blocked task requires a new,
separately reviewed owner decision; this phase has no unblock/budget-reset command.

Do not delete/recreate the binding or journal to recover: that loses the local budget. Partial/corrupt journals
fail closed. Preserve the file, reconcile with backups and PR round records, and ask for a reviewed repair.
If initialization fails between binding and first journal write, preserve both and use the same repair procedure.
The hash chain detects accidental corruption, not edits by someone with control of the Windows account.
No software can make approval and a later remote push atomic; if another actor changes the PR after the final
read, stop the session. Exclusive human ownership of the feature branch is a pilot precondition.

## Architecture path for future repositories

`core.mjs` is project-neutral state/policy; `store.mjs` is the journal/lock; `orchestration.mjs` coordinates explicit
ports; `adapters.mjs` implements GitHub, Git/worktrees and subscription CLIs; `cli.mjs` owns interactive approval.
The sample config is the only repository-specific runtime data. The existing trusted Codex marker/round parser
and read-only paginated client are reused from Phase 1. Unknown provider evidence fails closed.

Next extraction: move these modules to a versioned standalone controller package, retain the JSON config and
repository-bound journal schema, and replace GitHub/task-board adapters behind the explicit ports. Each repository
gets separate worktrees, config, journal, workflow/job allowlist and approval. Do not launch multiple projects into
shared worktrees. This PR does not introduce a global multi-project daemon or change repository task-board formats.

CLI flags checked against [Codex commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli),
[Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference), and
[Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference). An actual owner subscription session
and native CLI compatibility remain rollout checks; tests never invoke a paid API or a real agent.
