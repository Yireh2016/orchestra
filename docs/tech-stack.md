# Orchestra — Tech Stack

**Status**: PO-approved
**Last updated**: 2026-03-25

---

## Stack Overview

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Backend** | NestJS (TypeScript) | Modular architecture aligns with plugin system, built-in DI, decorators for webhooks/guards, strong typing for adapter interfaces |
| **Database** | PostgreSQL | Production-ready from day 1, JSON columns for flexible workflow state, good for DAG queries |
| **ORM** | Prisma | Type-safe queries, migrations, works great with NestJS |
| **Frontend** | Next.js (React, TypeScript) | SSR for dashboard, API routes as BFF proxy, same language as backend |
| **UI Components** | shadcn/ui + Tailwind CSS | Composable, customizable, no vendor lock-in |
| **Auth** | NextAuth.js (frontend) + Passport.js (backend) | Google OAuth + SSO (SAML/OIDC) support out of the box |
| **Message Queue** | BullMQ (Redis) | DAG-aware task scheduling, job retries, event-driven phase transitions |
| **Container Runtime** | Docker + Kubernetes | Docker Compose for dev, K8s for prod. Agent containers managed via K8s Jobs |
| **Monorepo** | Turborepo | Shared types between backend/frontend, coordinated builds |
| **Testing** | Vitest (unit) + Supertest (API) + Playwright (E2E) | Fast, TypeScript-native |
| **API Style** | REST + WebSocket | REST for CRUD, WebSocket for real-time dashboard updates and agent streaming |

---

## Project Structure (Monorepo)

