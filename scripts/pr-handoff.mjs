import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const sha = /^[a-f0-9]{40}$/;
const taskBranch = /^(?:claude|codex|gemini|chatgpt|owner)\/(RO-[0-9]{3,})-[a-z0-9][a-z0-9-]*$/;

export function handoffSummary(event) {
  const pr = event?.pull_request;
  if (
    !Number.isSafeInteger(pr?.number) || pr.number <= 0 ||
    !Number.isSafeInteger(event.repository?.id) || event.repository.id <= 0 ||
    pr.base?.repo?.id !== event.repository.id || pr.base?.ref !== 'main' ||
    typeof pr.base.sha !== 'string' || !sha.test(pr.base.sha) ||
    typeof pr.head?.sha !== 'string' || !sha.test(pr.head.sha) ||
    pr.state !== 'open' || typeof pr.draft !== 'boolean'
  ) {
    throw new Error('Expected valid metadata for an open PR targeting main.');
  }

  // Branch names are declarations. Only display the restricted task ID, never the branch text.
  const task = pr.head.repo?.id === event.repository.id && typeof pr.head.ref === 'string'
    ? taskBranch.exec(pr.head.ref)?.[1]
    : undefined;
  const state = pr.draft ? 'in-progress (draft)' : 'in-review (open)';

  return [
    '## PR handoff snapshot',
    '',
    `- PR: #${pr.number}`,
    `- Declared task: ${task ?? 'Unlinked'}`,
    `- PR phase: ${state}`,
    `- Head: \`${pr.head.sha}\``,
    `- Base at event: \`${pr.base.sha}\``,
    '',
    'Check the live PR for current CI, review evidence, fix rounds and merge status.',
    'The task board is updated through reviewed PRs.',
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, handoffSummary(event));
}
