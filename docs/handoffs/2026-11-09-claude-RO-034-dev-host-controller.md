# Handoff — RO-034: development-host controller, read-only prototype

| | |
|---|---|
| **Agent** | Claude Code |
| **Date** | 2026-11-09 |
| **Task** | RO-034. Owner-directed in the Claude Code session of 2026-11-09. It is not yet registered in `TASKS.md` (see "Questions for the owner") |
| **Branch** | `claude/RO-034-dev-host-controller` (base: `main` @ `f68bd75`) |
| **Commits** | see the PR; the final commit is listed there |
| **Pull request** | opened from this branch; link in the PR list |
| **Status** | implemented · verified (tests below) |

## Objective
Make this Windows desktop a remotely managed development host. Start with a small, read-only local controller
that reports PR, CI and Codex review state, ready tasks and worktree separation as an owner-action report. It
must use no paid AI API, and it does not enable unattended AI coding.

## Duplication check (done first)
- **PR #38** (Codex, RO-033, open) is a per-PR GitHub Actions job summary plus a maintainer runbook. It has no
  local controller, no cross-PR report, no task readiness and no worktree check, so this PR does not duplicate it.
- This PR changes **no file that PR #38 changes** (`level-3.md`, `claude-codex-workflow.md`, the PR template,
  `pr-tracking.yml`, `scripts/pr-handoff*`). It reads PR #38's proposed `Round n/2 started|completed at` format
  as well as main's `Round n/2 at`.