```
orchestra/
├── apps/
│   ├── core/                          # NestJS backend (orchestrator)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   │
│   │   │   ├── workflow/              # Workflow engine
│   │   │   │   ├── workflow.module.ts
│   │   │   │   ├── workflow.service.ts        # State machine logic
│   │   │   │   ├── workflow.controller.ts     # REST API
│   │   │   │   ├── template.service.ts        # Template CRUD, clone, versioning
│   │   │   │   ├── template.controller.ts
│   │   │   │   └── entities/
│   │   │   │       ├── workflow.entity.ts
│   │   │   │       ├── workflow-run.entity.ts
│   │   │   │       └── workflow-template.entity.ts
│   │   │   │
│   │   │   ├── phases/                # Phase handlers
│   │   │   │   ├── phases.module.ts
│   │   │   │   ├── phase-handler.interface.ts  # Contract all phases implement
│   │   │   │   ├── interview/
│   │   │   │   │   ├── interview.handler.ts
│   │   │   │   │   └── conflict-detector.service.ts
│   │   │   │   ├── research/
│   │   │   │   │   └── research.handler.ts
│   │   │   │   ├── planning/
│   │   │   │   │   ├── planning.handler.ts
│   │   │   │   │   └── dag-builder.service.ts
│   │   │   │   ├── execution/
│   │   │   │   │   ├── execution.handler.ts
│   │   │   │   │   └── gate-runner.service.ts
│   │   │   │   └── review/
│   │   │   │       └── review.handler.ts
│   │   │   │
│   │   │   ├── gateway/               # Webhook receivers + event routing
│   │   │   │   ├── gateway.module.ts
│   │   │   │   ├── webhook.controller.ts      # Receives all inbound webhooks
│   │   │   │   ├── event-router.service.ts    # Routes events to correct workflow
│   │   │   │   └── webhook-auth.guard.ts      # Validates webhook signatures
│   │   │   │
│   │   │   ├── adapters/              # Plugin adapter system
│   │   │   │   ├── adapters.module.ts
│   │   │   │   ├── interfaces/
│   │   │   │   │   ├── pm-adapter.interface.ts
│   │   │   │   │   ├── code-host-adapter.interface.ts
│   │   │   │   │   ├── channel-adapter.interface.ts
│   │   │   │   │   └── coding-agent-adapter.interface.ts
│   │   │   │   ├── pm/
│   │   │   │   │   ├── jira/
│   │   │   │   │   │   ├── jira.adapter.ts
│   │   │   │   │   │   └── jira.config.ts
│   │   │   │   │   └── linear/          # Future
│   │   │   │   ├── code-host/
│   │   │   │   │   ├── github/
│   │   │   │   │   │   ├── github.adapter.ts
│   │   │   │   │   │   └── github.config.ts
│   │   │   │   │   └── gitlab/           # Future
│   │   │   │   ├── channel/
│   │   │   │   │   ├── slack/
│   │   │   │   │   │   ├── slack.adapter.ts
│   │   │   │   │   │   └── slack.config.ts
│   │   │   │   │   └── jira-comments/
│   │   │   │   │       └── jira-comments.adapter.ts
│   │   │   │   └── coding-agent/
│   │   │   │       ├── claude-code/
│   │   │   │       │   ├── claude-code.adapter.ts
│   │   │   │       │   └── claude-code.config.ts
│   │   │   │       └── aider/            # Future
│   │   │   │
│   │   │   ├── agent-runtime/         # Container management for coding agents
│   │   │   │   ├── agent-runtime.module.ts
│   │   │   │   ├── agent-pool.service.ts      # Manages agent lifecycle
│   │   │   │   ├── task-queue.service.ts      # DAG-aware BullMQ scheduling
│   │   │   │   └── container.service.ts       # K8s Job creation/monitoring
│   │   │   │
│   │   │   ├── plugins/               # Plugin system
│   │   │   │   ├── plugins.module.ts
│   │   │   │   ├── plugin-registry.service.ts
│   │   │   │   ├── plugin-loader.service.ts
│   │   │   │   └── plugin.interface.ts
│   │   │   │
│   │   │   ├── auth/                  # Auth module
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── strategies/
│   │   │   │   │   ├── google.strategy.ts
│   │   │   │   │   └── sso.strategy.ts
│   │   │   │   └── guards/
│   │   │   │       └── jwt-auth.guard.ts
│   │   │   │
│   │   │   └── common/                # Shared utilities
│   │   │       ├── config/
│   │   │       ├── database/
│   │   │       └── logger/
│   │   │
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── web/                           # Next.js frontend
│       ├── src/
│       │   ├── app/                   # App router
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx                   # Dashboard
│       │   │   ├── auth/
│       │   │   │   └── [...nextauth]/
│       │   │   ├── workflows/
│       │   │   │   ├── page.tsx               # Active workflows list
│       │   │   │   ├── [id]/
│       │   │   │   │   └── page.tsx           # Workflow detail + live status
│       │   │   │   └── templates/
│       │   │   │       ├── page.tsx            # Template browser
│       │   │   │       └── [id]/
│       │   │   │           └── editor/
│       │   │   │               └── page.tsx   # Template editor
│       │   │   ├── integrations/
│       │   │   │   └── page.tsx               # Integration setup
│       │   │   ├── agents/
│       │   │   │   └── page.tsx               # Agent management
│       │   │   ├── plugins/
│       │   │   │   └── page.tsx               # Plugin marketplace
│       │   │   └── audit/
│       │   │       └── page.tsx               # Audit log
│       │   │
│       │   ├── components/
│       │   │   ├── ui/                        # shadcn/ui components
│       │   │   ├── workflow/                  # Workflow-specific components
│       │   │   │   ├── dag-visualizer.tsx      # Task dependency graph
│       │   │   │   ├── phase-timeline.tsx      # Phase progress
│       │   │   │   └── gate-status.tsx         # Gate pass/fail display
│       │   │   └── layout/
│       │   │       ├── sidebar.tsx
│       │   │       └── header.tsx
│       │   │
│       │   ├── lib/
│       │   │   ├── api-client.ts              # Typed API client
│       │   │   └── ws-client.ts               # WebSocket client
│       │   │
│       │   └── hooks/
│       │       ├── use-workflow.ts
│       │       └── use-realtime.ts
│       │
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   └── shared/                        # Shared types between backend + frontend
│       ├── src/
│       │   ├── types/
│       │   │   ├── workflow.types.ts
│       │   │   ├── adapter.types.ts
│       │   │   ├── template.types.ts
│       │   │   └── events.types.ts
│       │   └── index.ts
│       └── package.json
│
├── containers/
│   └── agent/                         # Coding agent container image
│       ├── Dockerfile                 # Node.js + Git + Claude Code CLI
│       ├── entrypoint.sh              # Clone repo, run task, report results
│       └── package.json
│
├── k8s/                               # Kubernetes manifests
│   ├── base/
│   │   ├── namespace.yaml
│   │   ├── core-deployment.yaml
│   │   ├── web-deployment.yaml
│   │   ├── postgres-statefulset.yaml
│   │   ├── redis-deployment.yaml
│   │   └── agent-job-template.yaml    # Template for ephemeral agent jobs
│   ├── overlays/
│   │   ├── dev/
│   │   └── prod/
│   └── kustomization.yaml
│
├── docker-compose.yml                 # Local dev environment
├── turbo.json
├── package.json
├── tsconfig.base.json
└── docs/
    ├── product-spec.md
    └── tech-stack.md
```

