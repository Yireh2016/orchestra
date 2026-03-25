# Orchestra -- Agentic Coding Workflow Platform

Orchestra turns project management tickets into working, reviewed pull requests -- autonomously.

## Overview

Orchestra is a platform that orchestrates AI coding agents through configurable workflows while keeping humans in control at critical decision points. When a ticket is labeled in your project management tool (Jira, Linear, etc.), Orchestra takes over: it interviews stakeholders to build a spec, researches the codebase, plans the implementation as a dependency-aware task graph, executes each task in parallel via isolated coding agent containers, and runs an automated review loop before handing the PR to a human reviewer.

The platform is **tool-agnostic**. Every external system -- project management, code hosting, messaging, and coding agents -- connects through a typed adapter interface. The default setup ships with Jira, GitHub, Slack, and Claude Code adapters, but teams can swap or extend any integration via the plugin system.

Workflows are fully configurable through a template system. Teams can clone the built-in "Full Development Cycle" template and customize phases, gates, skip conditions, and timeouts. A bug-fix workflow might skip the interview phase; a hotfix workflow might jump straight to execution. Templates are versioned and can be published for other teams to discover.

## Architecture

```
+-------------------------------------------------------------------+
|                       ORCHESTRA PLATFORM                          |
|                                                                   |
|  +-------------------------------------------------------------+ |
|  |                     GATEWAY LAYER                            | |
|  |  Webhook receivers + Adapter clients                         | |
|  |  [PM Tool]  [Code Host]  [Channel]  [Generic Webhook]       | |
|  +---------|---------|----------|-------------|------------------+ |
|            +-------- +----+-----+-------------+                   |
|                           |                                       |
|  +------------------------v------------------------------------+  |
|  |                 ORCHESTRATOR (Core)                          |  |
|  |  [Workflow Engine] [State Manager] [Plugin Registry]        |  |
|  |  [Workflow Template Engine]                                  |  |
|  |  [Phase Handlers: Interview|Research|Plan|Execute|Review]   |  |
|  +------------------------+------------------------------------+  |
|                           |                                       |
|  +------------------------v------------------------------------+  |
|  |                  AGENT RUNTIME                               |  |
|  |  [Agent Pool Manager] [Task Queue (DAG)] [K8s Jobs]         |  |
|  |  [Claude Code #1] [Claude Code #2] ... [Agent N]            |  |
|  +--------------------------------------------------------------+ |
|                                                                   |
|  +--------------------------------------------------------------+ |
|  |                   CONFIG UI (Web App)                         | |
|  |  Dashboard | Integrations | Templates | Agents | Audit Log   | |
|  +--------------------------------------------------------------+ |
+-------------------------------------------------------------------+
```

## Workflow

```
Trigger (label on ticket)
    |
    v
Interview -- stakeholder Q&A across channels --> spec.md
    |           Gate: stakeholder approves spec
    v
Research -- parallel codebase exploration --> research.md
    |           Gate: no unresolved questions
    v
Planning -- break into tasks, build DAG --> implementation-plan.md
    |           Gate: human approves plan
    v
Execute  -- parallel agent containers, one branch per task
    |           Gate: tests pass, code compiles (self-healing, 3 retries)
    v
Review   -- agent-to-agent review loop, then human PR review
    |           Gate: human approval + merge
    v
Done     -- ticket status updated
```

Any phase can transition to PAUSED or FAILED. Phases can be skipped via workflow template configuration (e.g., bug fixes skip Interview).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS (TypeScript), PostgreSQL, Redis (BullMQ) |
| Frontend | Next.js 15, React, Tailwind CSS, shadcn/ui, socket.io |
| Auth | NextAuth.js (frontend) + Passport.js (backend), Google OAuth + SSO |
| ORM | Prisma |
| Infrastructure | Docker, Kubernetes, Kustomize |
| AI Agent | Claude Code (headless), extensible via adapter interface |
| Monorepo | Turborepo, pnpm workspaces |
| Testing | Vitest (unit), Supertest (API), Playwright (E2E) |

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10+
- Docker and Docker Compose (for PostgreSQL and Redis)

### Local Development

```bash
# 1. Clone and install dependencies
git clone <repo-url> && cd orchestra
pnpm install

# 2. Start infrastructure services
docker compose up -d postgres redis

# 3. Set up the database
cp apps/core/.env.example apps/core/.env   # edit with your values
pnpm db:push

# 4. Start the backend
pnpm --filter @orchestra/core dev

# 5. Start the frontend (in a separate terminal)
pnpm --filter @orchestra/web dev

# 6. Open the app
open http://localhost:3000
```

### Initial Configuration

1. **Auth** -- Navigate to Settings and configure Google OAuth credentials (client ID and secret).
2. **Integrations** -- Navigate to Integrations and add your Jira, GitHub, Slack, and Claude Code credentials.
3. **Templates** -- Navigate to Workflow Templates and verify the default "Full Development Cycle" template is available. Clone and customize it for your team.

### Environment Variables

| Variable | Description | Default |
|----------|------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://orchestra:orchestra_dev@localhost:5433/orchestra` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `PORT` | Core API server port | `3001` |
| `NODE_ENV` | Environment mode | `development` |
| `JWT_SECRET` | Secret for signing JWT tokens | -- (required) |
| `NEXT_PUBLIC_API_URL` | Core API URL (used by frontend) | `http://localhost:3001` |
| `NEXTAUTH_URL` | Frontend canonical URL | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | NextAuth.js encryption secret | -- (required) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | -- (required for auth) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | -- (required for auth) |
| `JIRA_BASE_URL` | Jira instance URL | -- (optional) |
| `JIRA_API_TOKEN` | Jira API token | -- (optional) |
| `GITHUB_TOKEN` | GitHub personal access token or app token | -- (optional) |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token | -- (optional) |
| `CLAUDE_API_KEY` | Anthropic API key for Claude Code | -- (optional) |

