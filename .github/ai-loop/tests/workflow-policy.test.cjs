// Static policy checks on the RO-019 workflows. These encode the security model
// (ADR 0005) so a future edit that weakens it fails CI.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const WF = (name) => fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8');
const AI_WORKFLOWS = { 'ai-codex-review.yml': WF('ai-codex-review.yml'), 'ai-claude-fix.yml': WF('ai-claude-fix.yml') };

/** Split a workflow into { jobName: text } using two-space job keys under `jobs:`. */
function jobs(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === 'jobs:');
  const out = {};
  let current = null;
  for (const line of lines.slice(start + 1)) {
    const m = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (m) {
      current = m[1];
      out[current] = '';
    } else if (current) {
      out[current] += `${line}\n`;
    }
  }
  return out;
}

/** Text of every `run: |` and `script: |` block. */
function scriptBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:- )?(run|script): \|\s*$/);
    if (!m) continue;
    const indent = m[1].length;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() && l.search(/\S/) <= indent) break;
      body.push(l);
    }
    blocks.push(body.join('\n'));
  }
  // single-line step `run:` values too (step keys sit at >= 8 spaces, or `      - run:`;
  // a job output that happens to be named `run` sits at 6 spaces and is not a script)
  for (const l of lines) {
    const m = l.match(/^(?: {8,}| {6}- )run: (?!\|)(.+)$/);
    if (m) blocks.push(m[1]);
  }
  return blocks;
}

