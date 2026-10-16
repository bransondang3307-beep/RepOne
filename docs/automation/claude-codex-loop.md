# Automated Claude Code ↔ Codex review loop (RO-019)

> **Status: implemented, not yet run on GitHub.** The workflows are disabled until the owner
> sets `AI_LOOP_MODE` and adds API keys. Logic, policy and file pipeline are verified locally
> (see the RO-019 handoff); the end-to-end behaviour on GitHub must be validated with the
> test plan below before unattended use. Decision record: [ADR 0005](../decisions/0005-automated-claude-codex-review-loop.md).

## 1. What it does

```text
Claude opens / pushes a PR on a claude/* branch
        │  (auto mode)                      or  owner dispatches "AI loop · Codex review"
        ▼
AI loop · Codex review   gate → verify (npm ci && npm run verify) → Codex (read-only) → post
        │  posts a structured review comment (verdict, P0–P3 findings, file:line, suggested fix)
        │
        ├─ no blocking findings ──► label ai-loop:approved, STOP. Owner reviews and merges.
        ├─ 2 fix rounds already used ─► label ai-loop:needs-human, STOP.
        └─ blocking findings ──► dispatch "AI loop · Claude fix" (round n+1)
                                       │
AI loop · Claude fix   gate → Claude (file edits only) → patch policy + verify → push → report
        │  pushes ONE commit to the same claude/* branch only if the patch passes policy and
        │  npm ci && npm run verify passes; appends a round record to the PR's handoff file
        ├─ failure / no change / rejected ──► label ai-loop:needs-human, STOP
        └─ pushed ──► dispatch CI on the branch + dispatch Codex re-review ──► (back to top)
```

- **Maximum two automatic fix rounds per PR** (every real attempt counts, successful or not).
- **The automation never merges** and never approves a PR. `ai-loop:approved` only means Codex
  found no blocking issues on that commit. Merging into `main` is the owner's decision (AGENTS.md §3).
- Automatic reviews only run on PRs whose branch starts with `claude/` (configurable), from this
  repository (never forks), authored by an allowed actor, not drafts, not labelled `ai-loop:stop`,
  and not changing `.github/workflows/` or `.github/ai-loop/` (those can be reviewed by manual dispatch).

## 2. Modes — repository variable `AI_LOOP_MODE`

| Value | Automatic (on PR open/push) | Manual dispatch | Chaining review → fix → review |
|---|---|---|---|
| unset / `off` (default) | nothing runs (no runner starts) | **dry run only** — no API calls | dry-run chain, one pass |
| `manual` | nothing runs | real runs allowed (paid) | only when `chain` is ticked |
| `auto` | Codex reviews eligible Claude PRs | real runs allowed | yes, until approve or 2 fix rounds |

Dispatch inputs default to **`dry_run: true`**. A dry run posts a clearly marked synthetic review
(from `.github/ai-loop/fixtures/dry-run-review.json`), exercises the dispatch into a dry Claude fix
(Claude is not called, nothing is pushed) and one dry re-review, then stops. Dry runs never change
labels, never consume fix rounds and cost only GitHub Actions minutes.

**Kill switches:** add the label `ai-loop:stop` to a PR (that PR only), or set `AI_LOOP_MODE` to
`off` (everything). Cancelling a workflow run also stops that step.

## 3. What you need to provide (nothing is enabled until you do)

### API credentials — GitHub → Settings → Secrets and variables → Actions → **Secrets**

| Secret | Used by | Where to get it | Recommendation |
|---|---|---|---|
| `OPENAI_API_KEY` | `ai-codex-review.yml` → job `codex` only | platform.openai.com → a **dedicated project** → API keys | Set a project budget / usage limit. Revoke if ever exposed. |
| `ANTHROPIC_API_KEY` | `ai-claude-fix.yml` → job `claude` only | console.anthropic.com → a **dedicated workspace** → API keys | Set a workspace spend limit. |

