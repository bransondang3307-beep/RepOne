import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateConfig, initialState, enroll, decide, reserve, finish, completeCI, failedCI, digest } from './core.mjs';
import { append, readJournal, lock, removeDeadLock, bindRepository } from './store.mjs';
import { childEnvironment, launchArgs, validatePaths, pull, subscriptionCheck, providerArgs } from './adapters.mjs';
import { runApproved } from './orchestration.mjs';

const head = 'a'.repeat(40);
const config = () => ({ version:1, project:'sample',repo:'owner/repo',baseBranch:'main',executionEnabled:false,autoMerge:false,maxFixRounds:2,
  maintainers:['owner'],tasks:[{id:'TASK-1',pr:1,branch:'claude/TASK-1-work',allowImplementation:false,dependencies:[]}],workflows:[{path:'.github/workflows/ci.yml',jobs:['Linux','Windows','Handoff']}] });
function facts() { return { complete:true,dependenciesMet:true,worktreesValid:true,rounds:0,ciGreen:true,ciFailing:false,
  pr:{state:'open',draft:false,head:{sha:head,ref:'claude/TASK-1-work',repo:{full_name:'owner/repo'}},base:{ref:'main',repo:{full_name:'owner/repo'}}},
  review:{status:'reviewed',reviewedCommit:head,findings:[]} }; }
function setup() { const c=config(); return [c,initialState(c),c.tasks[0],facts()]; }
function ci() { const c=config(); return [head,c.workflows,[{id:10,run_attempt:1,head_sha:head,path:c.workflows[0].path,event:'pull_request',check_suite_id:4,status:'completed',conclusion:'success'}],
  c.workflows[0].jobs.map(name => ({name,head_sha:head,check_suite:{id:4},status:'completed',conclusion:'success'}))]; }

