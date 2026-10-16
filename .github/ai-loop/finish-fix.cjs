// RO-019 loop — report a Claude fix attempt and trigger the re-review.
// Runs WITHOUT secrets and WITHOUT executing PR code. Every non-dry attempt
// (successful or not) is recorded with a marker and counts toward MAX_FIX_ROUNDS.
'use strict';

const fs = require('node:fs');
const C = require('./config.cjs');
const L = require('./lib.cjs');

/** Derive the outcome from the needs.* results/outputs passed in env. */
function fixOutcome(env) {
  if (L.parseBool(env.DRY_RUN)) return 'dry-run';
  if (env.CLAUDE_RESULT !== 'success') return 'claude-failed';
  if (env.VERIFY_FIX_RESULT !== 'success') return 'check-failed';
  if (env.CHANGED !== 'true') return 'no-changes';
  if (env.PATCH_OK !== 'true') return 'rejected';
  if (env.VERIFY_OK !== 'true') return 'verify-failed';
  if (env.PUSH_RESULT !== 'success' || !env.NEW_SHA) return 'push-failed';
  return 'pushed';
}

const OUTCOME_TEXT = {
  'dry-run': 'Dry run: Claude was not called and nothing was pushed. Plumbing (gate → prompt → patch check → report) exercised.',
  'claude-failed': 'Claude did not complete (API key, quota, turn limit or error). Nothing was pushed.',
  'check-failed': 'The patch check job failed. Nothing was pushed.',
  'no-changes': 'Claude made no changes. Nothing was pushed.',
  rejected: 'Claude\'s changes were **rejected** by the patch policy (protected paths / size / binary / modes). Nothing was pushed.',
  'verify-failed': '`npm ci && npm run verify` **failed** with Claude\'s changes. Nothing was pushed.',
  'push-failed': 'Push failed (the branch probably moved). Nothing was pushed.',
  pushed: 'Fix commit pushed after `npm ci && npm run verify` passed.',
};

async function finishFix({ github, context, core, env = process.env }) {
  const { owner, repo } = context.repo;
  const prNumber = Number(env.PR_NUMBER);
  const dryRun = L.parseBool(env.DRY_RUN);
  const chain = L.parseBool(env.CHAIN);
  const round = Number(env.ROUND);
  const outcome = fixOutcome(env);

  let claudeSummary = '';
  if (env.SUMMARY_PATH && fs.existsSync(env.SUMMARY_PATH)) {
    claudeSummary = L.sanitizeText(fs.readFileSync(env.SUMMARY_PATH, 'utf8'), 6000);
  }
  const problems = L.sanitizeText(env.PROBLEMS || '', 1000);

  const meta = {
    kind: 'claude-fix',
    round,
    reviewComment: Number(env.REVIEW_COMMENT_ID),
    fromSha: env.HEAD_SHA,
    toSha: outcome === 'pushed' ? env.NEW_SHA : null,
    outcome,
    dryRun,
    run: Number(env.RUN_ID),
  };
  const willReview = (outcome === 'pushed' && chain) || (dryRun && chain);
  const lines = [
    L.buildMarker(meta),
    `## ${dryRun ? '[DRY RUN] ' : ''}Claude automated fix — round ${round}/${C.MAX_FIX_ROUNDS}`,
    '',
    `**Outcome:** ${OUTCOME_TEXT[outcome]}`,
    outcome === 'pushed' ? `**Commit:** \`${env.NEW_SHA}\` on \`${L.sanitizeText(env.HEAD_REF, 200)}\`` : '',
    problems ? `**Problems:** ${problems}` : '',
    `**Review addressed:** ${env.REVIEW_COMMENT_URL || `comment ${meta.reviewComment}`} · [workflow run](${env.RUN_URL})`,
    '',
    claudeSummary ? `### Claude's summary\n\n${claudeSummary}\n` : '',
    willReview
      ? `**Next:** dispatching a Codex re-review${dryRun ? ' (dry run, no further chaining)' : ''}.`
      : outcome === 'pushed'
        ? '**Next:** chaining disabled — dispatch `AI loop · Codex review` manually to re-review.'
        : `**Next:** loop stopped. Label \`${C.LABELS.NEEDS_HUMAN}\` added.`,
    '',
    '---',
    '_Automated by the RO-019 loop (`.github/workflows/ai-claude-fix.yml`). **The automation never merges.**_',
  ];
  const { data: comment } = await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: lines.filter((l) => l !== '').join('\n'),
  });

  if (!dryRun && outcome !== 'pushed') {
    await github.rest.issues.addLabels({ owner, repo, issue_number: prNumber, labels: [C.LABELS.NEEDS_HUMAN] });
  }
  if (outcome === 'pushed') {
    // Pushes made with GITHUB_TOKEN do not trigger pull_request workflows, so run CI explicitly.
    // Best effort: branches whose ci.yml predates the workflow_dispatch trigger reject this.
    try {
      await github.rest.actions.createWorkflowDispatch({ owner, repo, workflow_id: C.WORKFLOWS.CI, ref: env.HEAD_REF });
    } catch (error) {
      core.warning(`Could not dispatch CI on ${env.HEAD_REF}: ${error.message}`);
    }
  }
  if (willReview) {
    await github.rest.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: C.WORKFLOWS.REVIEW,
      ref: env.DEFAULT_BRANCH || 'main',
      // Dry runs stop after one re-review; real runs keep chaining until approve or the round cap.
      inputs: { pr_number: String(prNumber), dry_run: String(dryRun), chain: String(!dryRun), force: 'false' },
    });
  }
  core.summary.addHeading(`Claude fix round ${round}: ${outcome}`, 3).addLink('comment', comment.html_url);
  await core.summary.write();
  if (!dryRun && outcome !== 'pushed' && outcome !== 'no-changes') core.setFailed(`fix outcome: ${outcome}`);
  return { outcome, commentId: comment.id, dispatchedReview: willReview };
}

module.exports = { finishFix, fixOutcome };