No GitHub personal access token, GitHub App or Claude GitHub App is needed: the workflows use the
short-lived built-in `GITHUB_TOKEN`, scoped per job. Keys exist only as Actions secrets; they are never
written to files, logs or comments (model output is additionally scrubbed for secret-shaped strings).

### Repository variables — same page → **Variables** (all optional except the mode)

| Variable | Default | Purpose |
|---|---|---|
| `AI_LOOP_MODE` | unset = `off` | `off` / `manual` / `auto` (see §2) |
| `AI_LOOP_ALLOWED_ACTORS` | owner only | extra GitHub logins (comma-separated) allowed to trigger the loop |
| `AI_LOOP_BRANCH_PREFIX` | `claude/` | branches eligible for automatic review and automated fixes |
| `CLAUDE_FIX_MODEL` | `claude-opus-5-5` | Claude model for fixes (e.g. `claude-sonnet-5-5` to halve cost) |
| `CODEX_MODEL` | Codex CLI default | pin the Codex model so cost is predictable |
| `CODEX_EFFORT` | Codex CLI default | Codex reasoning effort |

### GitHub settings (Settings → Actions → General)

- **Actions permissions:** if you restrict actions, allow `actions/checkout`, `actions/setup-node`,
  `actions/github-script`, `actions/upload-artifact`, `actions/download-artifact`,
  `openai/codex-action`, `anthropics/claude-code-action` (all pinned to commit SHAs in the workflows).
- **Workflow permissions:** "Read repository contents" is sufficient as the default — every job declares
  its own permissions explicitly. Keep **"Allow GitHub Actions to create and approve pull requests" off.**
- **Branch protection / rulesets** are not available for private repositories on GitHub Free, so "owner
  approval before merge" is enforced by process (no workflow contains a merge path — checked by
  `workflow-policy.test.cjs`). With GitHub Pro/Team you can additionally require a PR, an approving review
  and green checks on `main`.

### Job permissions (least privilege, all workflows start from `permissions: {}`)

