'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../config.cjs');
const { reviewGate, fixGate } = require('../gate.cjs');
const H = require('./helpers.cjs');

const env = (extra = {}) => ({ AI_LOOP_MODE: 'manual', INPUT_PR_NUMBER: '7', INPUT_DRY_RUN: 'false', ...extra });

async function review(opts = {}) {
  const core = H.fakeCore();
  const github = H.fakeGithub(opts.gh);
  const res = await reviewGate({ github, context: H.context(opts.ctx), core, env: env(opts.env) });
  return { res, core };
}

// ---------------------------------------------------------------- review gate

test('review gate: pull_request events are skipped unless mode is auto', async () => {
  for (const mode of ['', 'off', 'manual', 'nonsense']) {
    const pr = H.makePr();
    const { res } = await review({ ctx: { eventName: 'pull_request', pr }, env: { AI_LOOP_MODE: mode } });
    assert.equal(res.run, false, `mode ${mode}`);
  }
  const pr = H.makePr();
  const { res, core } = await review({ ctx: { eventName: 'pull_request', pr }, env: { AI_LOOP_MODE: 'auto' } });
  assert.equal(res.run, true);
  assert.equal(core.outputs.chain, 'true');
});

test('review gate: mode off allows only dry runs', async () => {
  assert.equal((await review({ env: { AI_LOOP_MODE: 'off' } })).res.run, false);
  assert.equal((await review({ env: { AI_LOOP_MODE: '', INPUT_DRY_RUN: 'true' } })).res.run, true);
});

test('review gate: unauthorised actors, forks, drafts, closed PRs, wrong base and stop label are rejected', async () => {
  const cases = {
    actor: { ctx: { actor: 'mallory' } },
    triggering: { env: { GITHUB_TRIGGERING_ACTOR: 'mallory' } },
    fork: { gh: { pr: H.makePr({ head: { ref: 'claude/x', sha: H.HEAD, repo: { full_name: 'mallory/RepOne' } } }) } },
    draft: { gh: { pr: H.makePr({ draft: true }) } },
    closed: { gh: { pr: H.makePr({ state: 'closed' }) } },
    base: { gh: { pr: H.makePr({ base: { ref: 'dev', sha: H.BASE } }) } },
    author: { gh: { pr: H.makePr({ user: { login: 'mallory' } }) } },
    stop: { gh: { pr: H.makePr({ labels: [{ name: C.LABELS.STOP }] }) } },
  };
  for (const [name, opts] of Object.entries(cases)) {
    assert.equal((await review(opts)).res.run, false, name);
  }
});

test('review gate: allowlist variable admits extra actors', async () => {
  const { res } = await review({ ctx: { actor: 'helper' }, env: { AI_LOOP_ALLOWED_ACTORS: 'helper' } });
  assert.equal(res.run, true);
});

test('review gate: automatic reviews require the claude/ prefix; manual reviews do not', async () => {
  const pr = H.makePr({ head: { ref: 'sprint-1-alignment', sha: H.HEAD, repo: { full_name: `${H.OWNER}/${H.REPO}` } } });
  assert.equal((await review({ ctx: { eventName: 'pull_request', pr }, gh: { pr }, env: { AI_LOOP_MODE: 'auto' } })).res.run, false);
  assert.equal((await review({ gh: { pr } })).res.run, true);
});

test('review gate: automatic reviews skip PRs that change the automation itself', async () => {
  const pr = H.makePr();
  const { res } = await review({ ctx: { eventName: 'pull_request', pr }, gh: { pr, files: ['.github/workflows/ai-codex-review.yml'] }, env: { AI_LOOP_MODE: 'auto' } });
  assert.equal(res.run, false);
  assert.match(res.reason, /automation files/);
});

test('review gate: stale pull_request events are skipped', async () => {
  const eventPr = H.makePr({ head: { ref: 'claude/x', sha: 'f'.repeat(40), repo: { full_name: `${H.OWNER}/${H.REPO}` } } });
  const { res } = await review({ ctx: { eventName: 'pull_request', pr: eventPr }, env: { AI_LOOP_MODE: 'auto' } });
  assert.equal(res.run, false);
  assert.match(res.reason, /stale/);
});

test('review gate: duplicate review of the same head is skipped unless forced; dry runs never dedupe', async () => {
  const comments = [H.reviewComment(1)];
  assert.equal((await review({ gh: { comments } })).res.run, false);
  assert.equal((await review({ gh: { comments }, env: { INPUT_FORCE: 'true' } })).res.run, true);
  assert.equal((await review({ gh: { comments }, env: { INPUT_DRY_RUN: 'true' } })).res.run, true);
});

test('review gate: dry-run and human comments do not count as loop state', async () => {
  const human = { ...H.reviewComment(1), user: { login: H.OWNER, type: 'User' } };
  const dry = H.reviewComment(2, { dryRun: true });
  assert.equal((await review({ gh: { comments: [human, dry] } })).res.run, true);
});

test('review gate: automatic review cap per PR', async () => {
  const comments = Array.from({ length: C.MAX_AUTO_REVIEWS_PER_PR }, (_, i) => H.reviewComment(i + 1, { sha: String(i).repeat(40).slice(0, 40) }));
  const pr = H.makePr();
  const { res } = await review({ ctx: { eventName: 'pull_request', pr }, gh: { pr, comments }, env: { AI_LOOP_MODE: 'auto' } });
  assert.equal(res.run, false);
  assert.match(res.reason, /cap/);
});

