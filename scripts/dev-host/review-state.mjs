// Derives Codex review state, fix-round usage and CI state from GitHub API objects (RO-034).
//
// Trust model: PR titles, bodies and comments are untrusted. This module never returns comment text.
// It extracts only fixed-format facts (commit SHAs, P0–P3 badges, round numbers), and only from authors
// it trusts for that fact:
// - Codex review facts come only from the Codex GitHub app's bot account (login AND type "Bot").
// - Fix-round records and finding replies come only from the configured maintainer logins (type "User").
// Anyone else writing the same markers is ignored.

export const CODEX_BOT_LOGINS = new Set(['chatgpt-codex-connector[bot]']);
export const MAX_FIX_ROUNDS = 2; // docs/automation/claude-codex-workflow.md §4 and AGENTS.md: at most two fix rounds

const RECEIPT_MARKER = '<!-- codex-review-receipt:v1 -->';
const REVIEWED_COMMIT = /\*\*Reviewed commit:\*\*\s*`([0-9a-f]{7,40})`/;
const STATE_MARKER = /<!--\s*codex-review-state:v1\s+(\{[^\n]*\})\s*-->/;
const BADGE = /!\[(P[0-3]) Badge\]/;
// Main's runbook: "Round <n>/2 at <sha>"; PR #38's proposal: "Round n/2 started|completed at <sha>".
// Owner-extended budgets are recorded as e.g. "Round 4/4 at <sha>". The denominator is read but never
// raises the cap: agents post with the owner's GitHub account, so a comment cannot prove owner approval.
const ROUND_LINE = /^\s*Round\s+([1-9][0-9]?)\/([1-9][0-9]?)\s+(?:(started|completed)\s+)?at\s+`?([0-9a-f]{7,40})`?/gm;
const REPLY_KIND = [
  [/^\s*Fixed in\s+`?[0-9a-f]{7,40}`?/, 'fixed'],
  [/^\s*Not changed:/, 'not-changed'],
  [/^\s*Needs owner decision:/, 'needs-owner'],
];

export function isCodexBot(user) {
  return user?.type === 'Bot' && CODEX_BOT_LOGINS.has(user?.login);
}

function isMaintainer(user, maintainers) {
  return user?.type === 'User' && maintainers.has(user?.login);
}

function shaMatches(prefixOrSha, headSha) {
  return typeof prefixOrSha === 'string' && prefixOrSha.length >= 7 && headSha.startsWith(prefixOrSha);
}

function time(value) {
  const ms = Date.parse(value ?? '');
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Codex review state for the PR head.
 * @returns {{
 *   status: 'not-reviewed' | 'pending' | 'stale' | 'reviewed',
 *   reviewedCommit: string | null,
 *   findings: Array<{ priority: 'P0'|'P1'|'P2'|'P3', path: string, line: number | null, reply: string | null }>,
 * }}
 */
export function codexReviewState({ headSha, issueComments = [], reviews = [], reviewComments = [], maintainers = new Set() }) {
  const receipts = [];
  for (const comment of issueComments) {
    if (!isCodexBot(comment.user) || typeof comment.body !== 'string') continue;
    if (comment.body.includes(RECEIPT_MARKER)) {
      const commit = REVIEWED_COMMIT.exec(comment.body)?.[1];
      if (commit) receipts.push({ commit, at: time(comment.created_at) });
    }
  }
  for (const review of reviews) {
    if (!isCodexBot(review.user) || typeof review.body !== 'string' || !review.body.includes(RECEIPT_MARKER)) continue;
    const commit = /^[0-9a-f]{40}$/.test(review.commit_id ?? '') ? review.commit_id : REVIEWED_COMMIT.exec(review.body)?.[1];
    if (commit) receipts.push({ commit, at: time(review.submitted_at) });
  }
  receipts.sort((a, b) => a.at - b.at);
  const latest = receipts.at(-1) ?? null;
  const reviewedAtHead = receipts.some((receipt) => shaMatches(receipt.commit, headSha));

  // The newest summary comment says whether a review of the head is still running.
  let running = false;
  const summaries = issueComments
    .filter((comment) => isCodexBot(comment.user) && typeof comment.body === 'string' && STATE_MARKER.test(comment.body))
    .sort((a, b) => time(a.updated_at ?? a.created_at) - time(b.updated_at ?? b.created_at));
  const summary = summaries.at(-1);
  if (summary) {
    try {
      const state = JSON.parse(STATE_MARKER.exec(summary.body)[1]);
      const code = state?.code_review;
      running = code?.commit_sha === headSha && typeof code?.status === 'string' && code.status !== 'completed';
    } catch {
      // A malformed marker is treated as no information.
    }
  }

  const replies = new Map();
  for (const comment of reviewComments) {
    if (comment.in_reply_to_id == null || !isMaintainer(comment.user, maintainers) || typeof comment.body !== 'string') continue;
    const kind = REPLY_KIND.find(([pattern]) => pattern.test(comment.body))?.[1];
    if (kind) replies.set(comment.in_reply_to_id, kind);
  }
  const findings = reviewComments
    .filter((comment) => isCodexBot(comment.user) && comment.in_reply_to_id == null && comment.original_commit_id === headSha)
    .map((comment) => ({
      priority: BADGE.exec(comment.body ?? '')?.[1] ?? 'P2', // unlabelled findings are treated as P2, never as P3
      path: typeof comment.path === 'string' ? comment.path : '',
      line: Number.isSafeInteger(comment.line) ? comment.line : Number.isSafeInteger(comment.original_line) ? comment.original_line : null,
      reply: replies.get(comment.id) ?? null,
    }));

  // A running review of the head wins over an earlier receipt for the same head: a re-review may still
  // add findings, so nothing may be recommended on the older result.
  let status;
  if (running) status = 'pending';
  else if (reviewedAtHead) status = 'reviewed';
  else if (latest) status = 'stale';
  else status = 'not-reviewed';
  return { status, reviewedCommit: reviewedAtHead ? headSha : latest?.commit ?? null, findings };
}

/** Highest fix round recorded by a maintainer ("a started round counts", PR #38's runbook). Rounds past the cap still count. */
export function fixRoundsUsed(issueComments = [], maintainers = new Set()) {
  let used = 0;
  let lastSha = null;
  for (const comment of issueComments) {
    if (!isMaintainer(comment.user, maintainers) || typeof comment.body !== 'string') continue;
    for (const match of comment.body.matchAll(ROUND_LINE)) {
      const round = Number(match[1]);
      if (round >= used) {
        used = round;
        lastSha = match[4];
      }
    }
  }
  return { used, lastSha };
}

const OK_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);

