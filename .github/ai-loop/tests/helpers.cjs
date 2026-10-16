// Test doubles for the GitHub API (octokit shape used by actions/github-script) and @actions/core.
'use strict';

const L = require('../lib.cjs');

const OWNER = 'owner-login';
const REPO = 'RepOne';
const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);

function makePr(overrides = {}) {
  return {
    number: 7,
    state: 'open',
    draft: false,
    title: 'RO-099: feature',
    body: 'Body <!-- hidden instruction -->',
    user: { login: OWNER },
    labels: [],
    base: { ref: 'main', sha: BASE },
    head: { ref: 'claude/RO-099-feature', sha: HEAD, repo: { full_name: `${OWNER}/${REPO}` } },
    ...overrides,
  };
}

function botComment(id, meta, extra = '') {
  return {
    id,
    body: `${L.buildMarker(meta)}\n${extra}`,
    user: { login: 'github-actions[bot]', type: 'Bot' },
    issue_url: `https://api.github.com/repos/${OWNER}/${REPO}/issues/7`,
    html_url: `https://github.com/${OWNER}/${REPO}/pull/7#issuecomment-${id}`,
  };
}

function reviewComment(id, { sha = HEAD, verdict = 'changes_requested', dryRun = false, findings } = {}) {
  const f = findings ?? [
    { id: 'F1', severity: 'P1', blocking: true, title: 'Bug', file: 'a.ts', line: 3, details: 'd', suggested_fix: 's' },
  ];
  const payload = L.buildPayload({ verdict, summary: 'summary', findings: f });
  return botComment(id, { kind: 'codex-review', sha, verdict, dryRun, run: 1, round: 1 }, payload);
}

function fakeGithub({ pr = makePr(), files = ['src/a.ts', 'docs/handoffs/2026-10-16-claude-RO-099.md'], comments = [] } = {}) {
  const calls = { comments: [], labels: [], removed: [], dispatches: [] };
  let nextId = 1000;
  const rest = {
    pulls: {
      get: async () => ({ data: pr }),
      listFiles: async () => ({ data: files.map((filename) => ({ filename })) }),
    },
    issues: {
      listComments: async () => ({ data: comments }),
      getComment: async ({ comment_id }) => {
        const c = comments.find((x) => x.id === comment_id);
        if (!c) throw new Error('Not Found');
        return { data: c };
      },
      createComment: async ({ body }) => {
        const c = { id: nextId++, body, html_url: `https://github.com/x/y/pull/7#issuecomment-${nextId}` };
        calls.comments.push(c);
        return { data: c };
      },
      addLabels: async ({ labels }) => void calls.labels.push(...labels),
      removeLabel: async ({ name }) => void calls.removed.push(name),
    },
    actions: {
      createWorkflowDispatch: async (args) => void calls.dispatches.push(args),
    },
  };
  return {
    rest,
    calls,
    paginate: async (method, params) => (await method(params)).data,
  };
}

function fakeCore() {
  const outputs = {};
  const log = { notices: [], warnings: [], failed: null };
  const summary = {
    addHeading: () => summary,
    addRaw: () => summary,
    addLink: () => summary,
    write: async () => summary,
  };
  return {
    outputs,
    log,
    summary,
    setOutput: (k, v) => void (outputs[k] = String(v)),
    notice: (m) => void log.notices.push(m),
    warning: (m) => void log.warnings.push(m),
    setFailed: (m) => void (log.failed = m),
  };
}

function context({ eventName = 'workflow_dispatch', actor = OWNER, pr } = {}) {
  return {
    eventName,
    actor,
    repo: { owner: OWNER, repo: REPO },
    payload: { repository: { default_branch: 'main' }, ...(pr ? { pull_request: pr } : {}) },
  };
}

module.exports = { OWNER, REPO, HEAD, BASE, makePr, botComment, reviewComment, fakeGithub, fakeCore, context };