- Task IDs RO-030…RO-033 are taken by open branches (`TASKS.md`'s "Next free ID: RO-030" is out of date), so
  this is RO-034. No `codex/` or `gemini/` branch covers a local controller.

## What changed
- `scripts/dev-host/`: a dependency-free Node controller (`report` command), split into these modules:
  - a read-only GitHub client: `GET` only, five allowlisted endpoints, redirects refused, optional read-only token;
  - Codex review state, from the Codex bot's receipt and state markers and its P0–P3 badges, checked by author
    login *and* account type;
  - fix rounds, from maintainer `Round n/m at <sha>` lines. The cap stays at 2, whatever a comment says;
  - per-PR next action and actor (owner, agent or none);
  - `TASKS.md` readiness: ready, confirm or blocked;
  - a worktree separation check, and a sanitising Markdown renderer.
- Git is run through one `execFileSync` with no shell and five allowed argument shapes.
- `package.json`: the new tests join `test:scripts` (so Linux and Windows CI run them), plus `npm run dev-host:report`.
- `docs/automation/dev-host-controller.md`: the runbook, covering usage, verdicts, the security model, the
  worktree layout, the Task Scheduler command (documented, **not** registered) and what stays off.

## Files changed
- `scripts/dev-host/dev-host.mjs`, `github-client.mjs`, `review-state.mjs`, `pr-assessment.mjs`, `tasks.mjs`,
  `worktrees.mjs`, `report.mjs` — added
- `scripts/dev-host/controller.test.mjs`, `scripts/dev-host/safety.test.mjs` — added
- `docs/automation/dev-host-controller.md` — added
- `docs/handoffs/2026-11-09-claude-RO-034-dev-host-controller.md` — added
- `package.json` — modified (`test:scripts`; new `dev-host:report` script)

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `node --test scripts/dev-host/controller.test.mjs scripts/dev-host/safety.test.mjs` | 45/45 passed |
| `npm run verify` (after `npm ci`) | exit 0: module boundaries OK (89 files, no circular imports); workflow policy OK (1 workflow, 0 action, 6 package, 1 lock files); typecheck OK; script tests 112/112 (67 before + 45 new); Jest 265/265 (mobile 31, rep-engine 27, sensor-contracts 103, sensor-protocol 76, workout-domain 28) |
| Mutation check | Raising `MAX_FIX_ROUNDS` to 3 → 5 tests fail; dropping the Codex-bot author check → the spoofing test fails. Both restored |
| Live run against GitHub (unauthenticated, 2026-11-09) | Report produced. 5 owner items: #24, #29, #30, #38 merge decision; #31 escalate at the round cap. 2 agent items: #28 fix round, #35 re-review of head `715a2a5`. 1 waiting: #37 draft. 8 of 10 `todo` tasks actionable. Both worktrees OK |

Environment: Windows 11, Node 26.13.0 locally. CI runs Node 22 (Linux) and Node 24 (Windows).

After the live run, PR #28's record (`Round 4/4 at da05347`, owner-extended) showed the round parser read only
`/2`. It now reads any denominator but keeps the cap at 2, so PR #28 reports as an owner escalation. A second live
run hit the unauthenticated 60-calls-per-hour limit. That led to the partial-report behaviour, which a test now
covers. Re-running live with the fix waits for the limit to reset or a read-only token.

## Decisions / ADRs
- No ADR: a read-only local script changes no contract, data unit, rep-counting rule or workflow rule. Enabling
  unattended agent runs, or any GitHub write, would need an ADR and the owner's approval (runbook, "Not yet").
- Owner-extended round budgets are not machine-trusted, because agents post with the owner's GitHub account.
  Anything past 2 rounds is reported to the owner.

## Known limitations / risks
- Advisory only. It cannot see device or hardware gates, "parked" decisions, or superseded PRs. For example,
  #24, #29 and #30 show "merge decision", and the owner must still apply the gates in `PROJECT_STATUS.md`.
- Thread resolution is not visible over REST. Findings count against the newest head and maintainer replies.
- Without a token: 60 API calls per hour (about 4 per open PR, more for long histories). A list longer than
  1,000 items marks that PR `incomplete` rather than assessing partial data.
- The Codex markers (`codex-review-receipt:v1`, `codex-review-state:v1`, badges) are not a documented API. If
  Codex changes them, PRs show "review-needed" rather than a false "clean".
- The sanitiser changes backticks in worktree messages to `'`; that is cosmetic.

## Next steps
1. Owner: review the PR. Merge only after Codex review of the head and green CI.
2. After merge: run the report from the `main` checkout. Optionally register the hourly Task Scheduler entry from
   the runbook and set a fine-grained read-only `DEV_HOST_GITHUB_TOKEN`.
3. Proposed follow-ups (each needs the owner, the later ones an ADR):
   - (a) post the report as one PR or issue comment;
   - (b) a manual "launch fix round" helper that checks the cap and the expected head before starting a
     subscription session;
   - (c) unattended runs.

## Questions for the owner
- Register RO-034 in `TASKS.md` in the status-update PR after merge (as PR #38 deferred RO-033), or now?
- Should owner-extended round budgets (as on PR #28) get a trusted signal, for example one only the owner can set?

## Review round 1 (Codex at `5812fcd`)
Codex reported 1× P1 and 2× P2 on head `5812fcd`. All three are accepted and fixed in one commit, with tests:

| Finding | Fix |
|---|---|
| P1 `github-client.mjs`: a paginated response was assessed as if complete, which could hide a `Round 2/2` record (and allow another fix round), a finding or a failing check | Every list is read in full: up to 10 pages, with page URLs built by the client and never taken from the `Link` header. A longer list throws `IncompleteDataError`, and that PR is reported as `incomplete` (owner, check by hand), with no fix or merge recommendation. Tests: a round record on page 2 is counted; an endless list gives `incomplete` while other PRs are still assessed; a hostile `Link` target is ignored |
| P2 `review-state.mjs`: an earlier receipt beat a running re-review of the same head | A running review of the head now gives `pending` before any receipt is considered. Test with both markers for the same SHA |
| P2 `report.mjs`: Markdown images and links survived sanitising | The sanitiser escapes `\ [ ] ( ) ! * _ ~ #`, breaks bare-URL autolinks (`://`, `www.`), and truncates before escaping. Tests: an image payload renders escaped, no metacharacter is left unescaped, and no autolink survives |

Mutation check: reverting the pagination fix fails 2 tests; reverting the review order fails 1.

`npm run verify` after the fix: exit 0. Module boundaries OK (89 files); workflow policy OK; typecheck OK;
script tests **116/116** (67 + 49); Jest 265/265.