| Workflow · job | Secrets | `GITHUB_TOKEN` permissions | Runs PR code? |
|---|---|---|---|
| review · gate | — | contents/pull-requests/issues: read | no |
| review · verify | — | contents: read | **yes** (`npm ci && npm run verify`) |
| review · codex | `OPENAI_API_KEY` | contents: read | Codex reads it in a read-only, no-network sandbox, `drop-sudo` |
| review · post | — | pull-requests/issues: write, actions: write (dispatch) | no |
| fix · gate | — | contents/pull-requests/issues: read | no |
| fix · claude | `ANTHROPIC_API_KEY` | contents/pull-requests/issues: read | no (file tools only, no shell) |
| fix · verify-fix | — | contents: read | **yes** (verify with Claude's changes) |
| fix · push | — | contents: write | no (`git apply`, commit, push) |
| fix · report | — | pull-requests/issues: write, actions: write (dispatch) | no |

## 4. Costs (estimates — verify against current price pages before enabling)

**Claude (Anthropic API, first-party prices per million tokens):** Opus 5.5 $4 input / $20 output
(cache reads $0.20); Sonnet 5.5 $2 / $10. A fix round is an agentic Claude Code session limited to
40 turns with file tools; expect roughly **$0.50–$4 per round on Opus 5.5** (≈ half on Sonnet 5.5),
dominated by cached re-reads of files and the output written.

**Codex (OpenAI API):** depends on the model the Codex CLI uses (pin it with `CODEX_MODEL`). Public
sources disagree on current model names and prices; with representative rates of about $1.75–$5 per
million input and $10–$30 per million output tokens, a review that reads the diff and surrounding
files costs roughly **$0.15–$1.60**. Check OpenAI's pricing page for the model you pin.

**Per PR, worst case** (3 Codex reviews + 2 Claude rounds): ≈ **$5–$13**; typical ≈ $1–$6. Automatic
reviews are capped at 6 per PR and fix rounds at 2.

**GitHub Actions minutes** (private repo; GitHub Free includes 2,000 Linux minutes/month, each job is
billed rounded up to the minute): real review ≈ 8–17 min, real fix round ≈ 11–28 min (+ ≈ 3 min CI),
dry run ≈ 3–5 min per workflow. While `AI_LOOP_MODE` is not `auto`, PR pushes start **no** loop runner.

## 5. Test plan before unattended operation

Use a sacrificial PR on a `claude/` branch (e.g. `claude/RO-0xx-loop-test`) that contains a small,
deliberate bug plus a handoff file. Do each stage, check the result, then move on.

1. **Merge the RO-019 PR** with `AI_LOOP_MODE` unset and no API secrets. Confirm a normal PR push starts
   no "AI loop" runs (the `gate` job shows as skipped).
2. **Dry run (free):** Actions → *AI loop · Codex review* → Run workflow on `main`, `pr_number` = test PR,
   `dry_run` ✓, `chain` ✓. Expect, in order: a "[DRY RUN — synthetic findings…]" review comment; an
   *AI loop · Claude fix* run (dry); a "[DRY RUN] Claude automated fix" comment; one more dry review
   comment with "chaining disabled"; then nothing. No labels, no commits.
3. **Real Codex review (paid, manual):** add `OPENAI_API_KEY`, set `AI_LOOP_MODE=manual`. Dispatch the
   review with `dry_run` ☐, `chain` ☐. Check the findings are specific and the cost in the OpenAI dashboard.
4. **Real Claude fix (paid, manual):** add `ANTHROPIC_API_KEY`. Dispatch *AI loop · Claude fix* with the
   review comment's id (from its URL `#issuecomment-<id>`), `dry_run` ☐, `chain` ☐. Expect one commit by
   `github-actions[bot]` on the test branch (only if verify passed), a round record appended to the
   handoff, a report comment, and a dispatched CI run on the branch.
5. **Chained manual loop:** on a fresh test PR, dispatch the review with `chain` ✓ and watch it run to
   approval or to `ai-loop:needs-human` after two rounds.
6. **Unattended:** set `AI_LOOP_MODE=auto`. Claude PRs are now reviewed on open/push.

## 6. Interaction with the project workflow (AGENTS.md)

- Fix commits are made by `github-actions[bot]` with trailer `RepOne-AI-Loop: claude-fix round=N`;
  agents working on the same branch must `git pull` before pushing.
- Bot pushes use `GITHUB_TOKEN`, which does not trigger `pull_request` workflows; the loop therefore
  dispatches `ci.yml` on the branch itself and runs `npm ci && npm run verify` before every push.
- Each automated round appends a deterministic record (trigger, changed files, verification run, "not
  merged by automation") to the newest handoff file in the PR, and Claude adds per-finding notes.
- Automated fixes may not touch `.github/`, agent instruction files at any depth (`CLAUDE.md`,
  `AGENTS.md`, `GEMINI.md`, `.claude/`, `.codex/`, …), `TASKS.md`, `PROJECT_STATUS.md`, ADRs,
  lockfiles, the rep-counting detector or the sensor/derived data contracts. Such patches are rejected.
- `TASKS.md` and `PROJECT_STATUS.md` are still updated by the responsible agent in its own
  status-update PR after merge — never by the loop.

## 7. Known limitations

- Not yet exercised on GitHub: first real runs may surface integration issues (follow §5).
- Claude cannot run tests during a fix (no shell, by design); verification happens afterwards and
  failing fixes are not pushed.
- Anyone with write access can change workflow files in their own PR branch; the loop excludes PRs
  that touch automation files from *automatic* runs, but GitHub's trust boundary is write access.
- Model output is treated as untrusted and sanitised, but prompt injection through PR content can
  never be fully excluded; the loop limits impact (read-only AI jobs, patch policy, verify, no merge).
