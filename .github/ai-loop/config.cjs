// RO-019 automated Claude Code ↔ Codex review loop — fixed policy constants.
// Changing these changes the safety envelope of the loop: do it in a reviewed PR
// (automated fixes are not allowed to touch .github/, see PROTECTED_PATHS).
'use strict';

module.exports = Object.freeze({
  /** Repository variable AI_LOOP_MODE: anything unrecognised is treated as 'off'. */
  MODES: Object.freeze(['off', 'manual', 'auto']),

  /** Hard cap on automatic Claude fix rounds per pull request (requirement: max two). */
  MAX_FIX_ROUNDS: 2,

  /** Cap on non-dry-run automatic Codex reviews per PR (cost guard against many pushes). */
  MAX_AUTO_REVIEWS_PER_PR: 6,

  /** Only branches with this prefix get automatic reviews and automated fixes. */
  DEFAULT_BRANCH_PREFIX: 'claude/',

  /** The only author whose comments are trusted as loop state. */
  BOT_LOGIN: 'github-actions[bot]',

  LABELS: Object.freeze({
    STOP: 'ai-loop:stop', // owner kill switch — loop does nothing on this PR
    APPROVED: 'ai-loop:approved', // Codex found no blocking issues on the current head (NOT merge approval)
    CHANGES: 'ai-loop:changes-requested',
    NEEDS_HUMAN: 'ai-loop:needs-human',
  }),

  MARKER_PREFIX: 'repone-ai-loop:v1',
  PAYLOAD_PREFIX: 'repone-ai-loop:payload',

  /** Workflow files dispatched by the loop (must exist on the default branch). */
  WORKFLOWS: Object.freeze({ REVIEW: 'ai-codex-review.yml', FIX: 'ai-claude-fix.yml', CI: 'ci.yml' }),

  /** Changes to these paths make a PR ineligible for *automatic* review (manual dispatch still works). */
  AUTOMATION_PATHS: Object.freeze(['.github/workflows/', '.github/ai-loop/']),

  /**
   * Automated Claude fixes may never modify these. Rules: 'dir/' = prefix match; 'file' = exact
   * path; '**\/name' = that file name at any depth; '**\/dir/' = that directory at any depth.
   * Agent instruction/config files are protected at every depth because nested copies are
   * loaded by agents in later sessions.
   */
  PROTECTED_PATHS: Object.freeze([
    '.github/',
    '**/.claude/',
    '**/.codex/',
    '**/.mcp.json',
    '**/.claude.json',
    '**/CLAUDE.md',
    '**/CLAUDE.local.md',
    '**/AGENTS.md',
    '**/AGENTS.override.md',
    '**/GEMINI.md',
    'REPONE_SOURCE_OF_TRUTH.md',
    'TASKS.md',
    'PROJECT_STATUS.md',
    'docs/decisions/',
    '.gitmodules',
    '.gitattributes',
    '.npmrc',
    '**/package-lock.json',
    // Rep-counting algorithm and data contracts (AGENTS.md §6): require a human + ADR.
    'packages/rep-engine/src/RotationalRepDetector.ts',
    'packages/core/src/processing/RotationalRepDetector.ts',
    'packages/sensor-contracts/src/common.ts',
    'packages/sensor-contracts/src/sensor.ts',
    'packages/sensor-contracts/src/derived.ts',
    'packages/core/src/common/types.ts',
    'packages/core/src/sensors/types.ts',
    'packages/core/src/processing/events.ts',
  ]),

  PATCH_LIMITS: Object.freeze({ MAX_FILES: 25, MAX_BYTES: 200_000 }),

  /** Text limits for model output rendered into PR comments. */
  TEXT_LIMITS: Object.freeze({ SUMMARY: 3000, TITLE: 200, DETAILS: 4000, FIX: 3000, FILE: 300, MAX_FINDINGS: 20 }),
  MAX_PAYLOAD_JSON_CHARS: 24_000,
  MAX_COMMENT_CHARS: 60_000,
});
