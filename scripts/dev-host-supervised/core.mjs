import { createHash } from 'node:crypto';

export const digest = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const SHA = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export function requireThat(condition, code) { if (!condition) throw new Error(code); }

export function validateConfig(c) {
  requireThat(c?.version === 1 && typeof c.project === 'string' && ID.test(c.project) && typeof c.repo === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(c.repo), 'CONFIG');
  requireThat(typeof c.executionEnabled === 'boolean' && c.autoMerge === false && c.maxFixRounds === 2, 'POLICY');
  requireThat(/^[\w/-]+$/.test(c.baseBranch) && !c.baseBranch.includes('..'), 'BASE');
  requireThat(Array.isArray(c.maintainers) && c.maintainers.length > 0 && c.maintainers.every(x => /^[\w-]+$/.test(x)), 'MAINTAINERS');
  requireThat(Array.isArray(c.tasks) && c.tasks.length <= 100, 'TASKS');
  const ids = new Set(), prs = new Set();
  for (const t of c.tasks) {
    requireThat(typeof t.id === 'string' && ID.test(t.id) && Number.isSafeInteger(t.pr) && t.pr > 0 && !ids.has(t.id) && !prs.has(t.pr), 'TASK');
    requireThat(/^claude\/[A-Za-z0-9_/-]+$/.test(t.branch) && !t.branch.includes('..'), 'BRANCH');
    requireThat(typeof t.allowImplementation === 'boolean' && Array.isArray(t.dependencies) && t.dependencies.every(n => Number.isSafeInteger(n) && n > 0 && n !== t.pr), 'DEPENDENCIES');
    ids.add(t.id); prs.add(t.pr);
  }
  requireThat(Array.isArray(c.workflows) && c.workflows.length > 0, 'WORKFLOWS');
  for (const w of c.workflows) requireThat(/^\.github\/workflows\/[\w-]+\.ya?ml$/.test(w.path) && Array.isArray(w.jobs) && w.jobs.length > 0 && w.jobs.every(j => typeof j === 'string' && j.length > 0 && j.length < 200), 'JOBS');
  requireThat(new Set(c.workflows.map(w => w.path)).size === c.workflows.length, 'WORKFLOWS');
  return c;
}

// Accept only complete successful workflow attempts and every configured job in that suite.
export function completeCI(head, workflows, runs, checks) {
  for (const required of workflows) {
    const candidates = runs.filter(r => r.head_sha === head && r.event === 'pull_request' && r.path?.split('@')[0] === required.path);
    candidates.sort((a,b) => b.id - a.id || (b.run_attempt ?? 1) - (a.run_attempt ?? 1));
    const run = candidates[0];
    if (!run || run.status !== 'completed' || run.conclusion !== 'success' || !Number.isSafeInteger(run.check_suite_id)) return false;
    for (const name of required.jobs) {
      const jobs = checks.filter(j => j.head_sha === head && j.check_suite?.id === run.check_suite_id && j.name === name);
      // Ambiguous duplicates are not silently resolved; request a clean rerun/evidence.
      if (jobs.length !== 1 || jobs[0].status !== 'completed' || jobs[0].conclusion !== 'success') return false;
    }
  }
  return checks.every(j => j.head_sha === head && j.status === 'completed' && ['success','neutral','skipped'].includes(j.conclusion));
}

export function failedCI(head, workflows, runs, checks) {
  return workflows.some(w => {
    const run = runs.filter(r => r.head_sha === head && r.event === 'pull_request' && r.path?.split('@')[0] === w.path)
      .sort((a,b) => b.id-a.id || (b.run_attempt ?? 1)-(a.run_attempt ?? 1))[0];
    return run?.status === 'completed' && (run.conclusion !== 'success' || checks.some(j => j.head_sha === head && j.check_suite?.id === run.check_suite_id && w.jobs.includes(j.name) && j.status === 'completed' && j.conclusion !== 'success'));
  });
}

export function initialState(c) {
  return { version: 1, project: c.project, repo: c.repo, tasks: c.tasks.map(t => ({ id:t.id, pr:t.pr, phase:t.allowImplementation ? 'implement' : 'review', rounds:0, lastReview:null })), active:null };
}

export function enroll(state,c) {
  requireThat(state.repo === c.repo && state.project === c.project && !state.active, 'STATE_PROJECT_OR_ACTIVE');
  const next=structuredClone(state);
  for (const task of c.tasks) {
    const existing=next.tasks.find(t => t.id === task.id || t.pr === task.pr);
    if (existing) requireThat(existing.id === task.id && existing.pr === task.pr, 'TASK_IDENTITY_CHANGED');
    else next.tasks.push({id:task.id,pr:task.pr,phase:task.allowImplementation?'implement':'review',rounds:0,lastReview:null});
  }
  next.tasks.sort((a,b)=>a.pr-b.pr);
  return next;
}

export function decide(c, state, task, facts) {
  requireThat(state.repo === c.repo && state.project === c.project, 'STATE_PROJECT');
  const entry = state.tasks.find(t => t.id === task.id && t.pr === task.pr);
  requireThat(entry && Number.isSafeInteger(entry.rounds) && entry.rounds >= 0, 'STATE_TASK');
  if (state.active) return 'recovery-required';
  if (entry.phase === 'blocked') return 'blocked';
  if (!facts.complete || !facts.dependenciesMet || !facts.worktreesValid) return 'blocked';
  const p = facts.pr;
  if (p.state !== 'open' || p.head.repo.full_name !== c.repo || p.base.repo.full_name !== c.repo || p.base.ref !== c.baseBranch || p.head.ref !== task.branch || !SHA.test(p.head.sha)) return 'blocked';
  const rounds = Math.max(entry.rounds, facts.rounds);
  if (!Number.isSafeInteger(rounds) || rounds > 2) return 'blocked';
  if (entry.phase === 'implement' && task.allowImplementation && p.draft === true && rounds === 0) return 'implement';
  if (p.draft !== false) return 'waiting';
  const review = facts.review;
  if (review.status === 'pending') return 'waiting';
  const atHead = review.status === 'reviewed' && review.reviewedCommit === p.head.sha;
  if (!atHead) return entry.lastReview === p.head.sha ? 'waiting' : 'review';
  if (review.findings.some(f => f.reply === 'needs-owner' || (['P0','P1'].includes(f.priority) && f.reply === 'not-changed'))) return 'blocked';
  const fixes = review.findings.some(f => ['P0','P1'].includes(f.priority) || (f.priority === 'P2' && f.reply === null));
  if (fixes || facts.ciFailing) return rounds >= 2 ? 'blocked' : 'fix';
  if (!facts.ciGreen) return 'waiting';
  return 'owner-merge-decision';
}

export function reserve(state, task, facts, action, approval) {
  requireThat(!state.active && ['implement','fix','review'].includes(action), 'RESERVATION');
  const next = structuredClone(state), entry = next.tasks.find(t => t.id === task.id);
  entry.rounds = Math.max(entry.rounds, facts.rounds);
  if (action === 'fix') { requireThat(entry.rounds < 2, 'ROUND_CAP'); entry.rounds++; }
  if (action === 'implement') entry.phase = 'review'; // never replay an interrupted implementation
  if (action === 'review') entry.lastReview = facts.pr.head.sha;
  next.active = { task:task.id, action, sha:facts.pr.head.sha, approval, round:entry.rounds };
  return next;
}

export function finish(state, ok) {
  requireThat(state.active, 'NO_RESERVATION');
  const next = structuredClone(state), entry = next.tasks.find(t => t.id === next.active.task);
  entry.phase = ok ? 'review' : 'blocked';
  next.active = null;
  return next;
}
