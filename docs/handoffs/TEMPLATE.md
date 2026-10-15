<!--
Copy to docs/handoffs/YYYY-MM-DD-<agent>-<TASK-ID>.md (agent: claude | codex | gemini | chatgpt | owner).
Fill every section. Write "none" rather than deleting a section. Never report tests you did not run.
-->
# Handoff — <TASK-ID>: <short title>

| | |
|---|---|
| **Agent** | Claude Code / Codex / Gemini / ChatGPT / Owner |
| **Date** | YYYY-MM-DD |
| **Task** | <TASK-ID> (`TASKS.md`) |
| **Branch** | `<agent>/<TASK-ID>-<slug>` (base: `main` @ `<sha>`) |
| **Commits** | `<sha>` <subject> (one line each; final commit last) |
| **Pull request** | <URL or "not opened — reason"> |
| **Status** | implemented · verified · proposed · blocked |

## Objective
<What the task asked for, in one or two sentences.>

## What changed
- <Change and why. Group by module.>

## Files changed
- `<path>` — <added / modified / moved / deleted>

## Tests and checks (exact results)
| Command | Result |
|---|---|
| `npm run verify` (or `npm run typecheck && npm test`) | <e.g. typecheck exit 0; 46/46 tests passed> |
| <other checks> | <result> |

Environment notes: <node version, anything that could not be run and why>

## Decisions / ADRs
- <ADR link, or "none">

## Known limitations / risks
- <...>

## Next steps
1. <Recommended next task (existing ID or proposed new task)>

## Questions for the owner
- <... or "none">