---

## Key Architecture Patterns

### 1. Plugin/Adapter Registration

NestJS's DI system makes adapter swapping clean:

```typescript
// Adapter interface
export interface PMAdapter {
  getTicket(id: string): Promise<Ticket>;
  createTicket(parentId: string, data: CreateTicketDto): Promise<Ticket>;
  watchForLabelChanges(label: string, callback: LabelChangeHandler): Promise<Subscription>;
  // ... etc
}

// NestJS injection token
export const PM_ADAPTER = Symbol('PM_ADAPTER');

// Registration via config
@Module({
  providers: [
    {
      provide: PM_ADAPTER,
      useClass: JiraAdapter, // swapped via config/plugin
    },
  ],
  exports: [PM_ADAPTER],
})
export class AdaptersModule {}
```

### 2. Workflow State Machine

```typescript
// State transitions driven by events
enum WorkflowState {
  TRIGGERED = 'triggered',
  INTERVIEWING = 'interviewing',
  RESEARCHING = 'researching',
  PLANNING = 'planning',
  EXECUTING = 'executing',
  REVIEWING = 'reviewing',
  DONE = 'done',
  PAUSED = 'paused',
  FAILED = 'failed',
}

// Template determines which states are active
interface WorkflowRun {
  id: string;
  templateId: string;
  templateVersion: number;
  ticketId: string;
  state: WorkflowState;
  phaseData: Record<string, PhaseState>;  // per-phase state + artifacts
  taskGraph: TaskDAG;                      // built during planning
  createdAt: Date;
  updatedAt: Date;
}
```

### 3. DAG-Aware Task Queue

```typescript
// BullMQ + custom DAG scheduler
// When a task completes, check which downstream tasks are unblocked
interface TaskNode {
  id: string;
  ticketId: string;
  branch: string;            // orchestra/<ticket>/<slug>
  dependsOn: string[];       // task IDs that must complete first
  status: 'pending' | 'queued' | 'running' | 'passed' | 'failed';
  agentInstanceId?: string;  // assigned coding agent container
  gateResults: GateResult[];
}
```

### 4. Agent Container Lifecycle

```
Orchestrator                          K8s
    │                                  │
    ├── Create Job (task def) ────────►│
    │                                  ├── Pull agent image
    │                                  ├── Clone repo + checkout branch
    │                                  ├── Run coding agent (Claude Code -p)
    │                                  ├── Run gates
    │                                  ├── Push branch
    │                                  │
    │◄── Report result (webhook) ──────┤
    │                                  ├── Container terminates
    │                                  │
    ├── Evaluate DAG ──────────────────┤
    ├── Queue next tasks ─────────────►│
```

---

## Database Schema (High-Level)

