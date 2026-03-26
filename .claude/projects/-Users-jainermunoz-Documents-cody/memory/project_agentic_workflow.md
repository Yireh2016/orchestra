---
name: Orchestra — Agentic Coding Workflow Platform
description: Tool-agnostic agentic workflow platform — end-to-end pipeline validated, creating real PRs from Jira tickets
type: project
---

## Project: Orchestra — VALIDATED E2E

Platform that turns PM tickets into working PRs via AI coding agents. Full pipeline validated on 2026-03-26 with real Jira ticket RMK-13661 → 2 PRs in tempo-io/roadmunk.

### Current State (end of 2026-03-26 session)

**What works end-to-end:**
- Interview → AI analyzes ticket, generates spec, posts to Jira, waits for approval
- Research → Claude Code analyzes codebase, auto-completes
- Planning → Claude Code generates task plan with DAG, selects correct repo per task from multi-repo project
- Execution → Clones repo, creates branch, Claude Code edits files with --dangerously-skip-permissions, commits, pushes, creates PRs. DAG-aware parallel execution.
- Review → Phase starts but reviewer JSON parsing needs fixing
- Rerun → Inspects artifacts, resumes from where it left off
- Polling → Heartbeat checks Jira comments and phase completion every 15s

**What needs fixing (next session):**
1. **Review phase**: Claude Code returns plain text but handler expects JSON. Fix the review prompt or parse flexibly.
2. **Auto-enqueue downstream tasks**: Works via rerun but should be automatic after each task passes (the enqueueUnblockedTasks is called but may have edge cases).
3. **Artifacts viewer in UI**: phaseData has all artifacts (spec, research, plan, task outputs) but the UI only shows raw JSON. Build proper artifact display panels.
4. **Jira comment cleanup**: Old comments from failed runs accumulate. Consider adding a "clean Orchestra comments" action.
5. **Task-5 (rmstack-deployments)**: Plan assigned this repo but no PR was created — likely no changes were made. Verify the deployment repo scanning works.

### Infrastructure
- PostgreSQL on port 5433 (Docker)
- Redis on port 6379 (Docker)
- Backend on port 3001
- Frontend on port 3000
- Polling enabled, 15s interval

### Key Environment Variables Needed
```
DATABASE_URL=postgresql://orchestra:orchestra_dev@localhost:5433/orchestra
REDIS_URL=redis://localhost:6379
PORT=3001
JWT_SECRET=dev-secret
GOOGLE_CLIENT_ID=placeholder
GOOGLE_CLIENT_SECRET=placeholder
POLLING_ENABLED=true
POLL_INTERVAL_MS=15000
AUTH_SECRET=dev-secret-change-in-prod
AUTH_TRUST_HOST=true
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Test Workflow
- Workflow ID: cff0fc32-3c33-443f-9739-c94cdd1207f1
- Ticket: RMK-13661 (SendGrid secret scanning remediation)
- Project: Strategic roadmaps (70d7b1f8-6618-4d40-8b8a-41060cc42455)
- Primary repo: tempo-io/roadmunk (branch: main)
- PRs created: #5369, #5370

### Source Files
- Product spec: `docs/product-spec.md`
- Tech stack: `docs/tech-stack.md`
- API reference: `docs/api-reference.md`
- Deployment guide: `docs/deployment-guide.md`
- Getting started: `docs/guides.md`
- README: `README.md`
