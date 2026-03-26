---
name: Workflow resilience and rerun capability
description: Workflows must be resumable from broken state — check existing artifacts before re-running phases
type: feedback
---

Workflows should be able to resume from where they left off. When rerunning:
- Check existing artifacts in phaseData before running any phase
- spec exists → interview is done, skip to research
- research artifacts exist → skip to planning
- plan with tasks exists → skip to execution
- PRs created → skip to review

**Why:** During validation, workflows broke due to bugs and manual resets. The user expects workflows to be self-healing and resumable, not requiring a full restart.
**How to apply:** Add a "Rerun" button alongside Cancel. The rerun logic should inspect phaseData artifacts and resume from the last completed phase. Also improve error logging for agent failures.
