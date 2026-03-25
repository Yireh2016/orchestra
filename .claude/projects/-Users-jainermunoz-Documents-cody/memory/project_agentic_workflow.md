---
name: Orchestra — Agentic Coding Workflow Platform
description: Building a tool-agnostic agentic workflow platform (Orchestra) — NestJS + Next.js + PostgreSQL + K8s, with customizable workflow templates and plugin adapters
type: project
---

## Project: Orchestra

Platform that turns PM tickets into working PRs via AI coding agents.

### Tech Stack (approved 2026-03-25)
- **Backend:** NestJS (TypeScript)
- **Frontend:** Next.js (React, TypeScript), shadcn/ui + Tailwind
- **Database:** PostgreSQL + Prisma ORM
- **Queue:** BullMQ (Redis)
- **Auth:** Google OAuth + SSO (SAML/OIDC)
- **Containers:** Docker Compose (dev) + Kubernetes (prod)
- **Monorepo:** Turborepo
- **Testing:** Vitest + Supertest + Playwright

### Key Decisions (2026-03-25)
- Name: Orchestra
- Trigger: Label/tag v1, bot user future must-have
- Branching: One branch per task (`orchestra/<ticket-id>/<task-slug>`)
- Approval UX: In the PR (developers)
- Workflow Templates: Customizable, clonable, publishable
- Rollback: No — post-merge issues are bug/hotfix tickets
- Cost controls: Future must-have

### Source Files
- Product spec: `docs/product-spec.md`
- Tech stack: `docs/tech-stack.md`
- Original workflow ref: `/Users/jainermunoz/Documents/roadmunk/.claude/commands/ai-driven-development/`

**Why:** User has proven manual workflow, wants to productize.
**How to apply:** All proposals go through PO review. Spec + tech-stack docs are source of truth.
