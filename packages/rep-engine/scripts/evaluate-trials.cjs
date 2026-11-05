#!/usr/bin/env node
/**
 * Offline replay and evaluation of labelled rep trials (RO-032).
 *
 *   npm run evaluate:trials -w @repone/rep-engine -- <trial.json | directory>... [options]
 *
 * Options:
 *   --synthetic                 also evaluate the built-in SYNTHETIC scenario suite (labelled as such)
 *   --write-synthetic <dir>     write the synthetic suite as rep-trial-v1 JSON files (format examples), then exit
 *   --split evaluation|tuning   evaluate only that split (default: both, reported separately)
 *   --detector current|legacy   legacy = the frozen rotational-rep-fsm-0.1.0 copy, for comparison only
 *   --timing-tolerance-ms <n>   on-time window for completion vs labelled end (default 500)
 *   --json                      print machine-readable results instead of the text report
 *
 * Exit code 1 when a trial file is invalid. Synthetic and sensor results are always reported in separate sections,
 * as are tuning and evaluation splits. Zero dependencies: TypeScript sources are transpiled on load with the
 * workspace's own `typescript` package.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Load the package's TypeScript sources directly (CommonJS transpile on require; no build step, no new dependency).
Module._extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const root = path.resolve(__dirname, '..');
const engine = require(path.join(root, 'src', 'index.ts'));

function parseArgs(argv) {
  const args = { inputs: [], synthetic: false, split: null, detector: 'current', timingToleranceMs: 500, json: false, writeSynthetic: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--synthetic') args.synthetic = true;
    else if (a === '--json') args.json = true;
    else if (a === '--split') args.split = argv[++i];
    else if (a === '--detector') args.detector = argv[++i];
    else if (a === '--timing-tolerance-ms') args.timingToleranceMs = Number(argv[++i]);
    else if (a === '--write-synthetic') args.writeSynthetic = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else args.inputs.push(a);
  }
  if (args.split && !['evaluation', 'tuning'].includes(args.split)) throw new Error('--split must be evaluation or tuning');
  if (!['current', 'legacy'].includes(args.detector)) throw new Error('--detector must be current or legacy');
  if (!(args.timingToleranceMs > 0)) throw new Error('--timing-tolerance-ms must be positive');
  return args;
}

function listTrialFiles(input) {
  const stat = fs.statSync(input);
  if (!stat.isDirectory()) return [input];
  return fs
    .readdirSync(input)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(input, f));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (args.inputs.length === 0 && !args.synthetic && !args.writeSynthetic)) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 17).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
    return 0;
  }

  if (args.writeSynthetic) {
    const { syntheticTrials } = require(path.join(root, 'test', 'scenarios', 'toTrial.ts'));
    fs.mkdirSync(args.writeSynthetic, { recursive: true });
    for (const trial of syntheticTrials()) {
      fs.writeFileSync(path.join(args.writeSynthetic, `${trial.trial_id}.json`), `${JSON.stringify(trial, null, 1)}\n`);
    }
    console.log(`Wrote ${syntheticTrials().length} SYNTHETIC trials to ${args.writeSynthetic}`);
    return 0;
  }

  const trials = [];
  let invalid = 0;
  for (const input of args.inputs) {
    for (const file of listTrialFiles(input)) {
      const trial = JSON.parse(fs.readFileSync(file, 'utf8'));
      const problems = engine.validateTrial(trial);
      if (problems.length > 0) {
        invalid += 1;
        console.error(`INVALID ${file}:\n  - ${problems.join('\n  - ')}`);
        continue;
      }
      trials.push(trial);
    }
  }
  if (args.synthetic) trials.push(...require(path.join(root, 'test', 'scenarios', 'toTrial.ts')).syntheticTrials());

  const selected = args.split ? trials.filter((t) => t.split === args.split) : trials;
  let createDetector;
  if (args.detector === 'legacy') {
    const { LegacyRotationalRepDetector } = require(path.join(root, 'test', 'reference', 'LegacyRotationalRepDetector.ts'));
    createDetector = (calibration) => new LegacyRotationalRepDetector('legacy-comparison', calibration);
  }
  const evaluations = selected.map((t) => engine.evaluateTrial(t, { timingToleranceMs: args.timingToleranceMs, createDetector }));
  const groups = engine.summarizeEvaluations(evaluations);
  if (args.json) console.log(JSON.stringify(groups, null, 2));
  else console.log(engine.formatEvaluationReport(groups, args.timingToleranceMs));
  return invalid > 0 ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