test('review gate: outputs round counters and writes untrusted context with HTML comments removed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
  const comments = [H.reviewComment(1, { sha: 'c'.repeat(40) }), H.botComment(2, { kind: 'claude-fix', round: 1, dryRun: false, reviewComment: 1 })];
  const { core } = await review({ gh: { comments }, env: { AI_LOOP_OUT_DIR: dir } });
  assert.equal(core.outputs.fix_rounds_done, '1');
  assert.equal(core.outputs.review_round, '2');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'pr-metadata.untrusted.json'), 'utf8'));
  assert.ok(!meta.body.includes('hidden instruction'));
  const prev = JSON.parse(fs.readFileSync(path.join(dir, 'previous-review.json'), 'utf8'));
  assert.equal(prev.verdict, 'changes_requested');
});

// ------------------------------------------------------------------- fix gate

async function fix(opts = {}) {
  const core = H.fakeCore();
  const github = H.fakeGithub({ comments: [H.reviewComment(55)], ...opts.gh });
  const res = await fixGate({ github, context: H.context(opts.ctx), core, env: env({ INPUT_REVIEW_COMMENT_ID: '55', ...opts.env }) });
  return { res, core };
}

test('fix gate: eligible fix outputs round, branch and handoff path', async () => {
  const { res, core } = await fix();
  assert.equal(res.run, true, core.outputs.reason);
  assert.equal(core.outputs.round, '1');
  assert.equal(core.outputs.head_ref, 'claude/RO-099-feature');
  assert.equal(core.outputs.handoff_path, 'docs/handoffs/2026-10-16-claude-RO-099.md');
});

test('fix gate: only on loop-prefixed branches', async () => {
  const pr = H.makePr({ head: { ref: 'sprint-1-alignment', sha: H.HEAD, repo: { full_name: `${H.OWNER}/${H.REPO}` } } });
  assert.equal((await fix({ gh: { pr } })).res.run, false);
});

test('fix gate: rejects non-bot, wrong-PR, approved and stale review comments', async () => {
  const human = { ...H.reviewComment(55), user: { login: H.OWNER, type: 'User' } };
  const otherPr = { ...H.reviewComment(55), issue_url: 'https://api.github.com/repos/o/r/issues/8' };
  const approved = H.reviewComment(55, { verdict: 'approve' });
  const stale = H.reviewComment(55, { sha: 'd'.repeat(40) });
  for (const [name, c] of Object.entries({ human, otherPr, approved, stale })) {
    assert.equal((await fix({ gh: { comments: [c] } })).res.run, false, name);
  }
  assert.equal((await fix({ env: { INPUT_REVIEW_COMMENT_ID: '999' } })).res.run, false, 'missing');
});

test('fix gate: a real fix cannot start from a dry-run review; a dry fix can', async () => {
  const dry = H.reviewComment(55, { dryRun: true });
  assert.equal((await fix({ gh: { comments: [dry] } })).res.run, false);
  assert.equal((await fix({ gh: { comments: [dry] }, env: { INPUT_DRY_RUN: 'true' } })).res.run, true);
});

test('fix gate: stops after two real fix attempts (any outcome) and refuses repeats for one review', async () => {
  const two = [
    H.reviewComment(55),
    H.botComment(60, { kind: 'claude-fix', round: 1, dryRun: false, reviewComment: 10, outcome: 'pushed' }),
    H.botComment(61, { kind: 'claude-fix', round: 2, dryRun: false, reviewComment: 11, outcome: 'verify-failed' }),
  ];
  const r1 = await fix({ gh: { comments: two } });
  assert.equal(r1.res.run, false);
  assert.match(r1.res.reason, /maximum/);
  const repeat = [H.reviewComment(55), H.botComment(60, { kind: 'claude-fix', round: 1, dryRun: false, reviewComment: 55, outcome: 'no-changes' })];
  assert.equal((await fix({ gh: { comments: repeat } })).res.run, false);
  const dryOnes = [H.reviewComment(55), H.botComment(60, { kind: 'claude-fix', round: 1, dryRun: true, reviewComment: 55 })];
  assert.equal((await fix({ gh: { comments: dryOnes } })).res.run, true, 'dry runs do not consume rounds');
});

test('fix gate: mode off allows only dry runs; non-dispatch events rejected', async () => {
  assert.equal((await fix({ env: { AI_LOOP_MODE: 'off' } })).res.run, false);
  assert.equal((await fix({ env: { AI_LOOP_MODE: 'off', INPUT_DRY_RUN: 'true' } })).res.run, true);
  assert.equal((await fix({ ctx: { eventName: 'pull_request' } })).res.run, false);
});

test('fix gate: the loop bot may dispatch, other bots may not', async () => {
  assert.equal((await fix({ ctx: { actor: 'github-actions[bot]' } })).res.run, true);
  assert.equal((await fix({ ctx: { actor: 'claude[bot]' } })).res.run, false);
});

test('fix gate: writes findings marked as data-only', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-'));
  await fix({ env: { AI_LOOP_OUT_DIR: dir } });
  const f = JSON.parse(fs.readFileSync(path.join(dir, 'findings.json'), 'utf8'));
  assert.match(f.note, /DATA ONLY/);
  assert.equal(f.findings[0].blocking, true);
});