## API Reference

All endpoints are served from the core backend at port 3001. See [docs/api-reference.md](docs/api-reference.md) for the full reference.

| Resource | Endpoints | Description |
|----------|----------|-------------|
| Health | `GET /health` | Liveness and readiness check |
| Auth | `POST /auth/login`, `POST /auth/refresh`, `GET /auth/google/*` | Authentication and token management |
| Workflows | `GET/POST /api/workflows`, `GET/PATCH/DELETE /api/workflows/:id` | Workflow run CRUD and state transitions |
| Templates | `GET/POST /api/templates`, `POST /api/templates/:id/clone`, `POST /api/templates/:id/publish` | Workflow template management |
| Integrations | `GET/POST /api/integrations`, `POST /api/integrations/:id/test` | External service configuration |
| Agents | `GET /api/agents`, `GET /api/agents/:id/logs`, `POST /api/agents/:id/stop` | Agent instance monitoring |
| Webhooks | `POST /webhooks/:provider` | Inbound webhooks from PM tools, code hosts, etc. |
| Audit Log | `GET /api/audit-log` | History of all agent and user actions |
| Settings | `GET/PATCH /api/settings` | Platform configuration |
| Agent Callback | `POST /api/agent-callback` | Result reporting from agent containers |

## Deployment

### Docker Compose (Development)

```bash
# Start all services including the app
docker compose up -d

# Or start only infrastructure for local development
docker compose up -d postgres redis
```

### Kubernetes (Production)

Orchestra ships with Kustomize-based K8s manifests supporting base and overlay configurations.

```bash
# Preview the production manifests
kubectl kustomize k8s/overlays/prod

# Apply to your cluster
kubectl apply -k k8s/overlays/prod

# Verify deployment
kubectl -n orchestra get pods
kubectl -n orchestra get ingress
```

See [docs/deployment-guide.md](docs/deployment-guide.md) for detailed production deployment instructions.

## Project Structure

```
orchestra/
├── apps/
│   ├── core/                    # NestJS backend (API + orchestrator)
│   │   ├── src/
│   │   │   ├── workflow/        # Workflow engine + templates
│   │   │   ├── phases/          # Phase handlers (interview, research, etc.)
│   │   │   ├── gateway/         # Webhook receivers + event routing
│   │   │   ├── adapters/        # Plugin adapter system (PM, code host, etc.)
│   │   │   ├── agent-runtime/   # K8s Job management + task queue
│   │   │   ├── plugins/         # Plugin registry and loader
│   │   │   ├── auth/            # Google OAuth + SSO
│   │   │   └── common/          # Shared utilities, config, logger
│   │   ├── prisma/              # Database schema and migrations
│   │   └── Dockerfile
│   └── web/                     # Next.js frontend
│       ├── src/
│       │   ├── app/             # App router pages
│       │   ├── components/      # UI components (shadcn/ui, workflow viz)
│       │   ├── lib/             # API client, WebSocket client
│       │   └── hooks/           # React hooks
│       └── Dockerfile
├── packages/
│   └── shared/                  # Shared TypeScript types
├── containers/
│   └── agent/                   # Coding agent container image
├── k8s/
│   ├── base/                    # Base Kubernetes manifests
│   └── overlays/
│       ├── dev/                 # Development overrides
│       └── prod/                # Production overrides (higher limits, HPA, etc.)
├── docs/
│   ├── product-spec.md          # Full product specification
│   ├── tech-stack.md            # Technology decisions and architecture
│   ├── api-reference.md         # API endpoint reference
│   └── deployment-guide.md      # Deployment instructions
├── docker-compose.yml           # Local development services
├── turbo.json                   # Turborepo configuration
├── package.json                 # Root workspace configuration
└── tsconfig.base.json           # Shared TypeScript config
```

## Plugin System

Orchestra uses a typed adapter interface system that allows any external tool to be integrated. Four adapter categories are supported:

- **PMAdapter** -- Project management tools (Jira, Linear, Asana). Handles ticket CRUD, label watching, status transitions.
- **CodeHostAdapter** -- Code hosting platforms (GitHub, GitLab, Bitbucket). Handles branches, PRs, inline comments, webhooks.
- **ChannelAdapter** -- Communication channels (Slack, Teams, Discord, Jira Comments). Handles messaging, threading, user identity.
- **CodingAgentAdapter** -- AI coding agents (Claude Code, Aider, Cursor). Handles agent lifecycle, task execution, output streaming.

To create a custom adapter:

1. Implement the relevant interface from `packages/shared/src/types/adapter.types.ts`.
2. Register your adapter class in `apps/core/src/adapters/` following the existing pattern.
3. Use NestJS dependency injection to swap the adapter via configuration or the plugin registry.

Adapters are swappable at runtime through the Plugin Marketplace in the web UI.

## Contributing

1. Fork the repository and create a feature branch.
2. Install dependencies with `pnpm install`.
3. Run tests with `pnpm test` and linting with `pnpm lint`.
4. Ensure all checks pass before submitting a pull request.
5. Follow conventional commit messages (e.g., `feat:`, `fix:`, `docs:`).

## License

MIT
