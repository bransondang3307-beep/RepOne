// Checks that Claude Code and Codex work in separate Git worktrees (RO-034). Pure functions: no I/O.

const PROTECTED_BRANCHES = new Set(['main', 'master']);

/** Parses `git worktree list --porcelain`. */
export function parseWorktreeList(text) {
  const entries = [];
  let current = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), head: null, branch: null, detached: false, bare: false };
      entries.push(current);
    } else if (current && line.startsWith('HEAD ')) current.head = line.slice(5);
    else if (current && line.startsWith('branch ')) current.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (current && line === 'detached') current.detached = true;
    else if (current && line === 'bare') current.bare = true;
  }
  return entries;
}

export function normalizePath(path) {
  return String(path).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** An agent's branches: `<agent>/…` for task work, or `local/<agent>-…` for its standing worktree branch. */
export function branchBelongsTo(agent, branch) {
  return new RegExp(`^(?:${agent}/|local/${agent}-)`).test(branch ?? '');
}

/**
 * @param {ReturnType<typeof parseWorktreeList>} worktrees
 * @param {{ claude?: string, codex?: string }} roles  configured worktree paths
 * @returns {Array<{ level: 'ok'|'warning'|'error', message: string }>}
 */
export function checkWorktrees(worktrees, roles) {
  const results = [];
  const configured = Object.entries(roles).filter(([, path]) => typeof path === 'string' && path.length > 0);
  if (configured.length === 0) {
    return [{ level: 'warning', message: 'No agent worktrees configured; pass --claude-worktree and --codex-worktree to check them.' }];
  }
  if (roles.claude && roles.codex && normalizePath(roles.claude) === normalizePath(roles.codex)) {
    results.push({ level: 'error', message: 'Claude Code and Codex are configured to share one worktree. Give each its own.' });
  }
  for (const [agent, path] of configured) {
    const entry = worktrees.find((worktree) => normalizePath(worktree.path) === normalizePath(path));
    if (!entry) {
      results.push({ level: 'error', message: `${agent}: ${path} is not a worktree of this repository.` });
      continue;
    }
    if (entry.detached || !entry.branch) {
      results.push({ level: 'warning', message: `${agent}: ${path} has a detached HEAD.` });
    } else if (PROTECTED_BRANCHES.has(entry.branch)) {
      results.push({ level: 'error', message: `${agent}: ${path} has \`${entry.branch}\` checked out. Agents never work on the main branch.` });
    } else if (!branchBelongsTo(agent, entry.branch)) {
      results.push({ level: 'warning', message: `${agent}: ${path} is on \`${entry.branch}\`, which is not a ${agent} branch.` });
    } else {
      results.push({ level: 'ok', message: `${agent}: ${path} on \`${entry.branch}\`.` });
    }
  }
  return results;
}