for (const [name, text] of Object.entries(AI_WORKFLOWS)) {
  test(`${name}: default permissions are empty and every job declares its own`, () => {
    assert.match(text, /^permissions: \{\}$/m);
    for (const [job, body] of Object.entries(jobs(text))) {
      assert.match(body, /^ {4}permissions:/m, `${job} lacks permissions`);
    }
  });

  test(`${name}: no dangerous triggers`, () => {
    const on = text.slice(text.indexOf('\non:'), text.indexOf('\npermissions:'));
    for (const trigger of ['pull_request_target', 'issue_comment', 'pull_request_review', 'workflow_run', 'repository_dispatch', 'schedule']) {
      assert.ok(!on.includes(trigger), `${name} must not use ${trigger}`);
    }
  });

  test(`${name}: all actions are pinned to a full commit SHA`, () => {
    const uses = [...text.matchAll(/uses: ([^\s#]+)/g)].map((m) => m[1]);
    assert.ok(uses.length > 0);
    for (const u of uses) assert.match(u, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, u);
  });

  test(`${name}: no \${{ }} expressions inside run/script blocks (inputs go through env)`, () => {
    for (const block of scriptBlocks(text)) assert.ok(!block.includes('${{'), `expression in script block:\n${block}`);
  });

  test(`${name}: no merge, force-push or auto-approve paths`, () => {
    for (const bad of [/pulls\.merge/, /gh pr merge/, /merge_method/, /--force/, /push -f\b/, /createReview\b/, /event: ['"]?APPROVE/]) {
      assert.ok(!bad.test(text), `${name} matches ${bad}`);
    }
  });
}

test('loop scripts contain no merge or approve API calls', () => {
  const dir = path.join(ROOT, '.github', 'ai-loop');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.cjs'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const bad of [/pulls\.merge/, /merge_method/, /createReview\b/, /['"]APPROVE['"]/]) assert.ok(!bad.test(src), `${f} matches ${bad}`);
  }
});

test('secrets are referenced only by the AI jobs, and the write-capable jobs have none', () => {
  const allowed = { 'ai-codex-review.yml': ['codex'], 'ai-claude-fix.yml': ['claude'] };
  for (const [name, text] of Object.entries(AI_WORKFLOWS)) {
    for (const [job, body] of Object.entries(jobs(text))) {
      const usesSecrets = /secrets\./.test(body);
      assert.equal(usesSecrets, allowed[name].includes(job), `${name}:${job} secrets usage`);
    }
  }
});

test('write permissions only where needed; AI jobs are read-only', () => {
  const review = jobs(AI_WORKFLOWS['ai-codex-review.yml']);
  const fix = jobs(AI_WORKFLOWS['ai-claude-fix.yml']);
  for (const job of [review.gate, review.verify, review.codex, fix.gate, fix.claude, fix['verify-fix']]) {
    assert.ok(!/:\s*write/.test(job), 'unexpected write permission');
  }
  assert.match(fix.push, /contents: write/);
  assert.ok(!/pull-requests: write|actions: write|issues: write/.test(fix.push));
  assert.ok(!/contents: write/.test(review.post) && !/contents: write/.test(fix.report));
  assert.ok(!/id-token/.test(AI_WORKFLOWS['ai-claude-fix.yml']) && !/id-token/.test(AI_WORKFLOWS['ai-codex-review.yml']));
});

test('only the push job keeps checkout credentials', () => {
  for (const [name, text] of Object.entries(AI_WORKFLOWS)) {
    for (const [job, body] of Object.entries(jobs(text))) {
      const checkouts = (body.match(/uses: actions\/checkout@/g) || []).length;
      const disabled = (body.match(/persist-credentials: false/g) || []).length;
      if (name === 'ai-claude-fix.yml' && job === 'push') assert.equal(disabled, 0);
      else assert.equal(checkouts, disabled, `${name}:${job} must set persist-credentials: false on every checkout`);
    }
  }
});

test('Codex runs sandboxed, read-only, with drop-sudo, as the last step of its job', () => {
  const codex = jobs(AI_WORKFLOWS['ai-codex-review.yml']).codex;
  assert.match(codex, /safety-strategy: drop-sudo/);
  assert.match(codex, /permission-profile: ":read-only"/);
  const steps = codex.split(/\n {6}- /);
  assert.match(steps.at(-1), /openai\/codex-action@/);
});

test('Claude runs with file tools only and the read-only workflow token', () => {
  const claude = jobs(AI_WORKFLOWS['ai-claude-fix.yml']).claude;
  assert.match(claude, /--disallowedTools "Bash,WebFetch,WebSearch/);
  assert.match(claude, /--allowedTools "Read,Edit,MultiEdit,Write,Glob,Grep,LS"/);
  assert.match(claude, /github_token: \$\{\{ github\.token \}\}/);
  assert.match(claude, /allowed_bots: github-actions\n/);
  assert.match(claude, /rm -rf pr-head\/\.git/);
});

test('push job refuses unprefixed or default branches and never force-pushes', () => {
  const push = jobs(AI_WORKFLOWS['ai-claude-fix.yml']).push;
  assert.match(push, /refusing to push: branch lacks the loop prefix/);
  assert.match(push, /refusing to push to the default branch/);
  assert.match(push, /branch moved/);
  assert.match(push, /git push origin "HEAD:refs\/heads\/\$HEAD_REF"/);
});

test('dry run is the default for manual dispatch', () => {
  for (const text of Object.values(AI_WORKFLOWS)) {
    assert.match(text, /dry_run:\n\s+description: [^\n]+\n\s+type: boolean\n\s+default: true/);
  }
});

test('PR-controlled agent configuration is moved out of the AI working directories', () => {
  const claude = jobs(AI_WORKFLOWS['ai-claude-fix.yml']).claude;
  assert.match(claude, /-name CLAUDE\.md -o -name CLAUDE\.local\.md -o -name \.claude /);
  const hold = claude.indexOf('Hold PR-controlled agent configuration');
  const run = claude.indexOf('anthropics/claude-code-action@');
  const restore = claude.indexOf('cp -a "$RUNNER_TEMP/held/." pr-head/');
  assert.ok(hold > 0 && hold < run && run < restore, 'hold before Claude, restore after');
  const codex = jobs(AI_WORKFLOWS['ai-codex-review.yml']).codex;
  assert.match(codex, /-name AGENTS\.md -o -name AGENTS\.override\.md -o -name \.codex/);
  assert.ok(codex.indexOf('pr-agent-config') < codex.indexOf('openai/codex-action@'));
});

test('no runner starts for PR pushes unless the loop is in auto mode', () => {
  const gate = jobs(AI_WORKFLOWS['ai-codex-review.yml']).gate;
  assert.match(gate, /^ {4}if: github\.event_name == 'workflow_dispatch' \|\| vars\.AI_LOOP_MODE == 'auto'$/m);
});