```
┌──────────────────────┐     ┌───────────────────────┐
│ workflow_templates    │     │ workflow_runs          │
├──────────────────────┤     ├───────────────────────┤
│ id                   │◄────│ template_id            │
│ name                 │     │ id                     │
│ description          │     │ ticket_id              │
│ phases (jsonb)       │     │ state                  │
│ trigger_config       │     │ phase_data (jsonb)     │
│ version              │     │ created_at             │
│ team_id              │     │ updated_at             │
│ parent_template_id   │     └───────────┬───────────┘
│ is_published         │                 │
└──────────────────────┘                 │
                                         │ 1:N
┌──────────────────────┐     ┌───────────▼───────────┐
│ integrations         │     │ tasks                  │
├──────────────────────┤     ├───────────────────────┤
│ id                   │     │ id                     │
│ type (enum)          │     │ workflow_run_id         │
│ adapter_name         │     │ ticket_id              │
│ config (jsonb, enc)  │     │ branch                 │
│ team_id              │     │ depends_on (text[])    │
│ created_at           │     │ status                 │
└──────────────────────┘     │ gate_results (jsonb)   │
                             │ pr_url                 │
┌──────────────────────┐     │ agent_instance_id      │
│ users                │     └───────────────────────┘
├──────────────────────┤
│ id                   │     ┌───────────────────────┐
│ email                │     │ audit_log              │
│ name                 │     ├───────────────────────┤
│ auth_provider        │     │ id                     │
│ team_id              │     │ workflow_run_id         │
│ role                 │     │ action                 │
└──────────────────────┘     │ actor (user/agent)     │
                             │ details (jsonb)        │
┌──────────────────────┐     │ timestamp              │
│ teams                │     └───────────────────────┘
├──────────────────────┤
│ id                   │     ┌───────────────────────┐
│ name                 │     │ plugins                │
│ settings (jsonb)     │     ├───────────────────────┤
└──────────────────────┘     │ id                     │
                             │ name                   │
                             │ type                   │
                             │ version                │
                             │ config (jsonb)         │
                             │ enabled                │
                             └───────────────────────┘
```

---

## Docker Compose (Dev)

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: orchestra
      POSTGRES_USER: orchestra
      POSTGRES_PASSWORD: orchestra_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  core:
    build: ./apps/core
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgresql://orchestra:orchestra_dev@postgres:5432/orchestra
      REDIS_URL: redis://redis:6379
      NODE_ENV: development
    depends_on:
      - postgres
      - redis
    volumes:
      - ./apps/core/src:/app/src  # hot reload

  web:
    build: ./apps/web
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
      NEXTAUTH_URL: http://localhost:3000
    depends_on:
      - core
    volumes:
      - ./apps/web/src:/app/src  # hot reload

volumes:
  pgdata:
```

---

## Implementation Order (Proposed)

### Phase 1: Foundation
1. Monorepo scaffolding (Turborepo + packages)
2. NestJS core with database + Prisma schema
3. Next.js web shell with auth (Google + SSO)
4. Docker Compose for local dev
5. Shared types package

### Phase 2: Core Engine
1. Workflow state machine
2. Template engine (CRUD, clone, versioning)
3. Gateway — webhook receiver framework
4. Plugin registry + adapter interfaces

### Phase 3: First Adapters
1. Jira adapter (PM)
2. GitHub adapter (Code Host)
3. Slack adapter (Channel)
4. Claude Code adapter (Coding Agent)

### Phase 4: Phase Handlers
1. Interview handler + conflict detection
2. Research handler
3. Planning handler + DAG builder
4. Execution handler + gate runner
5. Review handler

### Phase 5: Agent Runtime
1. Agent container image
2. K8s Job management
3. DAG-aware task queue (BullMQ)
4. Agent pool manager

### Phase 6: UI
1. Dashboard (workflow list + real-time status)
2. Integration setup screens
3. Workflow template editor
4. Agent management
5. Audit log

### Phase 7: Polish
1. E2E testing
2. K8s production manifests
3. Plugin marketplace UI
4. Documentation
