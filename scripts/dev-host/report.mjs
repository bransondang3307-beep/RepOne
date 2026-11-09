// Renders the owner-action report (RO-034). Pure functions: no I/O.
//
// Untrusted text (PR titles, branch names, task text) is passed through sanitizeText(): one line, no
// control characters, no HTML, no table-breaking pipes, no backticks, and no live @-mentions, so the
// report can be pasted into a GitHub comment without pinging anyone or triggering `@codex`.

const MAX_TEXT = 90;

export function sanitizeText(value, max = MAX_TEXT) {
  let text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[<>]/g, (c) => (c === '<' ? '\u2039' : '\u203a'))
    .replace(/`/g, "'")
    .replace(/\|/g, '/')
    .replace(/@/g, '@\u2060'); // word joiner after @ keeps it readable but breaks the mention
  if (text.length > max) text = `${text.slice(0, max - 1)}…`;
  return text;
}

const SECTIONS = [
  ['owner', 'Owner actions'],
  ['agent', 'Agent work (manual launch only)'],
  ['none', 'Waiting'],
];

/**
 * @param {{
 *   generatedAt: string, repo: string, mainSha: string|null,
 *   pulls: Array<{ number: number, title: string, headRef: string, assessment: { verdict: string, actor: string, action: string } }>,
 *   tasks: ReturnType<import('./tasks.mjs').assessTasks>,
 *   worktrees: Array<{ level: string, message: string }>,
 *   warnings: string[],
 * }} snapshot
 */
export function renderReport(snapshot) {
  const out = [];
  out.push('# Development host report', '');
  out.push(
    `Generated ${sanitizeText(snapshot.generatedAt)} for \`${sanitizeText(snapshot.repo)}\`` +
      (snapshot.mainSha ? `, \`main\` at \`${snapshot.mainSha.slice(0, 7)}\`` : '') +
      '. Read-only: this report took no action on GitHub, Git or any agent.',
    '',
  );

  for (const [actor, heading] of SECTIONS) {
    const items = snapshot.pulls.filter((pull) => pull.assessment.actor === actor);
    out.push(`## ${heading} (${items.length})`, '');
    if (items.length === 0) out.push('None.');
    for (const pull of items) {
      out.push(`- **PR #${pull.number}** ${sanitizeText(pull.title)}: ${pull.assessment.action}`);
    }
    out.push('');
  }

  const order = { ready: 0, confirm: 1, blocked: 2 };
  const tasks = [...snapshot.tasks].sort((a, b) => order[a.readiness] - order[b.readiness] || a.id.localeCompare(b.id));
  const actionable = tasks.filter((task) => task.readiness !== 'blocked');
  out.push(`## Tasks to start (${actionable.length} of ${tasks.length} \`todo\`)`, '');
  if (actionable.length === 0) out.push('None.');
  else {
    out.push('| Task | Owner | Pri | Readiness | Note |', '|---|---|---|---|---|');
    for (const task of actionable) {
      const notes = [];
      if (task.openPulls.length > 0) notes.push(`open PR ${task.openPulls.map((n) => `#${n}`).join(', ')}`);
      if (task.readiness === 'confirm' && task.dependsOn && task.dependsOn !== '—') notes.push(`confirm: ${sanitizeText(task.dependsOn, 70)}`);
      out.push(
        `| ${sanitizeText(task.id)} ${sanitizeText(task.title, 60)} | ${sanitizeText(task.owner, 30)} | ${sanitizeText(task.priority, 4)} | ${task.readiness} | ${notes.join('; ') || '—'} |`,
      );
    }
  }
  const blocked = tasks.filter((task) => task.readiness === 'blocked');
  if (blocked.length > 0) {
    out.push('', `Blocked by unfinished tasks: ${blocked.map((task) => `${sanitizeText(task.id)} (needs ${task.unmet.join(', ')})`).join('; ')}.`);
  }
  out.push('', 'Readiness is advisory. Start a task only if `TASKS.md` assigns it to that agent (`AGENTS.md` §3 step 2).', '');

  out.push('## Worktrees', '');
  for (const result of snapshot.worktrees) out.push(`- ${result.level.toUpperCase()}: ${sanitizeText(result.message, 200)}`);
  out.push('');

  if (snapshot.warnings.length > 0) {
    out.push('## Warnings', '');
    for (const warning of snapshot.warnings) out.push(`- ${sanitizeText(warning, 200)}`);
    out.push('');
  }
  return out.join('\n');
}
