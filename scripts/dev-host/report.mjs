// Renders the owner-action report (RO-034). Pure functions: no I/O.
//
// Untrusted text (PR titles, branch names, check names, task text) goes through sanitizeText(): one line,
// no control, invisible or bidirectional characters, no HTML, no table-breaking pipes, no backticks, no
// Markdown links, images or emphasis, no autolinked URLs and no live @-mentions. So the report can be pasted
// into a GitHub comment without rendering attacker-chosen links or images, pinging anyone or triggering `@codex`.

const MAX_TEXT = 90;
const ch = (code) => String.fromCharCode(code);
const WORD_JOINER = ch(0x2060); // invisible; breaks mentions and autolinks
// C0/C1 controls, zero-width marks, line/paragraph separators, bidi overrides, word joiners, BOM.
const INVISIBLE = new RegExp(
  `[${[[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0xfeff, 0xfeff]]
    .map(([from, to]) => `${ch(from)}-${ch(to)}`)
    .join('')}]`,
  'g',
);

export function sanitizeText(value, max = MAX_TEXT) {
  let text = String(value ?? '').replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim();
  if (text.length > max) text = `${text.slice(0, max - 1)}${ch(0x2026)}`; // truncate first: no escape is cut in half
  return text
    .replace(/[<>]/g, (c) => (c === '<' ? ch(0x2039) : ch(0x203a)))
    .replace(/`/g, "'")
    .replace(/\|/g, '/')
    .replace(/[\\[\]()!*_~#]/g, '\\$&') // Markdown link, image, emphasis and heading syntax
    .replace(/:\/\//g, `:${WORD_JOINER}//`) // GitHub autolinks bare URLs
    .replace(/\bwww\./gi, (match) => `${match.slice(0, 3)}${WORD_JOINER}.`)
    .replace(/@/g, `@${WORD_JOINER}`);
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
