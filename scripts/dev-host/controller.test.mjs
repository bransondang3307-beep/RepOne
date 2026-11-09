// Unit tests for the development-host controller's pure logic (RO-034). No network, no git.
// Run: node --test scripts/dev-host/controller.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assessPullRequest } from './pr-assessment.mjs';
import { renderReport, sanitizeText } from './report.mjs';
import { ciState, codexReviewState, fixRoundsUsed, MAX_FIX_ROUNDS } from './review-state.mjs';
import { assessTasks, parseTaskBoard } from './tasks.mjs';
import { branchBelongsTo, checkWorktrees, parseWorktreeList } from './worktrees.mjs';

const HEAD = 'a1'.repeat(20);
const OLD = 'b2'.repeat(20);
const codexBot = { login: 'chatgpt-codex-connector[bot]', type: 'Bot' };
const owner = { login: 'owner1', type: 'User' };
const stranger = { login: 'someone', type: 'User' };
const maintainers = new Set(['owner1']);

const receipt = (commit, user = codexBot, at = '2026-11-01T00:00:00Z') => ({
  user,
  created_at: at,
  body: `<!-- codex-review-receipt:v1 -->\n\nCodex Review: Didn't find any major issues.\n\n**Reviewed commit:** \`${commit.slice(0, 10)}\``,
});
const findingsReview = (commit) => ({
  user: codexBot,
  commit_id: commit,
  submitted_at: '2026-11-02T00:00:00Z',
  body: `<!-- codex-review-receipt:v1 -->\n\n### Codex Review\n\n**Reviewed commit:** \`${commit.slice(0, 10)}\``,
});
const finding = (id, priority, commit = HEAD, user = codexBot) => ({
  id,
  user,
  original_commit_id: commit,
  commit_id: commit,
  path: 'src/x.ts',
  line: 12,
  body: `**<sub><sub>![${priority} Badge](https://img.shields.io/badge/${priority}-yellow?style=flat)</sub></sub>  Title**\n\nDetail.`,
});
const reply = (to, body, user = owner) => ({ id: 1000 + to, in_reply_to_id: to, user, body });

