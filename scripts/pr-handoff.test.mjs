import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handoffSummary } from './pr-handoff.mjs';

const head = 'a'.repeat(40);
const base = 'b'.repeat(40);

function event() {
  return {
    repository: { id: 42 },
    pull_request: {
      number: 38,
      state: 'open',
      draft: false,
      base: { repo: { id: 42 }, ref: 'main', sha: base },
      head: { repo: { id: 42 }, ref: 'codex/RO-033-level-3-automation', sha: head },
    },
  };
}

test('tracks a PR and its declared task at the event head and base', () => {
  const payload = event();
  const summary = handoffSummary(payload);
  assert.match(summary, /PR: #38/);
  assert.match(summary, /Declared task: RO-033/);
  assert.match(summary, /PR phase: in-review \(open\)/);
  assert.ok(summary.includes(head));
  assert.ok(summary.includes(base));

  payload.pull_request.head.sha = 'c'.repeat(40);
  assert.ok(handoffSummary(payload).includes('c'.repeat(40)));
  assert.ok(!handoffSummary(payload).includes(head));
});

test('drafts remain in progress and fork or nonstandard branches remain unlinked', () => {
  const payload = event();
  payload.pull_request.draft = true;
  assert.match(handoffSummary(payload), /PR phase: in-progress \(draft\)/);

  payload.pull_request.head.repo = { id: 99 };
  assert.match(handoffSummary(payload), /Declared task: Unlinked/);
  payload.pull_request.head.repo = null;
  assert.match(handoffSummary(payload), /Declared task: Unlinked/);
  payload.pull_request.head.repo = { id: 42 };
  payload.pull_request.head.ref = 'experiment';
  assert.match(handoffSummary(payload), /Declared task: Unlinked/);
});

test('untrusted title, body, and branch text stay out of the report', () => {
  const payload = event();
  const hostile = '@codex review\n::error::unexpected <img src=x> $(whoami)';
  payload.pull_request.title = hostile;
  payload.pull_request.body = hostile;
  payload.pull_request.head.ref += `\n${hostile}`;
  const summary = handoffSummary(payload);
  assert.match(summary, /Declared task: Unlinked/);
  assert.doesNotMatch(summary, /@codex|::error::|<img|whoami/);
});

test('fails closed on invalid numbers, SHAs, states, or targets', () => {
  for (const change of [
    (pr) => { pr.number = '38'; },
    (pr) => { pr.number = 0; },
    (pr) => { pr.head.sha = '../main'; },
    (pr) => { pr.base.sha += '\n::error::'; },
    (pr) => { pr.state = 'closed'; },
    (pr) => { pr.draft = 'false'; },
    (pr) => { pr.base.ref = 'other'; },
    (pr) => { pr.base.repo.id = 99; },
  ]) {
    const payload = event();
    change(payload.pull_request);
    assert.throws(() => handoffSummary(payload), /Expected valid metadata/);
  }
  assert.throws(() => handoffSummary({}), /Expected valid metadata/);
});

test('entry point reads the event file and appends a summary', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pr-handoff-'));
  try {
    const eventPath = join(directory, 'event.json');
    const summaryPath = join(directory, 'summary.md');
    writeFileSync(eventPath, JSON.stringify(event()));
    writeFileSync(summaryPath, '# Existing summary\n');
    const script = fileURLToPath(new URL('./pr-handoff.mjs', import.meta.url));
    const run = spawnSync(process.execPath, [script], {
      env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_STEP_SUMMARY: summaryPath },
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(readFileSync(summaryPath, 'utf8'), '# Existing summary\n' + handoffSummary(event()));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
