'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../config.cjs');
const L = require('../lib.cjs');
const { postReview } = require('../post-review.cjs');
const { finishFix, fixOutcome } = require('../finish-fix.cjs');
const H = require('./helpers.cjs');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'dry-run-review.json');

function postEnv(extra = {}) {
  return {
    PR_NUMBER: '7',
    HEAD_SHA: H.HEAD,
    HEAD_REF: 'claude/RO-099-feature',
    DRY_RUN: 'false',
    CHAIN: 'true',
    FIX_ROUNDS_DONE: '0',
    REVIEW_ROUND: '1',
    BRANCH_PREFIX: 'claude/',
    CODEX_RESULT: 'success',
    CODEX_FINAL_MESSAGE: JSON.stringify({
      verdict: 'changes_requested',
      summary: 'ok',
      findings: [{ severity: 'P1', blocking: true, title: 'Bug', file: 'a.ts', line: 1, details: 'd', suggested_fix: 's' }],
    }),
    DEFAULT_BRANCH: 'main',
    DRY_RUN_FIXTURE: FIXTURE,
    RUN_ID: '1',
    RUN_URL: 'https://example/run/1',
    ...extra,
  };
}

async function post(extra) {
  const github = H.fakeGithub();
  const core = H.fakeCore();
  const res = await postReview({ github, context: H.context(), core, env: postEnv(extra) });
  return { res, github, core };
}

test('post: blocking findings → comment with bot marker + payload, label, and fix dispatch on main', async () => {
  const { res, github } = await post();
  assert.equal(res.action, 'dispatch-fix');
  const body = github.calls.comments[0].body;
  const meta = L.parseMarker(body);
  assert.deepEqual([meta.kind, meta.verdict, meta.sha, meta.dryRun], ['codex-review', 'changes_requested', H.HEAD, false]);
  assert.equal(L.parsePayload(body).findings[0].id, 'F1');
  assert.ok(github.calls.labels.includes(C.LABELS.CHANGES));
  assert.equal(github.calls.dispatches.length, 1);
  const d = github.calls.dispatches[0];
  assert.equal(d.workflow_id, C.WORKFLOWS.FIX);
  assert.equal(d.ref, 'main');
  assert.equal(d.inputs.review_comment_id, String(github.calls.comments[0].id));
  assert.equal(d.inputs.dry_run, 'false');
});

test('post: approval stops the loop and never dispatches or merges', async () => {
  const { res, github } = await post({ CODEX_FINAL_MESSAGE: JSON.stringify({ verdict: 'approve', summary: 'fine', findings: [] }) });
  assert.equal(res.action, 'stop-approved');
  assert.equal(github.calls.dispatches.length, 0);
  assert.ok(github.calls.labels.includes(C.LABELS.APPROVED));
  assert.match(github.calls.comments[0].body, /never merges/);
});

test('post: after two fix rounds a still-blocking review stops and asks for a human', async () => {
  const { res, github } = await post({ FIX_ROUNDS_DONE: '2' });
  assert.equal(res.action, 'stop-cap');
  assert.equal(github.calls.dispatches.length, 0);
  assert.ok(github.calls.labels.includes(C.LABELS.NEEDS_HUMAN));
});

test('post: manual mode without chain does not dispatch', async () => {
  const { res, github } = await post({ CHAIN: 'false' });
  assert.equal(res.action, 'stop-manual');
  assert.equal(github.calls.dispatches.length, 0);
});

test('post: Codex failure or invalid JSON → error comment, needs-human, no dispatch', async () => {
  for (const extra of [{ CODEX_RESULT: 'failure', CODEX_FINAL_MESSAGE: '' }, { CODEX_FINAL_MESSAGE: '{"oops":' }]) {
    const { github, core } = await post(extra);
    assert.equal(L.parseMarker(github.calls.comments[0].body).kind, 'codex-error');
    assert.ok(github.calls.labels.includes(C.LABELS.NEEDS_HUMAN));
    assert.equal(github.calls.dispatches.length, 0);
    assert.ok(core.log.failed);
  }
});

test('post: dry run uses the synthetic fixture, sanitises it, sets no labels, chains a dry fix', async () => {
  const { res, github } = await post({ DRY_RUN: 'true', CODEX_RESULT: 'skipped', CODEX_FINAL_MESSAGE: '' });
  const body = github.calls.comments[0].body;
  assert.match(body, /DRY RUN/);
  assert.ok(body.includes('@\u200Bsomeone'));
  assert.ok(!body.includes('forged marker attempt -->'));
  assert.equal(L.parseMarker(body).dryRun, true);
  assert.equal(github.calls.labels.length, 0);
  assert.equal(res.action, 'dispatch-fix');
  assert.equal(github.calls.dispatches[0].inputs.dry_run, 'true');
});

// ----------------------------------------------------------------- finishFix