describe('codexReviewState', () => {
  it('is not-reviewed without Codex activity', () => {
    assert.equal(codexReviewState({ headSha: HEAD }).status, 'not-reviewed');
  });

  it('is reviewed with no findings when the receipt names the head', () => {
    const state = codexReviewState({ headSha: HEAD, issueComments: [receipt(HEAD)], maintainers });
    assert.deepEqual(state, { status: 'reviewed', reviewedCommit: HEAD, findings: [] });
  });

  it('is stale when the last review is of an older commit', () => {
    const state = codexReviewState({ headSha: HEAD, issueComments: [receipt(OLD)] });
    assert.equal(state.status, 'stale');
    assert.equal(state.reviewedCommit, OLD.slice(0, 10));
  });

  it('ignores receipts written by anyone but the Codex bot account', () => {
    const spoofs = [receipt(HEAD, stranger), receipt(HEAD, owner), receipt(HEAD, { login: 'other[bot]', type: 'Bot' }), receipt(HEAD, { login: codexBot.login, type: 'User' })];
    assert.equal(codexReviewState({ headSha: HEAD, issueComments: spoofs }).status, 'not-reviewed');
  });

  it('is pending while the summary marker says a review of the head is running', () => {
    const summary = (status, sha = HEAD) => ({
      user: codexBot,
      created_at: '2026-11-03T00:00:00Z',
      body: `<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 {"code_review":{"commit_sha":"${sha}","status":"${status}"}} -->`,
    });
    assert.equal(codexReviewState({ headSha: HEAD, issueComments: [receipt(OLD), summary('in_progress')] }).status, 'pending');
    assert.equal(codexReviewState({ headSha: HEAD, issueComments: [receipt(OLD), summary('completed')] }).status, 'stale');
    assert.equal(codexReviewState({ headSha: HEAD, issueComments: [receipt(OLD), summary('in_progress', OLD)] }).status, 'stale');
    // A re-review of the same head that is still running wins over that head's earlier receipt.
    assert.equal(codexReviewState({ headSha: HEAD, issueComments: [receipt(HEAD), summary('in_progress')] }).status, 'pending');
    assert.equal(codexReviewState({ headSha: HEAD, issueComments: [receipt(HEAD), summary('completed')] }).status, 'reviewed');
    const bad = { ...summary('x'), body: '<!-- codex-review-state:v1 {not json} -->' };
    assert.equal(codexReviewState({ headSha: HEAD, issueComments: [bad] }).status, 'not-reviewed');
  });

  it('collects findings at the head only, with their priority badge', () => {
    const state = codexReviewState({
      headSha: HEAD,
      reviews: [findingsReview(OLD), findingsReview(HEAD)],
      reviewComments: [finding(1, 'P1'), finding(2, 'P3'), finding(3, 'P0', OLD), finding(4, 'P0', HEAD, stranger)],
    });
    assert.equal(state.status, 'reviewed');
    assert.deepEqual(state.findings.map((f) => f.priority), ['P1', 'P3']);
    assert.deepEqual(state.findings[0], { priority: 'P1', path: 'src/x.ts', line: 12, reply: null });
  });

  it('treats an unlabelled Codex finding as P2', () => {
    const unlabeled = { ...finding(1, 'P1'), body: 'No badge here' };
    const state = codexReviewState({ headSha: HEAD, reviews: [findingsReview(HEAD)], reviewComments: [unlabeled] });
    assert.equal(state.findings[0].priority, 'P2');
  });

  it('records maintainer replies to findings and ignores everyone else', () => {
    const state = codexReviewState({
      headSha: HEAD,
      maintainers,
      reviews: [findingsReview(HEAD)],
      reviewComments: [
        finding(1, 'P2'), reply(1, 'Not changed: covered by the contract suite.'),
        finding(2, 'P2'), reply(2, 'Not changed: trust me', stranger),
        finding(3, 'P1'), reply(3, 'Needs owner decision: scope?'),
        finding(4, 'P2'), reply(4, 'Fixed in `abcdef1`: added a test', codexBot),
      ],
    });
    assert.deepEqual(state.findings.map((f) => f.reply), ['not-changed', null, 'needs-owner', null]);
  });
});

describe('fixRoundsUsed', () => {
  const comment = (body, user = owner) => ({ user, body });

  it('reads both round formats and keeps the highest round', () => {
    const rounds = fixRoundsUsed([
      comment('Round 1/2 at abc1234 — fixed: x; npm run verify: ok\n@codex review'),
      comment(`Round 2/2 started at ${HEAD}`),
    ], maintainers);
    assert.deepEqual(rounds, { used: 2, lastSha: HEAD });
  });

  it('counts owner-extended rounds such as "Round 4/4" without trusting the denominator', () => {
    const rounds = fixRoundsUsed([comment('Round 4/4 at da05347 (owner-authorized; the last round)')], maintainers);
    assert.equal(rounds.used, 4);
    assert.equal(MAX_FIX_ROUNDS, 2);
  });

  it('ignores non-maintainers, bots and mentions that are not at the start of a line', () => {
    const rounds = fixRoundsUsed([
      comment('Round 1/2 at abc1234', stranger),
      comment('Round 1/2 at abc1234', codexBot),
      comment('As discussed, Round 2/2 at abc1234 is next'),
    ], maintainers);
    assert.deepEqual(rounds, { used: 0, lastSha: null });
  });
});

describe('ciState', () => {
  const run = (name, status, conclusion = null) => ({ name, status, conclusion });
  it('classifies check runs', () => {
    assert.deepEqual(ciState([]), { state: 'none', failing: [] });
    assert.equal(ciState([run('a', 'completed', 'success'), run('b', 'in_progress')]).state, 'pending');
    assert.equal(ciState([run('a', 'completed', 'success'), run('b', 'completed', 'skipped'), run('c', 'completed', 'neutral')]).state, 'green');
    assert.deepEqual(ciState([run('a', 'completed', 'failure'), run('b', 'in_progress'), run('c', 'completed', 'cancelled')]), { state: 'failing', failing: ['a', 'c'] });
  });
});

