---
name: Validation session bugs and fixes (2026-03-26)
description: Bugs found and fixed during the first full E2E validation session
type: project
---

## Bugs Fixed During Validation (2026-03-26)

1. **Dashboard crash** — getAgents() returned {count, agents} not array. Fixed unwrapping.
2. **NextAuth 500** — Missing AUTH_SECRET env var for NextAuth v5.
3. **Jira ADF parsing** — Comments in Atlassian Document Format returned empty strings. Built recursive extractTextFromAdf().
4. **Claude Code output wrapper** — `--output-format json` wraps in `{type:"result",result:"..."}`. Added unwrapping.
5. **Claude Code spawn vs execFile** — spawn() returned before process completed. Rewrote to execFile() which blocks until done.
6. **Claude binary PATH** — execFile couldn't find `claude`. Added path discovery checking ~/.local/bin/claude.
7. **stdin pipe issue** — Changed stdio from `['pipe','pipe','pipe']` to `['ignore','pipe','pipe']`.
8. **Interview duplicate questions** — In-memory lastSeen reset on restart. Persisted to DB in phaseData._polling.
9. **Old "approve" comments** — Interview approval triggered plan approval. Added specPostedAt/planPostedAt timestamp guards.
10. **Jira comment noise** — Removed Research Phase Started/Complete comments. Only post spec and plan.
11. **Phase completion dedup** — In-memory keys reset on restart. Persisted _completedPhases in DB.
12. **Planning handler missing Claude Code** — start() didn't spawn AI, just set awaiting_input. Rewrote to auto-generate plan.
13. **Wrong repo** — Execution used first repo in project, not the right one. AI now selects repo per task.
14. **checkDependenciesMet** — Looked up tasks by UUID instead of ticketId. Fixed to findFirst({ticketId}).
15. **Execution handler missing task creation on rerun** — Tasks only existed in phaseData, not DB. Added auto-creation from plan.
16. **CANCELLED state missing** — Frontend sent "cancelled" but state didn't exist. Added CANCELLED to state machine.
17. **Transition API mismatch** — Frontend sent {state} but backend expected {targetState}. Fixed api-client.

## Known Issues (not yet fixed)
1. **Review phase JSON parsing** — Reviewer agent returns plain text, handler expects JSON
2. **Auto-enqueue edge cases** — Downstream tasks sometimes need manual rerun to trigger
3. **No artifacts viewer in UI** — phaseData artifacts not displayed nicely