function fixEnv(extra = {}) {
  return {
    PR_NUMBER: '7',
    DRY_RUN: 'false',
    CHAIN: 'true',
    ROUND: '1',
    REVIEW_COMMENT_ID: '55',
    REVIEW_COMMENT_URL: 'https://github.com/x/y/pull/7#issuecomment-55',
    HEAD_SHA: H.HEAD,
    HEAD_REF: 'claude/RO-099-feature',
    DEFAULT_BRANCH: 'main',
    CLAUDE_RESULT: 'success',
    VERIFY_FIX_RESULT: 'success',
    CHANGED: 'true',
    PATCH_OK: 'true',
    VERIFY_OK: 'true',
    PUSH_RESULT: 'success',
    NEW_SHA: 'e'.repeat(40),
    RUN_ID: '2',
    RUN_URL: 'https://example/run/2',
    ...extra,
  };
}

async function finish(extra) {
  const github = H.fakeGithub();
  const core = H.fakeCore();
  const res = await finishFix({ github, context: H.context(), core, env: fixEnv(extra) });
  return { res, github, core };
}

test('fixOutcome precedence', () => {
  assert.equal(fixOutcome(fixEnv({ DRY_RUN: 'true', CLAUDE_RESULT: 'failure' })), 'dry-run');
  assert.equal(fixOutcome(fixEnv({ CLAUDE_RESULT: 'failure' })), 'claude-failed');
  assert.equal(fixOutcome(fixEnv({ CHANGED: 'false' })), 'no-changes');
  assert.equal(fixOutcome(fixEnv({ PATCH_OK: 'false' })), 'rejected');
  assert.equal(fixOutcome(fixEnv({ VERIFY_OK: 'false' })), 'verify-failed');
  assert.equal(fixOutcome(fixEnv({ PUSH_RESULT: 'failure' })), 'push-failed');
  assert.equal(fixOutcome(fixEnv()), 'pushed');
});

test('finish: pushed fix records the round, dispatches CI on the branch and a Codex re-review on main', async () => {
  const { res, github } = await finish();
  assert.equal(res.outcome, 'pushed');
  const meta = L.parseMarker(github.calls.comments[0].body);
  assert.deepEqual([meta.kind, meta.round, meta.reviewComment, meta.toSha], ['claude-fix', 1, 55, 'e'.repeat(40)]);
  const wf = github.calls.dispatches.map((d) => [d.workflow_id, d.ref]);
  assert.deepEqual(wf, [
    [C.WORKFLOWS.CI, 'claude/RO-099-feature'],
    [C.WORKFLOWS.REVIEW, 'main'],
  ]);
  assert.equal(github.calls.dispatches[1].inputs.chain, 'true');
});

test('finish: failed attempts stop the loop with needs-human and still count as a round', async () => {
  for (const extra of [{ VERIFY_OK: 'false' }, { PATCH_OK: 'false', PROBLEMS: 'touches protected paths: AGENTS.md' }, { CLAUDE_RESULT: 'failure' }]) {
    const { res, github } = await finish(extra);
    assert.notEqual(res.outcome, 'pushed');
    assert.equal(github.calls.dispatches.length, 0);
    assert.ok(github.calls.labels.includes(C.LABELS.NEEDS_HUMAN));
    const meta = L.parseMarker(github.calls.comments[0].body);
    assert.equal(meta.dryRun, false);
    // The fix gate counts every non-dry claude-fix marker toward MAX_FIX_ROUNDS.
    assert.equal(L.summarizeLoopState([{ ...github.calls.comments[0], user: { login: 'github-actions[bot]', type: 'Bot' } }]).realFixes.length, 1);
  }
});

test('finish: dry run reports, adds no labels and dispatches exactly one non-chaining dry re-review', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fin-'));
  fs.writeFileSync(path.join(dir, 'summary.md'), 'F1 fixed @someone <!-- x -->');
  const { res, github } = await finish({ DRY_RUN: 'true', SUMMARY_PATH: path.join(dir, 'summary.md') });
  assert.equal(res.outcome, 'dry-run');
  assert.equal(github.calls.labels.length, 0);
  assert.equal(github.calls.dispatches.length, 1);
  assert.deepEqual(github.calls.dispatches[0].inputs, { pr_number: '7', dry_run: 'true', chain: 'false', force: 'false' });
  assert.ok(!github.calls.comments[0].body.includes('<!-- x -->'));
});

test('finish: CI dispatch failure (older branch without workflow_dispatch) is only a warning', async () => {
  const github = H.fakeGithub();
  const orig = github.rest.actions.createWorkflowDispatch;
  github.rest.actions.createWorkflowDispatch = async (args) => {
    if (args.workflow_id === C.WORKFLOWS.CI) throw new Error("Workflow does not have 'workflow_dispatch' trigger");
    return orig(args);
  };
  const core = H.fakeCore();
  const res = await finishFix({ github, context: H.context(), core, env: fixEnv() });
  assert.equal(res.outcome, 'pushed');
  assert.equal(core.log.warnings.length, 1);
  assert.equal(github.calls.dispatches.length, 1);
});