describe('assessPullRequest', () => {
  const pr = (extra = {}) => ({ number: 7, title: 't', draft: false, base: 'main', headSha: HEAD, headRef: 'claude/RO-001-x', ...extra });
  const green = { state: 'green', failing: [] };
  const reviewed = (findings = []) => ({ status: 'reviewed', reviewedCommit: HEAD, findings });
  const f = (priority, reply = null) => ({ priority, path: 'x', line: 1, reply });
  const assess = (overrides) => assessPullRequest({ pr: pr(), ci: green, codex: reviewed(), rounds: { used: 0 }, ...overrides });

  it('leaves drafts alone', () => {
    assert.equal(assess({ pr: pr({ draft: true }), ci: { state: 'failing', failing: ['x'] } }).verdict, 'draft');
  });

  it('sends CI failures to the author, or to the owner at the round cap', () => {
    const ci = { state: 'failing', failing: ['Boundaries, typecheck and tests'] };
    assert.deepEqual([assess({ ci }).verdict, assess({ ci }).actor], ['ci-failing', 'agent']);
    assert.deepEqual([assess({ ci, rounds: { used: 2 } }).verdict, assess({ ci, rounds: { used: 2 } }).actor], ['escalate', 'owner']);
  });

  it('sanitizes and truncates failing check names, which a PR can choose', () => {
    const ci = { state: 'failing', failing: ['@codex review `x` | <b>', 'b', 'c', 'd', 'e'] };
    const { action } = assess({ ci });
    assert.doesNotMatch(action, /@codex/);
    assert.doesNotMatch(action, /<b>|\|/);
    assert.match(action, /and 2 more/);
  });

  it('waits for running CI and running reviews, and flags missing CI', () => {
    assert.equal(assess({ ci: { state: 'pending', failing: [] } }).verdict, 'ci-pending');
    assert.equal(assess({ ci: { state: 'none', failing: [] } }).verdict, 'ci-missing');
    assert.equal(assess({ codex: { status: 'pending', reviewedCommit: null, findings: [] } }).verdict, 'review-pending');
  });

  it('asks for a Codex review of the exact head when the review is missing or stale', () => {
    const stale = assess({ codex: { status: 'stale', reviewedCommit: OLD.slice(0, 10), findings: [] } });
    assert.equal(stale.verdict, 'review-needed');
    assert.match(stale.action, new RegExp(`head \`${HEAD.slice(0, 7)}\`.*last review at \`${OLD.slice(0, 7)}\``));
    assert.equal(assess({ codex: { status: 'not-reviewed', reviewedCommit: null, findings: [] } }).verdict, 'review-needed');
  });

  it('offers the next bounded fix round for blocking or unanswered findings', () => {
    const p1 = assess({ codex: reviewed([f('P1')]), rounds: { used: 1 } });
    assert.equal(p1.verdict, 'fix-round');
    assert.match(p1.action, /Fix round 2\/2 may be started \(manual launch\)/);
    assert.equal(assess({ codex: reviewed([f('P2')]) }).verdict, 'fix-round');
  });

  it('escalates to the owner at the cap, on disputed P0/P1 and on owner questions', () => {
    for (const used of [2, 4]) {
      const result = assess({ codex: reviewed([f('P0')]), rounds: { used } });
      assert.deepEqual([result.verdict, result.actor], ['escalate', 'owner']);
      assert.match(result.action, new RegExp(`${used} used, cap 2`));
    }
    assert.equal(assess({ codex: reviewed([f('P1', 'not-changed')]) }).verdict, 'escalate');
    assert.equal(assess({ codex: reviewed([f('P3', 'needs-owner')]) }).verdict, 'escalate');
  });

  it('hands a green, reviewed head with settled findings to the owner, never merging it', () => {
    const clean = assess({});
    assert.deepEqual([clean.verdict, clean.actor], ['merge-decision', 'owner']);
    const settled = assess({ codex: reviewed([f('P2', 'not-changed'), f('P3')]) });
    assert.equal(settled.verdict, 'merge-decision');
    assert.match(settled.action, /1× P2, 1× P3/);
    assert.equal(assess({ pr: pr({ base: 'claude/RO-013-x' }) }).verdict, 'waiting-on-base');
  });
});

