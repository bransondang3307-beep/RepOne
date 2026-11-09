// Decides the next action for one open PR (RO-034). Pure function: no I/O.
//
// The controller only recommends. Every action below is taken by a person (the owner) or by an agent
// session that a person starts. It never merges, approves, pushes, comments or launches an agent.

import { sanitizeText } from './report.mjs';
import { MAX_FIX_ROUNDS } from './review-state.mjs';

const BLOCKING = new Set(['P0', 'P1']);

/**
 * @param {{
 *   pr: { number: number, title: string, draft: boolean, base: string, headSha: string, headRef: string },
 *   ci: { state: 'pending'|'failing'|'incomplete'|'green', failing: string[], missing?: string[] },
 *   codex: { status: string, reviewedCommit: string|null, findings: Array<{ priority: string, reply: string|null }> },
 *   rounds: { used: number },
 *   maxRounds?: number,
 * }} input
 * @returns {{ verdict: string, actor: 'owner'|'agent'|'none', action: string }}
 */
export function assessPullRequest({ pr, ci, codex, rounds, maxRounds = MAX_FIX_ROUNDS }) {
  const head = pr.headSha.slice(0, 7);
  const atLimit = rounds.used >= maxRounds;

  if (pr.draft) return { verdict: 'draft', actor: 'none', action: 'Draft. No action until it is marked ready.' };
  if (ci.state === 'failing') {
    return atLimit
      ? { verdict: 'escalate', actor: 'owner', action: `CI fails at \`${head}\` (${failingNames(ci)}) and the fix-round cap is reached (${rounds.used} used, cap ${maxRounds}). Owner decision.` }
      : { verdict: 'ci-failing', actor: 'agent', action: `CI fails at \`${head}\` (${failingNames(ci)}). The PR's author fixes it.` };
  }
  if (ci.state === 'pending') return { verdict: 'ci-pending', actor: 'none', action: `CI is running at \`${head}\`. Wait.` };
  if (ci.state !== 'green') {
    // 'incomplete' (a required job or the CI run is missing) and any unknown state: never green.
    const missing = (ci.missing ?? []).slice(0, 3).map((name) => sanitizeText(name, 50)).join(', ') || 'unknown';
    return { verdict: 'ci-incomplete', actor: 'agent', action: `CI at \`${head}\` is incomplete (missing: ${missing}). Re-run CI; no review or merge decision until every required job passes.` };
  }

  if (codex.status === 'pending') return { verdict: 'review-pending', actor: 'none', action: `Codex is reviewing \`${head}\`. Wait.` };
  if (codex.status === 'not-reviewed' || codex.status === 'stale') {
    const last = codex.reviewedCommit ? ` (last review at \`${codex.reviewedCommit.slice(0, 7)}\`)` : '';
    return { verdict: 'review-needed', actor: 'agent', action: `Request a Codex review of head \`${head}\`${last}: comment \`@codex review\`.` };
  }

  const counts = summarize(codex.findings);
  // A P2 is settled once a maintainer has answered it. A P0/P1 clears only with a fix (a new head); a
  // "Not changed:" answer to a P0/P1 is a disputed blocking finding, which the owner decides.
  const ownerQuestion = codex.findings.some((finding) => finding.reply === 'needs-owner');
  const disputed = codex.findings.some((finding) => BLOCKING.has(finding.priority) && finding.reply === 'not-changed');
  if (ownerQuestion || disputed) {
    const why = ownerQuestion ? 'asks for an owner decision' : 'is a P0/P1 answered "Not changed"';
    return { verdict: 'escalate', actor: 'owner', action: `A Codex finding at \`${head}\` ${why} (${counts}). Owner decision.` };
  }
  const blocking = codex.findings.filter((finding) => BLOCKING.has(finding.priority));
  const unanswered = codex.findings.filter((finding) => finding.priority === 'P2' && finding.reply === null);
  if (blocking.length > 0 || unanswered.length > 0) {
    const what = blocking.length > 0 ? `blocking findings (${counts})` : `unanswered P2 findings (${counts})`;
    if (atLimit) {
      return { verdict: 'escalate', actor: 'owner', action: `Codex reported ${what} at \`${head}\` and the fix-round cap is reached (${rounds.used} used, cap ${maxRounds}). Owner decision: park, accept or allow more work.` };
    }
    return {
      verdict: 'fix-round',
      actor: 'agent',
      action: `Codex reported ${what} at \`${head}\`. Fix round ${rounds.used + 1}/${maxRounds} may be started (manual launch).`,
    };
  }

  if (pr.base !== 'main') {
    return { verdict: 'waiting-on-base', actor: 'none', action: `Green and reviewed at \`${head}\`, but stacked on \`${pr.base}\`. Retarget after the base merges.` };
  }
  const note = codex.findings.length > 0 ? ` Remaining findings are answered or non-blocking (${counts}).` : '';
  return {
    verdict: 'merge-decision',
    actor: 'owner',
    action: `Ready for your merge decision: CI green and Codex reviewed head \`${head}\`.${note} Check its device, hardware and security gates and the handoff first.`,
  };
}

function summarize(findings) {
  const counts = {};
  for (const finding of findings) counts[finding.priority] = (counts[finding.priority] ?? 0) + 1;
  const parts = ['P0', 'P1', 'P2', 'P3'].filter((p) => counts[p]).map((p) => `${counts[p]}× ${p}`);
  return parts.length > 0 ? parts.join(', ') : 'none';
}

function failingNames(ci) {
  const names = ci.failing.slice(0, 3).map((name) => sanitizeText(name, 50));
  return ci.failing.length > 3 ? `${names.join(', ')} and ${ci.failing.length - 3} more` : names.join(', ');
}