test('configuration is project agnostic and execution defaults are explicit',()=>{ assert.equal(validateConfig(config()).executionEnabled,false); });
test('enrollment retains budgets and cannot relabel an existing PR to reset it',()=>{
  const c=config(),s=initialState(c); s.tasks[0].rounds=2;
  c.tasks.push({...c.tasks[0],id:'TASK-2',pr:2}); const next=enroll(s,c); assert.equal(next.tasks[0].rounds,2); assert.equal(next.tasks.length,2);
  c.tasks=[{...c.tasks[0],id:'new-id'}]; assert.throws(()=>enroll(s,c),/IDENTITY/);
  c.tasks=[]; assert.equal(enroll(s,c).tasks[0].rounds,2);
});
test('invalid policy, identifiers, duplicates and missing workflows fail closed',()=>{
  for (const change of [c=>c.autoMerge=true,c=>c.maxFixRounds=3,c=>delete c.project,c=>c.tasks.push(c.tasks[0]),c=>c.tasks[0].id='x\n@codex',c=>c.workflows=[],c=>c.tasks[0].branch='main',c=>c.tasks[0].dependencies=[1]]) {
    const c=config(); change(c); assert.throws(()=>validateConfig(c));
  }
});
test('all gates lead only to an owner merge decision',()=>{ assert.equal(decide(...setup()),'owner-merge-decision'); });
test('unknown evidence, worktrees, dependencies, fork or wrong base blocks',()=>{
  for (const mutate of [f=>f.complete=false,f=>f.dependenciesMet=false,f=>f.worktreesValid=false,f=>f.pr.base.ref='other',f=>f.pr.head.repo.full_name='fork/repo',f=>f.pr.head.ref='claude/another',f=>f.pr.state='closed']) {
    const args=setup(); mutate(args[3]); assert.equal(decide(...args),'blocked');
  }
});
test('stale and pending reviews never authorize a merge',()=>{
  const args=setup(); args[3].review.reviewedCommit='b'.repeat(40); assert.equal(decide(...args),'review');
  args[3].review.status='pending'; assert.equal(decide(...args),'waiting');
});
test('P2 needs an answer and disputes go to the owner',()=>{
  const args=setup(); args[3].review.findings=[{priority:'P2',reply:null}]; assert.equal(decide(...args),'fix');
  args[3].review.findings[0].reply='not-changed'; assert.equal(decide(...args),'owner-merge-decision');
  args[3].review.findings[0].priority='P1'; assert.equal(decide(...args),'blocked');
});
test('two reserved rounds exhaust budget, including failed/interrupted sessions',()=>{
  const [c,initial,t,f]=setup(); f.review.findings=[{priority:'P1',reply:null}]; let state=initial;
  for (let n=1;n<=2;n++) { assert.equal(decide(c,state,t,f),'fix'); state=reserve(state,t,f,'fix','approval'); assert.equal(state.tasks[0].rounds,n); assert.equal(decide(c,state,t,f),'recovery-required'); state=finish(state,true); }
  assert.equal(decide(c,state,t,f),'blocked'); assert.throws(()=>reserve(state,t,f,'fix','approval'));
});
test('remote rounds are a floor and branch/head changes never reset them',()=>{
  const [c,state,t,f]=setup(); f.rounds=2; f.ciFailing=true; assert.equal(decide(c,state,t,f),'blocked');
  f.rounds=4; assert.equal(decide(c,state,t,f),'blocked');
});
test('implementation is explicit draft-only and can never replay',()=>{
  const c=config(); c.tasks[0].allowImplementation=true; let s=initialState(c); const f=facts(); f.pr.draft=true;
  assert.equal(decide(c,s,c.tasks[0],f),'implement'); s=reserve(s,c.tasks[0],f,'implement','approval'); s=finish(s,true);
  assert.equal(decide(c,s,c.tasks[0],f),'waiting');
});
test('review launch is bounded to once per head',()=>{
  const [c,s,t,f]=setup(); f.review.status='not-reviewed'; const done=finish(reserve(s,t,f,'review','approval'),true);
  assert.equal(decide(c,done,t,f),'waiting'); f.pr.head.sha='b'.repeat(40); assert.equal(decide(c,done,t,f),'review');
});
test('interruption recovery blocks work without refunding a round',()=>{
  const [c,s,t,f]=setup(); const recovered=finish(reserve(s,t,f,'fix','approval'),false);
  assert.equal(recovered.tasks[0].rounds,1); assert.equal(decide(c,recovered,t,f),'blocked');
});
test('CI requires full same-head workflow and every job in its own suite',()=>{
  assert.equal(completeCI(...ci()),true);
  for (const mutate of [a=>a[2]=[],a=>a[3].pop(),a=>a[2][0].conclusion='failure',a=>a[2][0].head_sha='b'.repeat(40),a=>a[2][0].event='push',a=>a[3][0].check_suite.id=99,a=>a[3][0].head_sha='b'.repeat(40),a=>a[3][0].conclusion='skipped',a=>a[3][0].status='queued',a=>a[3].push({...a[3][0]})]) {
    const args=ci(); mutate(args); assert.equal(completeCI(...args),false);
  }
});
test('latest workflow attempt wins and an older failure does not demand a fix',()=>{
  const args=ci(); args[2].push({...args[2][0],id:9,conclusion:'failure'}); assert.equal(failedCI(...args),false);
  args[2].push({...args[2][0],run_attempt:2,status:'in_progress',conclusion:null}); assert.equal(completeCI(...args),false);
});
test('additional required workflows cannot be missing',()=>{const args=ci(); args[1].push({path:'.github/workflows/tracking.yml',jobs:['Snapshot']}); assert.equal(completeCI(...args),false);});
test('child environment strips provider, GitHub, Git config and Node injection variables',()=>{
  assert.deepEqual(childEnvironment({PATH:'tools',SystemRoot:'windows',OPENAI_API_KEY:'secret',ANTHROPIC_API_KEY:'secret',DEV_HOST_GITHUB_TOKEN:'secret',NODE_OPTIONS:'inject',GIT_CONFIG_COUNT:'1',CODEX_HOME:'other'}),{PATH:'tools',SystemRoot:'windows'});
});
test('launches use fixed interactive permission flags and no untrusted PR text',()=>{
  const t=config().tasks[0]; const a=launchArgs('fix',t,head); assert.deepEqual(a.slice(0,2),['--permission-mode','default']);
  assert.deepEqual(launchArgs('review',t,head).slice(0,4),['--sandbox','read-only','--ask-for-approval','on-request']);
  assert.ok(!a.includes('-p')); assert.ok(!a.includes('--dangerously-skip-permissions'));
});
test('binary digest hashes bytes',()=>{assert.equal(digest(Buffer.from('abc')),digest('abc'));});
test('journal persists reservations and rejects tampering/truncation',()=>{
  const dir=mkdtempSync(join(tmpdir(),'controller-journal-'));
  try { const [c,s,t,f]=setup(); let j=append(dir,readJournal(dir),'init',s); const reserved=reserve(s,t,f,'fix','hash');
    j=append(dir,j,'reserved',reserved); assert.deepEqual(readJournal(dir).state,reserved);
    assert.throws(()=>append(dir,{seq:0,hash:'bad'},'finished',s));
    const path=join(dir,'journal.jsonl'),raw=readFileSync(path,'utf8'); writeFileSync(path,raw.slice(0,-1)); assert.throws(()=>readJournal(dir),/TRUNCATED/);
    writeFileSync(path,raw.replace('"rounds":1','"rounds":0')); assert.throws(()=>readJournal(dir),/CORRUPT/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('exclusive project lock prevents a second controller',()=>{const dir=mkdtempSync(join(tmpdir(),'controller-lock-')); try {const release=lock(dir); assert.throws(()=>lock(dir)); release(); lock(dir)();} finally {rmSync(dir,{recursive:true,force:true});}});
test('overlapping stale-lock recovery cannot delete a replacement controller lock',t=>{
  const dir=mkdtempSync(join(tmpdir(),'controller-recovery-')), path=join(dir,'controller.lock');
  const stalePid=123456789;
  let overlapping=false, secondBlocked=false, normalBlocked=false;
  writeFileSync(path,String(stalePid));
  t.mock.method(process,'kill',(pid,signal)=>{
    assert.equal(pid,stalePid); assert.equal(signal,0);
    if (!overlapping) {
      overlapping=true;
      // Pause A after reading the dead PID. B recovers and a normal controller
      // takes the replacement lock before A resumes its stale-owner check.
      try { removeDeadLock(dir); } catch (error) { assert.equal(error.code,'EEXIST'); secondBlocked=true; }
      try { lock(dir); } catch (error) { assert.equal(error.code,'EEXIST'); normalBlocked=true; }
    }
    throw Object.assign(new Error('dead fixture owner'),{code:'ESRCH'});
  });
  try {
    const release=removeDeadLock(dir);
    assert.equal(secondBlocked,true,'overlapping recovery must be excluded');
    assert.equal(normalBlocked,true,'normal acquisition must use the same guard');
    assert.equal(readFileSync(path,'utf8'),String(process.pid));
    assert.throws(()=>lock(dir),{code:'EEXIST'});
    release(); lock(dir)();
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('crashed recovery leaves a guard that blocks normal and recovery acquisition',()=>{
  const dir=mkdtempSync(join(tmpdir(),'controller-crashed-recovery-')), path=join(dir,'controller.lock');
  try {
    writeFileSync(path,'123456789');
    const child=spawnSync(process.execPath,['--input-type=module','-e',`
      import { removeDeadLock } from ${JSON.stringify(new URL('./store.mjs',import.meta.url).href)};
      process.kill=()=>process.exit(23);
      removeDeadLock(process.argv[1]);
    `,dir],{encoding:'utf8',timeout:10000});
    assert.equal(child.status,23,child.stderr);
    for (const acquire of [lock,removeDeadLock]) assert.throws(()=>acquire(dir),{code:'EEXIST'});
    assert.equal(readFileSync(path,'utf8'),'123456789');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('recovery refuses live, unknown and corrupt lock owners and releases its guard',t=>{
  const dir=mkdtempSync(join(tmpdir(),'controller-owner-check-')), path=join(dir,'controller.lock');
  try {
    for (const code of [null,'EPERM']) {
      writeFileSync(path,String(process.pid));
      t.mock.method(process,'kill',()=>{if (code) throw Object.assign(new Error('unknown'),{code});});
      assert.throws(()=>removeDeadLock(dir),/LOCK_OWNER_LIVE_OR_UNKNOWN/);
      assert.equal(readFileSync(path,'utf8'),String(process.pid));
      t.mock.restoreAll();
    }
    writeFileSync(path,'invalid');
    assert.throws(()=>removeDeadLock(dir),/LOCK_CORRUPT/);
    rmSync(path);
    removeDeadLock(dir)(); lock(dir)();
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('control files cannot reside in an agent worktree or aliased root',()=>{
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'controller-path-')));
  try { for (const x of ['owner','claude','codex','state']) mkdirSync(join(dir,x)); const cfg=join(dir,'config.json'); writeFileSync(cfg,'{}');
    const c={worktrees:Object.fromEntries(['owner','claude','codex'].map(x=>[x,join(dir,x)])),stateDirectory:join(dir,'state')}; validatePaths(c,cfg);
    c.worktrees.codex=c.worktrees.claude; assert.throws(()=>validatePaths(c,cfg),/SEPARATE/);
    c.worktrees.codex=join(dir,'codex'); c.stateDirectory=c.worktrees.claude; assert.throws(()=>validatePaths(c,cfg),/PRIVATE/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('pull reader uses GET with redirects forbidden and rejects mismatched data',async()=>{
  const c=config(); let request;
  await pull(c,1,async(url,options)=>{request={url,options}; return {ok:true,json:async()=>({...facts().pr,number:1})};});
  assert.equal(request.options.method,'GET'); assert.equal(request.options.redirect,'error'); assert.equal(request.url,'https://api.github.com/repos/owner/repo/pulls/1');
  await assert.rejects(()=>pull(c,1,async()=>({ok:true,json:async()=>({...facts().pr,number:2})})),/PR_DATA/);
});

test('repository binding refuses another state directory and repeat initialization',()=>{
  const dir=mkdtempSync(join(tmpdir(),'controller-binding-')); const c={project:'p',repo:'o/r',stateDirectory:'/private/state'};
  try {bindRepository(dir,c,true); bindRepository(dir,c); assert.throws(()=>bindRepository(dir,c,true)); assert.throws(()=>bindRepository(dir,{...c,stateDirectory:'/new'}));}
  finally {rmSync(dir,{recursive:true,force:true});}
});
test('auth probe uses the exact target cwd and provider restrictions; key logins fail',()=>{
  for (const role of ['claude','codex']) {
    subscriptionCheck('/binary',role,'/target',(path,args,options)=>{
      assert.equal(options.cwd,'/target'); assert.deepEqual(args.slice(0,providerArgs(role).length),providerArgs(role));
      return {status:0,stdout:role==='claude'?'{"authMethod":"claude.ai"}':'',stderr:role==='codex'?'Logged in using ChatGPT':''};
    });
    assert.throws(()=>subscriptionCheck('/binary',role,'/target',()=>({status:0,stdout:'{"authMethod":"api_key"}',stderr:''})));
  }
});
function orchestration() {
  const [c,state,task,f]=setup(); c.executionEnabled=true; c.worktrees={claude:'/claude',codex:'/codex'};
  f.review.findings=[{priority:'P1',reply:null}]; const events=[];
  const input={c,raw:'config',configPath:'/config',task,journal:{seq:1,state},facts:f,action:'fix'};
  const io={executable:()=>'/binary',subscriptionCheck:()=>events.push('auth'),confirm:async()=>events.push('approved'),readConfig:()=>input.raw,
    collect:async()=>f,append:(dir,journal,event,state)=>{events.push(event); return {seq:journal.seq+1,state};},
    launch:()=>{events.push('launch'); return {status:0};}};
  return {input,io,events};
}
test('orchestration reserves durably before launch and consumes only one round',async()=>{
  const {input,io,events}=orchestration(); const result=await runApproved(input,io);
  assert.deepEqual(events,['auth','approved','auth','reserved','launch','finished']); assert.equal(result.state.tasks[0].rounds,1);
});
test('disabled execution, refused approval, failed auth, changed config and stale head cannot reserve or launch',async()=>{
  for (const change of [
    x=>x.input.c.executionEnabled=false,
    x=>x.io.confirm=async()=>{throw Error('refused');},
    x=>x.io.subscriptionCheck=()=>{throw Error('auth');},
    x=>x.io.readConfig=()=> 'changed',
    x=>x.io.collect=async()=>({...x.input.facts,pr:{...x.input.facts.pr,head:{...x.input.facts.pr.head,sha:'b'.repeat(40)}}}),
    x=>x.io.collect=async()=>({...x.input.facts,rounds:2}),
  ]) {const x=orchestration(); change(x); await assert.rejects(()=>runApproved(x.input,x.io)); assert.ok(!x.events.includes('reserved')); assert.ok(!x.events.includes('launch'));}
});
test('failed journal write prevents launch; timeout leaves a durable active reservation',async()=>{
  let x=orchestration(); x.io.append=()=>{throw Error('disk');}; await assert.rejects(()=>runApproved(x.input,x.io)); assert.ok(!x.events.includes('launch'));
  x=orchestration(); let saved; const save=x.io.append; x.io.append=(...args)=>{saved=save(...args); return saved;}; x.io.launch=()=>({error:Error('timeout'),status:null});
  await assert.rejects(()=>runApproved(x.input,x.io)); assert.equal(saved.state.active.action,'fix'); assert.equal(saved.state.tasks[0].rounds,1); assert.ok(!x.events.includes('finished'));
});