describe('task board', () => {
  const board = [
    '# Tasks', '', '> Next free ID: RO-099', '', '## Board', '',
    '| ID | Title | Owner | Pri | Status | Depends on | Branch / PR |',
    '|---|---|---|---|---|---|---|',
    '| RO-001 | Base | Claude Code | P1 | done | — | merged |',
    '| RO-002 | After base | Claude Code | P2 | todo | RO-001 merged | — |',
    '| RO-003 | Needs RO-004 | Codex | P2 | todo | RO-004 | — |',
    '| RO-004 | In flight | Claude Code | P1 | in-progress | — | — |',
    '| RO-005 | Go-ahead | Claude Code | P2 | todo | RO-001 (done); owner go-ahead | — |',
    '| RO-006 | Has branch PR | Claude Code | P2 | todo | — | — |',
    '| RO-007 | Linked PR | Gemini | P3 | todo | — | [PR #9](https://example.invalid/pull/9) |',
    '| RO-008 | Unknown dep | Owner | P3 | todo | RO-777 | — |',
    '', '## Task details', '', '| RO-009 | Not | a | board | todo | row | here |',
  ].join('\n');

  it('parses only the Board table', () => {
    const tasks = parseTaskBoard(board);
    assert.deepEqual(tasks.map((t) => t.id), ['RO-001', 'RO-002', 'RO-003', 'RO-004', 'RO-005', 'RO-006', 'RO-007', 'RO-008']);
    assert.deepEqual(parseTaskBoard('# nothing'), []);
  });

  it('classifies todo tasks as ready, confirm or blocked', () => {
    const result = assessTasks(parseTaskBoard(board), [
      { number: 7, headRef: 'claude/RO-006-start' },
      { number: 9, headRef: 'gemini/other' },
    ]);
    const by = Object.fromEntries(result.map((t) => [t.id, t]));
    assert.deepEqual(Object.keys(by), ['RO-002', 'RO-003', 'RO-005', 'RO-006', 'RO-007', 'RO-008']);
    assert.equal(by['RO-002'].readiness, 'ready');
    assert.deepEqual([by['RO-003'].readiness, by['RO-003'].unmet], ['blocked', ['RO-004']]);
    assert.equal(by['RO-005'].readiness, 'confirm');
    assert.deepEqual([by['RO-006'].readiness, by['RO-006'].openPulls], ['confirm', [7]]);
    assert.deepEqual([by['RO-007'].readiness, by['RO-007'].openPulls], ['confirm', [9]]);
    assert.deepEqual([by['RO-008'].readiness, by['RO-008'].unmet], ['blocked', ['RO-777']]);
  });
});

describe('worktrees', () => {
  const porcelain = [
    'worktree C:/dev/Repo', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
    'worktree C:/dev/Repo-Claude', 'HEAD 2222222222222222222222222222222222222222', 'branch refs/heads/claude/RO-034-x', '',
    'worktree C:/dev/Repo-Codex', 'HEAD 3333333333333333333333333333333333333333', 'branch refs/heads/local/codex-review', '',
    'worktree C:/dev/Repo-Loose', 'HEAD 4444444444444444444444444444444444444444', 'detached', '',
  ].join('\r\n');
  const list = parseWorktreeList(porcelain);
  const levels = (roles) => checkWorktrees(list, roles).map((r) => r.level);

  it('parses porcelain output', () => {
    assert.equal(list.length, 4);
    assert.deepEqual(list[1], { path: 'C:/dev/Repo-Claude', head: '2'.repeat(40), branch: 'claude/RO-034-x', detached: false, bare: false });
    assert.equal(list[3].detached, true);
  });

  it('accepts separate worktrees on each agent’s own branches', () => {
    assert.deepEqual(levels({ claude: 'C:\\dev\\Repo-Claude\\', codex: 'c:/dev/repo-codex' }), ['ok', 'ok']);
  });

  it('flags shared, missing, main-branch, foreign-branch and detached worktrees', () => {
    assert.deepEqual(levels({ claude: 'C:/dev/Repo-Claude', codex: 'c:\\dev\\repo-claude' }), ['error', 'ok', 'warning']);
    assert.deepEqual(levels({ claude: 'C:/dev/Repo' }), ['error']);
    assert.deepEqual(levels({ codex: 'C:/dev/Nope' }), ['error']);
    assert.deepEqual(levels({ claude: 'C:/dev/Repo-Loose' }), ['warning']);
    assert.deepEqual(levels({}), ['warning']);
  });

  it('matches agent branch prefixes exactly', () => {
    assert.equal(branchBelongsTo('claude', 'claude/RO-1-x'), true);
    assert.equal(branchBelongsTo('claude', 'local/claude-development'), true);
    assert.equal(branchBelongsTo('claude', 'claudette/x'), false);
    assert.equal(branchBelongsTo('codex', 'local/claude-development'), false);
  });
});

