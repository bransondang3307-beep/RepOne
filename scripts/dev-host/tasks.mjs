// Reads the TASKS.md board and lists tasks that look ready to start (RO-034). Pure functions: no I/O.
//
// "Ready" here is a recommendation for the owner, not an assignment: AGENTS.md §3 step 2 still applies
// (the task must be assigned to the agent and its dependencies done). Free-text conditions in the
// "Depends on" column (owner go-ahead, device checks, decisions) cannot be checked by a program, so
// such tasks are listed as "confirm" rather than "ready".

const TASK_ID = /\bRO-[0-9]{3,}\b/g;
const BRANCH_TASK = /^(?:claude|codex|gemini|chatgpt|owner)\/(RO-[0-9]{3,})-/;
const PR_REF = /PR #([1-9][0-9]*)/g;

function cells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

/** Parses the "## Board" table. Returns [] if the board is missing. */
export function parseTaskBoard(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+Board\s*$/.test(line));
  if (start < 0) return [];
  const tasks = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const row = cells(line);
    if (!row || row.length < 7 || !/^RO-[0-9]{3,}$/.test(row[0])) continue;
    const [id, title, owner, priority, status, dependsOn, branchOrPr] = row;
    tasks.push({ id, title, owner, priority, status, dependsOn, branchOrPr });
  }
  return tasks;
}

function hasOtherConditions(dependsOn) {
  const rest = dependsOn
    .replace(TASK_ID, ' ')
    .replace(/\((?:done|merged)[^)]*\)/gi, ' ')
    .replace(/\b(?:merged|done|and)\b/gi, ' ')
    .replace(/[—–\-;,.()]/g, ' ');
  return /[A-Za-z0-9§#]/.test(rest);
}

/**
 * @param {ReturnType<typeof parseTaskBoard>} tasks
 * @param {Array<{ number: number, headRef: string }>} openPulls
 * @returns {Array<{ id, title, owner, priority, readiness: 'ready'|'confirm'|'blocked', unmet: string[], openPulls: number[], dependsOn: string }>}
 */
export function assessTasks(tasks, openPulls = []) {
  const status = new Map(tasks.map((task) => [task.id, task.status]));
  const pullsByTask = new Map();
  for (const pull of openPulls) {
    const id = BRANCH_TASK.exec(pull.headRef ?? '')?.[1];
    if (id) pullsByTask.set(id, [...(pullsByTask.get(id) ?? []), pull.number]);
  }
  const openNumbers = new Set(openPulls.map((pull) => pull.number));

  return tasks
    .filter((task) => task.status === 'todo')
    .map((task) => {
      const deps = [...new Set(task.dependsOn.match(TASK_ID) ?? [])].filter((id) => id !== task.id);
      const unmet = deps.filter((id) => status.get(id) !== 'done');
      const linked = [...task.branchOrPr.matchAll(PR_REF)].map((match) => Number(match[1])).filter((n) => openNumbers.has(n));
      const pulls = [...new Set([...(pullsByTask.get(task.id) ?? []), ...linked])].sort((a, b) => a - b);
      let readiness;
      if (unmet.length > 0) readiness = 'blocked';
      else if (hasOtherConditions(task.dependsOn) || pulls.length > 0) readiness = 'confirm';
      else readiness = 'ready';
      return { id: task.id, title: task.title, owner: task.owner, priority: task.priority, readiness, unmet, openPulls: pulls, dependsOn: task.dependsOn };
    });
}
