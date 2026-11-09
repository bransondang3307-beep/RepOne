# Development-host controller (RO-034, read-only prototype)

A small local program that lets the owner manage development from one Windows desktop. It reads GitHub and
the repository, and prints an **owner-action report**:

- open PRs, with CI at the head, Codex review state at the head, and fix rounds used;
- what each PR needs next, and from whom (owner, agent or nobody);
- `todo` tasks from `main`'s `TASKS.md` whose dependencies are done;
- whether Claude Code and Codex work in separate Git worktrees.

It is a **prototype**. It takes no action: it never merges, approves, pushes, comments, edits the repository,
or starts Claude Code or Codex. Unattended AI coding is **not enabled** (see "Not yet" below).

## How it relates to RO-019 and PR #38

- [RO-019](claude-codex-workflow.md) defines the Claude ↔ Codex workflow: Codex reviews on GitHub,
  `Round <n>/2 at <sha>` records, at most two fix rounds, and the owner's merge gate. This controller *reads*
  that workflow's records. It changes none of its rules.
- [PR #38](https://github.com/bransondang3307-beep/RepOne/pull/38) (Codex, RO-033, open) adds a per-PR
  GitHub Actions snapshot and a maintainer runbook. This controller does a different job: it runs **locally**,
  looks **across** PRs, adds task readiness and the worktree check, and does not touch any file PR #38 changes.
  It already accepts PR #38's proposed round format (`Round n/2 started|completed at <sha>`).

## Usage

```powershell
# From a checkout of main (Node 22 or later). No dependencies to install.
node scripts/dev-host/dev-host.mjs report `
  --claude-worktree C:/Users/<you>/Desktop/RepOne-Claude `
  --codex-worktree  C:/Users/<you>/Desktop/RepOne-Codex
```

| Option | Meaning |
|---|---|
| `--repo <owner/name>` | GitHub repository. Default: parsed from `git remote get-url origin` |
| `--maintainer <login>` | Trusted author of round records and finding replies (repeatable). Default: the repository owner |
| `--claude-worktree`, `--codex-worktree` | The agents' worktrees, checked for separation |
| `--tasks-ref <ref>` | Where to read `TASKS.md` (default `origin/main`) |
| `--fetch` | Run `git fetch origin --prune` first. It updates remote-tracking refs only |
| `--json` | Print the full snapshot as JSON instead of Markdown |
| `--out <file>` | Also write the report to a file. Keep it outside the repository |

Each open PR costs 5 GitHub API calls, plus 1 for the list. Without a token GitHub allows 60 calls per hour, which
covers one run an hour for about 11 open PRs while the repository is public. For more, set
`DEV_HOST_GITHUB_TOKEN` to a **fine-grained, read-only** token for this one repository. That is a GitHub token,
not an AI key. The controller sends it only in the `Authorization` header to `api.github.com`, and never prints it.
If a request fails (for example at the rate limit), the controller stops calling GitHub and prints a partial report
with a warning.

### What the verdicts mean

| Verdict | Who | Meaning |
|---|---|---|
| `merge-decision` | owner | CI complete and green (every required job of the CI run passed) and Codex reviewed **this head** with no open P0/P1, and every P2 answered. Then the owner checks device, hardware and security gates and the handoff, as in the [merge gate](claude-codex-workflow.md) |
| `escalate` | owner | Blocking findings at the fix-round cap, a P0/P1 answered "Not changed", a `Needs owner decision:` reply, or CI failing at the cap |
| `fix-round` | agent | Codex findings at the head and rounds remain. The owner may start round *n*/2 by hand |
| `review-needed` | agent | No Codex review of the current head. Comment `@codex review` |
| `ci-failing` | agent | The CI run or a required job failed or was skipped. The PR's author fixes it, or re-runs CI if a job never started |
| `ci-incomplete` | agent | A required CI job, or the CI run itself, is missing at the head. Re-run CI; no review or merge decision until it is complete |
| `incomplete` | owner | The PR has more review history than the controller reads (over 1,000 items in a list). Check it by hand |
| `draft`, `ci-pending`, `review-pending`, `waiting-on-base`, `unknown` | nobody | Wait, or a stacked PR waits for its base. `unknown` means GitHub could not be read |

Task readiness: **ready** means every `RO-…` dependency is `done` and nothing else is written in "Depends on".
**confirm** means the IDs are done but there is a written condition (an owner go-ahead, a decision) or an open PR
already exists. **blocked** means a dependency is not done. Readiness is advice: an agent still starts only work
that `TASKS.md` assigns to it (`AGENTS.md` §3 step 2).

## Security model

GitHub text is **untrusted**: PR titles, bodies, comments, branch names and check names. The controller:

1. **Reads only facts it can check, never instructions.** It extracts commit SHAs, `P0`–`P3` badges,
   `Round n/m at <sha>` lines and reply prefixes (`Fixed in`, `Not changed:`, `Needs owner decision:`). The
   report never contains comment text.
2. **Checks who wrote each fact.** Codex results count only from the Codex app's bot account: the login
   `chatgpt-codex-connector[bot]` and the account type `Bot`. Round records and replies count only from the
   maintainer logins, with account type `User`. A comment by anyone else that copies the markers is ignored.
3. **Has a fixed round cap.** The cap is 2 (`MAX_FIX_ROUNDS`). A round record above the cap (for example the
   owner-extended `Round 4/4` on PR #28) counts as used. It **does not raise the cap**, because agents post with
   the owner's GitHub account, so a comment cannot prove the owner approved it. Rounds past 2 always go to the
   owner.
4. **Makes untrusted text inert.** Titles and check names become one line, without HTML, pipes, backticks or
   control and bidirectional characters. Markdown link, image and emphasis characters are escaped, and bare
   URLs are broken so GitHub does not turn them into links. `@` gets a word joiner, so a pasted report cannot
   ping anyone or trigger `@codex`.
5. **Can only read.** The GitHub client has no method except `GET` and an allowlist of six read
   endpoints. It refuses redirects.
   - It reads every page of a list, up to 10 pages of 100 items. It builds each page URL itself and never
     follows one from a response.
   - A longer list is **not** assessed. The PR is reported as `incomplete`, for the owner to check by hand,
     because a missing page could hide a round record, a finding or a failing check.
   - A re-review of the head that is still running counts as `pending`, even if an earlier review of the same
     head finished.

   Git runs through `execFileSync` with no shell, and only five argument shapes are allowed
   (`remote get-url origin`, `rev-parse <ref>`, `show <ref>:TASKS.md`, `worktree list --porcelain`, and the
   opt-in `fetch origin --prune`).
6. **Counts CI as green only when it is complete.** The newest `pull_request` run of `.github/workflows/ci.yml`
   for the head must have concluded `success`. Every required job (`REQUIRED_CI_JOBS`: Linux verify, Windows, and
   Handoff) must also be present **in that run's check suite** and must have succeeded.
   - A missing job makes CI `incomplete`.
   - A skipped or failed required job, or a workflow that ended in failure, cancellation or a startup failure,
     makes CI failing.
   - A job with the same name from another workflow does not count.
   - A test keeps the job list equal to the `name:` values in `ci.yml`.
7. **Costs $0 in AI spending** (ADR 0005). It calls no AI service and adds no dependency.
   `scripts/dev-host/safety.test.mjs` fails if any controller file mentions a write method, merge, push, a shell,
   `eval`, or an AI provider endpoint or key.

## Worktree layout

Each agent has its own worktree, branch namespace and terminal. None of them checks out `main`:

| Worktree | Branches | Used by |
|---|---|---|
| `RepOne` (owner's checkout) | `main` | Owner, and the scheduled report |
| `RepOne-Claude` | `claude/<TASK-ID>-…`, `local/claude-…` | Claude Code (Claude Pro subscription) |
| `RepOne-Codex` | `codex/<TASK-ID>-…`, `local/codex-…` | Codex (ChatGPT Plus subscription) |

The report marks an agent worktree as an **error** if it is missing, shared with the other agent, or on `main`.
It is a **warning** if it is detached or on the other agent's branch.

## Running on a schedule (not set up by this PR)

Run the report from the owner's `main` checkout, not from an agent worktree. Agents edit their own worktrees,
including this script on their branches, and a scheduled job must not run unreviewed code. Example, hourly:

```powershell
schtasks /Create /TN "dev-host-report" /SC HOURLY /F /TR `
  "cmd /c cd /d C:\Users\<you>\Desktop\RepOne && node scripts\dev-host\dev-host.mjs report --fetch --claude-worktree C:/Users/<you>/Desktop/RepOne-Claude --codex-worktree C:/Users/<you>/Desktop/RepOne-Codex --out %LOCALAPPDATA%\dev-host\report.md"
```

Run it as your normal user, not as SYSTEM or with highest privileges. Remove it with
`schtasks /Delete /TN "dev-host-report" /F`.

## Not yet (each needs the owner's approval, and an ADR where noted)

- **Unattended agent runs.** Starting Claude Code or Codex sessions automatically is off. Enabling it needs an
  ADR: a launch allowlist, one active fixer per PR, the round cap enforced before launch, and no input taken from
  GitHub text.
- **Writing to GitHub** (comments, labels, `@codex review` requests). A token with write scope would be a new
  credential on this machine and needs its own review.
- **Notifications** (e-mail or phone) of the report.
- **Thread resolution.** The REST API does not say whether a review thread is resolved, so the controller relies on
  replies and on review of the newest head.

## Files

- `scripts/dev-host/dev-host.mjs`: CLI, git allowlist and data collection
- `scripts/dev-host/github-client.mjs`: read-only GitHub client
- `scripts/dev-host/review-state.mjs`: Codex review state, fix rounds and CI state
- `scripts/dev-host/pr-assessment.mjs`: next action per PR
- `scripts/dev-host/tasks.mjs`: task-board parsing and readiness
- `scripts/dev-host/worktrees.mjs`: worktree separation check
- `scripts/dev-host/report.mjs`: Markdown report and sanitising
- `scripts/dev-host/*.test.mjs`: tests, run by `npm run test:scripts` (Linux and Windows CI)
