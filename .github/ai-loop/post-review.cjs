// RO-019 loop — publish the Codex review and decide the next step.
// Runs in a job with write access to PR comments/labels and workflow dispatch,
// but WITHOUT secrets and WITHOUT executing PR code.
'use strict';

const fs = require('node:fs');
const C = require('./config.cjs');
const L = require('./lib.cjs');

async function setVerdictLabels({ github, owner, repo, prNumber, add }) {
  const managed = [C.LABELS.APPROVED, C.LABELS.CHANGES];
  for (const name of managed.filter((n) => n !== add)) {
    try {
      await github.rest.issues.removeLabel({ owner, repo, issue_number: prNumber, name });
    } catch {
      /* label not present */
    }
  }
  if (add) await github.rest.issues.addLabels({ owner, repo, issue_number: prNumber, labels: [add] });
}

async function postReview({ github, context, core, env = process.env }) {
  const { owner, repo } = context.repo;
  const prNumber = Number(env.PR_NUMBER);
  const dryRun = L.parseBool(env.DRY_RUN);
  const chain = L.parseBool(env.CHAIN);
  const fixRoundsDone = Number(env.FIX_ROUNDS_DONE || 0);
  const runUrl = env.RUN_URL;
  const headSha = env.HEAD_SHA;

  // 1. Obtain and validate the review (model output = untrusted data).
  let raw;
  if (dryRun) {
    raw = fs.readFileSync(env.DRY_RUN_FIXTURE, 'utf8');
  } else if (env.CODEX_RESULT !== 'success' || !env.CODEX_FINAL_MESSAGE) {
    const body = [
      L.buildMarker({ kind: 'codex-error', sha: headSha, dryRun, run: Number(env.RUN_ID) }),
      `## Codex automated review did not complete — head \`${String(headSha).slice(0, 7)}\``,
      '',
      `Codex job result: \`${L.sanitizeText(env.CODEX_RESULT, 40)}\`. See the [workflow run](${runUrl}).`,
      'The loop has stopped for this head. Check the API key, quota and logs, then re-dispatch the review.',
    ].join('\n');
    await github.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
    await github.rest.issues.addLabels({ owner, repo, issue_number: prNumber, labels: [C.LABELS.NEEDS_HUMAN] });
    core.setFailed('Codex review did not produce output');
    return { posted: true, action: 'error' };
  } else {
    raw = env.CODEX_FINAL_MESSAGE;
  }
  const checked = L.validateReview(raw);
  if (!checked.ok) {
    const body = [
      L.buildMarker({ kind: 'codex-error', sha: headSha, dryRun, run: Number(env.RUN_ID) }),
      `## Codex output rejected — head \`${String(headSha).slice(0, 7)}\``,
      '',
      `The structured review failed validation: ${L.sanitizeText(checked.error, 300)}. [Workflow run](${runUrl}).`,
      'The loop has stopped for this head.',
    ].join('\n');
    await github.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
    if (!dryRun) await github.rest.issues.addLabels({ owner, repo, issue_number: prNumber, labels: [C.LABELS.NEEDS_HUMAN] });
    core.setFailed(`invalid Codex output: ${checked.error}`);
    return { posted: true, action: 'invalid' };
  }
  const review = checked.review;

  // 2. Decide the next step before rendering, so the comment states it.
  const decision = L.decideAfterReview({
    verdict: review.verdict,
    fixRoundsDone,
    chain,
    headRef: env.HEAD_REF,
    branchPrefix: env.BRANCH_PREFIX || C.DEFAULT_BRANCH_PREFIX,
  });
  const meta = { kind: 'codex-review', sha: headSha, verdict: review.verdict, dryRun, run: Number(env.RUN_ID), round: Number(env.REVIEW_ROUND || 1) };
  const nextStep = {
    'stop-approved': 'Loop finished: no blocking findings. **Owner review and merge decision required** — the automation never merges.',
    'stop-cap': `Loop stopped: ${decision.reason}. Label \`${C.LABELS.NEEDS_HUMAN}\` added — a human must take over.`,
    'stop-branch': `Loop stopped: ${decision.reason}.`,
    'stop-manual': `Not dispatching a fix: ${decision.reason}. Dispatch \`AI loop · Claude fix\` manually with this comment's id if wanted.`,
    'dispatch-fix': `Next: ${decision.reason}${dryRun ? ' (dry run)' : ''}.`,
  }[decision.action];

  let body = L.renderReviewComment({ review, meta, runUrl, dryRun, fixRoundsDone });
  body = body.replace('\n### Summary\n', `\n**Next step:** ${nextStep}\n\n### Summary\n`);
  const { data: comment } = await github.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });

  // 3. Labels (not in dry runs) and the next step.
  if (!dryRun) {
    await setVerdictLabels({ github, owner, repo, prNumber, add: review.verdict === 'approve' ? C.LABELS.APPROVED : C.LABELS.CHANGES });
    if (decision.action === 'stop-cap') {
      await github.rest.issues.addLabels({ owner, repo, issue_number: prNumber, labels: [C.LABELS.NEEDS_HUMAN] });
    }
  }
  if (decision.action === 'dispatch-fix') {
    await github.rest.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: C.WORKFLOWS.FIX,
      ref: env.DEFAULT_BRANCH || 'main',
      inputs: { pr_number: String(prNumber), review_comment_id: String(comment.id), dry_run: String(dryRun), chain: String(chain) },
    });
  }
  core.summary.addHeading('Codex review posted', 3).addRaw(`Verdict: ${review.verdict}. ${nextStep}`).addLink('comment', comment.html_url);
  await core.summary.write();
  return { posted: true, action: decision.action, commentId: comment.id, verdict: review.verdict };
}

module.exports = { postReview };
