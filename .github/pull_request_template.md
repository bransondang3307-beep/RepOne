## Task
<!-- Task ID(s) from TASKS.md, e.g. RO-012. One task per PR where possible. -->
- Task:
- Agent: Claude Code / Codex / Gemini / ChatGPT / Owner
- Handoff: `docs/handoffs/YYYY-MM-DD-<agent>-<TASK-ID>.md`

## What changed
-

## Tests and checks (exact results — only what you actually ran)
| Command | Result |
|---|---|
| `npm run verify` / `npm run typecheck && npm test` | |

## Contracts, architecture and safety
- [ ] No change to sensor units, data contracts or the rep-counting algorithm — or an ADR is linked:
- [ ] Module boundaries respected (`npm run check:boundaries` where available)
- [ ] No secrets, `.env` files, personal health data or identifying gym photos
- [ ] No AI API keys/tokens, paid AI services, AI actions or AI SDK dependencies (`npm run check:workflows`)
- [ ] Simulated / synthetic results are labelled as such

## Review
- [ ] Code PR: Codex review requested (or owner review) — automatic on open; comment `@codex review` after each
      fix push. Reviewed head SHA: `_______` · fix rounds used: _/2
- [ ] `TASKS.md`: only this task's row changed (→ `in-review` + PR link)
- [ ] `PROJECT_STATUS.md` **not** marked done here — updated after merge

## Next steps / owner questions
-
