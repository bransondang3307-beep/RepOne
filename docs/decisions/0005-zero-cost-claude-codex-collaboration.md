# ADR 0005 — Claude Code ↔ Codex collaboration at zero additional AI API cost

- **Date:** 2026-10-17
- **Status:** Accepted. The owner approved the redesign on 2026-10-17; it takes effect when the RO-019 replacement PR merges.
- **Replaces:** the *Proposed* draft "ADR 0005 — Automated Claude Code ↔ Codex review loop" on PR #4's branch
  (`claude/RO-019-claude-codex-loop` @ `af8acd9`). That draft was never accepted or merged. The number is reused
  deliberately so RO-019 keeps a single decision record. The original design is archived in
  [`docs/automation/future-api-loop.md`](../automation/future-api-loop.md).

## Context

RO-019 first built a fully automated review loop: Codex reviews and Claude fixes through
`openai/codex-action` and `anthropics/claude-code-action` in GitHub Actions (PR #4). It needs `OPENAI_API_KEY` and
`ANTHROPIC_API_KEY`, which means separately billed API usage, estimated at about $1–$6 per PR (up to about $13).
The loop was paused (PR #5) before it was ever enabled. The owner already pays for ChatGPT Plus, Claude Pro and
Google AI Pro and set a non-negotiable rule: **$0 additional AI API spending**. That rule rules out API credits,
pay-per-token billing, new paid infrastructure, and unsupported automation of consumer apps.

Facts checked on 2026-10-17 against vendor documentation:
- Codex code review on GitHub is a cloud feature of ChatGPT plans, not of API keys. It triggers when a PR is opened
  or marked ready, and on an `@codex review` comment; it does not re-run on each push. It follows "Review
  guidelines" in `AGENTS.md`.
- Claude Code (CLI, desktop, web) is included with Claude Pro. Cloud sessions always use the subscription. A set
  `ANTHROPIC_API_KEY` takes precedence once approved, and is always used in `-p` mode.
- Optional paid top-ups exist on both sides: Codex credits, and Claude "extra usage", which is billed at API rates.

## Decision

1. **AI work runs only through supported subscription interfaces, started by a person.**
   - Codex reviews PRs through its GitHub code-review integration, automatically on PR creation and via
     `@codex review` for re-reviews.
   - Claude Code works in owner-started sessions.
   - Claude **Auto-fix is off** for now.
2. **GitHub Actions automates only AI-free checks:** boundaries, workflow policy, typecheck and tests on every PR
   (Windows checker per RO-022; lint per RO-017). It uses only `GITHUB_TOKEN`, and needs no secrets for normal operation.
3. **The hand-off happens in GitHub.**
   - Codex posts `[P0]`–`[P3]` findings.
   - Claude replies to each one (`Fixed in <sha>` / `Not changed` / `Needs owner decision`), pushes one fix commit
     per round and comments `@codex review`.
   - There are at most **two** fix rounds.
   - Round records go into the handoff file.
   - Details: [`docs/automation/claude-codex-workflow.md`](../automation/claude-codex-workflow.md).
4. **Human approval before merge is unchanged.** CI and the Codex review must cover the same head commit, and only
   the owner merges.
5. **The policy is enforced in CI.** `scripts/check-workflow-policy.mjs` (`npm run check:workflows`, part of
   `npm run verify` and the CI job) rejects:
   - AI actions, AI credentials, AI API endpoints and AI CLIs;
   - AI SDKs under any name: direct, `npm:` alias, override, or anywhere in `package-lock.json`; and non-registry
     dependency sources;
   - any secret except `GITHUB_TOKEN`;
   - privileged triggers, and merge, approve or force-push paths, including merge/approve actions;
   - script injection, judged by parsing each expression;
   - third-party actions outside the owner-reviewed allowlist `.github/workflow-policy.json` (SHA-pinned).
   It applies **least privilege rather than banning writes**: workflow-level permissions are read-only, and a job may
   hold a write scope only with an inline `# least-privilege: <reason>`. Being line-based, it is **fail-closed**:
   YAML it cannot read reliably (anchors, aliases, unrecognised permission values) is rejected. The first Codex review
   found four parser bypasses (quoted/inline permissions, npm aliases, bracket expressions, merge-capable actions);
   each is a regression test now.
6. **PR #4 stays as an archive.** It is preserved, unmerged, with its branch and the archive tag
   `archive/RO-019-api-loop-v1`. PRs #4 and #5 stay open until this replacement is verified and merged; then the
   owner closes them.

## Consequences

- Separately billed AI API usage is $0 by construction. The remaining costs are the existing subscriptions and
  GitHub's free Actions minutes; the owner sets the Actions budget to $0 so overages pause CI.
- More owner clicks, and Codex re-review is not automatic after a push. Subscription usage windows can delay a
  review or a fix, but never cause a charge.
- The 2-round cap and the merge gate are process rules. GitHub Free private repos have no branch protection, and
  Codex comments are not approvals.
- No secrets in the repository; no bot pushes; no write-capable workflows today.

## Alternatives considered

| Option | Why not (now) |
|---|---|
| Keep PR #4's API loop (disabled by default) | Needs paid API keys; one misconfiguration from spending money; its three review concerns were open |
| Claude Code GitHub Action with `CLAUDE_CODE_OAUTH_TOKEN` | Documented and billed to the subscription, but stores a credential to the owner's personal plan in repo secrets, an `ANTHROPIC_API_KEY` secret would silently take precedence, and it runs unattended. Blocked by the policy until an ADR revisits it |
| Claude Code on the web Auto-fix per PR | Supported and subscription-billed; deferred by the owner (manual hand-offs first). Can be enabled per PR later without repository changes |
| Scripting the ChatGPT or Claude web apps | Unsupported automation of consumer interfaces — excluded |
