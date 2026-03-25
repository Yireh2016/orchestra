---
name: Orchestra — Agentic Coding Workflow Platform
description: Building a tool-agnostic agentic workflow platform (Orchestra) — NestJS + Next.js + PostgreSQL + K8s, with customizable workflow templates and plugin adapters
type: project
---

## Project: Orchestra

Platform that turns PM tickets into working PRs via AI coding agents.

### Completed Phases
- **Phase 1 (2026-03-25):** Monorepo scaffold — 110 files, all packages compile, Docker/K8s ready
- **Phase 2 (2026-03-25):** Core engine — WorkflowOrchestratorService (central brain), fault-tolerant phase handlers, live frontend wired to API, pause/resume, health endpoint

### Tech Stack
- **Backend:** NestJS (TypeScript), Prisma + PostgreSQL, BullMQ + Redis
- **Frontend:** Next.js 15, Tailwind CSS v4, dark theme
- **Infra:** Docker Compose (dev), K8s manifests (prod)
- **Monorepo:** Turborepo + pnpm workspaces

### Key Decisions
- Name: Orchestra
- Trigger: Label/tag v1, bot user future must-have
- Branching: `orchestra/<ticket-id>/<task-slug>`
- Approval UX: In the PR
- Auth: Google OAuth + SSO (SAML/OIDC)
- Workflow Templates: Customizable, clonable, publishable
- Dev ports: Postgres 5433, Redis 6379, Core 3001, Web 3000

### Next Phases
- Phase 3: First adapters (Jira, GitHub, Slack, Claude Code) — make them actually work with real APIs
- Phase 4: Phase handlers end-to-end with real adapter calls
- Phase 5: Agent runtime — K8s Jobs, parallel execution
- Phase 6: UI polish
- Phase 7: E2E testing, production readiness

### Source Files
- Product spec: `docs/product-spec.md`
- Tech stack: `docs/tech-stack.md`
- Original workflow ref: `/Users/jainermunoz/Documents/roadmunk/.claude/commands/ai-driven-development/`