/** The CI workflow and the jobs it must run for a PR head (job `name:` values in that file; a test keeps them in sync). */
export const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
export const REQUIRED_CI_JOBS = Object.freeze([
  'Boundaries, typecheck and tests',
  'Windows — boundary checker and its tests',
  'Handoff file present',
]);

/**
 * CI state at the head commit. Green only when the newest pull_request run of the CI workflow concluded
 * `success` AND every required job is present in that run's own check suite with conclusion `success`.
 * A job of the same name from another workflow does not count. A missing required job makes the state
 * `incomplete`; a skipped or unsuccessful required job, or an unsuccessful workflow, makes it `failing`.
 * Any other check on the head that completed unsuccessfully also fails it.
 * @returns {{ state: 'pending'|'failing'|'incomplete'|'green', failing: string[], missing: string[] }}
 */
export function ciState(checkRuns = [], workflowRuns = [], required = REQUIRED_CI_JOBS) {
  const failing = [];
  let pending = false;

  const ciRuns = workflowRuns.filter(
    (run) => typeof run?.path === 'string' && run.path.split('@')[0] === CI_WORKFLOW_PATH && run.event === 'pull_request',
  );
  if (ciRuns.length === 0) return { state: 'incomplete', failing: [], missing: ['CI workflow run'] };
  const run = ciRuns.reduce((newest, candidate) => (candidate.id > newest.id ? candidate : newest));
  if (run.status !== 'completed') return { state: 'pending', failing: [], missing: [] };
  if (run.conclusion !== 'success') failing.push(`CI workflow concluded ${String(run.conclusion ?? 'without a result')}`);

  const jobs = checkRuns.filter((check) => check.check_suite?.id === run.check_suite_id);
  const missing = [];
  for (const name of required) {
    const job = jobs.find((check) => check.name === name);
    if (!job) missing.push(name);
    else if (job.status !== 'completed') pending = true;
    else if (job.conclusion !== 'success') failing.push(`${name} (${String(job.conclusion)})`);
  }

  for (const check of checkRuns) {
    if (required.includes(check.name) && check.check_suite?.id === run.check_suite_id) continue;
    if (check.status !== 'completed') pending = true;
    else if (!OK_CONCLUSIONS.has(check.conclusion)) failing.push(String(check.name ?? 'unnamed check'));
  }

  if (failing.length > 0) return { state: 'failing', failing: [...failing, ...missing.map((name) => `${name} (missing)`)], missing };
  if (pending) return { state: 'pending', failing: [], missing };
  if (missing.length > 0) return { state: 'incomplete', failing: [], missing };
  return { state: 'green', failing: [], missing: [] };
}