describe('report', () => {
  it('sanitizes untrusted text into one inert line', () => {
    const text = sanitizeText('Fix\n| col | <img src=x onerror=alert(1)> `rm -rf` @codex review \u202Eevil\u200B');
    assert.doesNotMatch(text, /[\n|<>`\u202E\u200B]/);
    assert.doesNotMatch(text, /@codex/);
    assert.match(text, /@\u2060codex/);
    assert.equal(sanitizeText('x'.repeat(200), 20).length, 20);
  });

  it('leaves no live Markdown image, link, autolink or emphasis', () => {
    const image = sanitizeText('![CI passed](https://attacker.invalid/pixel.png)');
    assert.equal(image, '\\!\\[CI passed\\]\\(https:\u2060//attacker.invalid/pixel.png\\)');
    const mixed = sanitizeText('[click](http://x.invalid) **bold** _i_ ~s~ # h www.evil.invalid \\');
    assert.doesNotMatch(mixed, /(?<!\\)[[\]()*_~#]/, 'every Markdown metacharacter is escaped');
    assert.doesNotMatch(mixed, /:\/\/|www\./, 'no autolink survives');
    assert.match(mixed, /\\\\$/, 'a trailing backslash is escaped too');
    // Truncation happens before escaping, so an escape is never split.
    assert.equal(sanitizeText('ab[cdef', 4), 'ab\\[…');
  });

  it('renders sections, task readiness and warnings', () => {
    const report = renderReport({
      generatedAt: '2026-11-09T00:00:00.000Z',
      repo: 'o/r',
      mainSha: 'c'.repeat(40),
      pulls: [
        { number: 1, title: 'Ready | @owner', headRef: '', assessment: { verdict: 'merge-decision', actor: 'owner', action: 'Ready for your merge decision.' } },
        { number: 2, title: 'Draft', headRef: '', assessment: { verdict: 'draft', actor: 'none', action: 'Draft.' } },
      ],
      tasks: [
        { id: 'RO-002', title: 'T', owner: 'Claude Code', priority: 'P2', readiness: 'ready', unmet: [], openPulls: [], dependsOn: '—' },
        { id: 'RO-003', title: 'U', owner: 'Codex', priority: 'P2', readiness: 'blocked', unmet: ['RO-004'], openPulls: [], dependsOn: 'RO-004' },
      ],
      worktrees: [{ level: 'ok', message: 'claude: C:/x on `claude/RO-1-x`.' }],
      warnings: ['one'],
    });
    assert.match(report, /## Owner actions \(1\)\n\n- \*\*PR #1\*\* Ready \/ @\u2060owner: Ready for your merge decision\./);
    assert.match(report, /## Agent work \(manual launch only\) \(0\)\n\nNone\./);
    assert.match(report, /## Waiting \(1\)/);
    assert.match(report, /\| RO-002 T \| Claude Code \| P2 \| ready \| — \|/);
    assert.match(report, /Blocked by unfinished tasks: RO-003 \(needs RO-004\)\./);
    assert.match(report, /## Warnings\n\n- one/);
    assert.match(report, /Read-only: this report took no action/);
  });
});
