import { digest, requireThat, decide, reserve, finish } from './core.mjs';

// All side effects are explicit ports so refusal, races, crashes and ordering can be tested without AI.
export async function runApproved({c,raw,configPath,task,journal,facts,action}, io) {
  requireThat(c.executionEnabled && ['implement','fix','review'].includes(action), 'EXECUTION_DISABLED_OR_BLOCKED');
  const role = action === 'review' ? 'codex' : 'claude';
  const path = io.executable(c,role);
  io.subscriptionCheck(path,role,c.worktrees[role]);
  const approval = digest({config:raw,task,head:facts.pr.head.sha,base:facts.pr.base.sha,action,seq:journal.seq,path});
  await io.confirm(`Approve ONE foreground ${role} ${action} at ${facts.pr.head.sha}. Confirm the task assignment/dependencies and accepted scope, trusted managed CLI settings/hooks, subscription login, and paid credits/extra usage OFF. No merge is authorized.`, approval);
  requireThat(io.readConfig(configPath) === raw, 'CONFIG_CHANGED');
  const fresh = await io.collect(c,task);
  requireThat(fresh.pr.head.sha === facts.pr.head.sha && fresh.pr.base.sha === facts.pr.base.sha && decide(c,journal.state,task,fresh) === action && fresh.rounds === facts.rounds, 'APPROVAL_STALE');
  requireThat(io.executable(c,role) === path, 'EXECUTABLE_CHANGED');
  io.subscriptionCheck(path,role,c.worktrees[role]);
  const reserved = io.append(c.stateDirectory,journal,'reserved',reserve(journal.state,task,fresh,action,approval));
  const result = io.launch(path,c,role,action,task,fresh.pr.head.sha);
  requireThat(!result.error && result.status === 0 && !result.signal, 'AGENT_INTERRUPTED_RECOVER_REQUIRED');
  return io.append(c.stateDirectory,reserved,'finished',finish(reserved.state,true));
}
