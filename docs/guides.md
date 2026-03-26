# Orchestra — Getting Started Guide

This guide walks you through setting up Orchestra and running your first autonomous workflow from start to finish.

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js 22+** and **pnpm 10+** installed
- **Docker** running (for PostgreSQL and Redis)
- A **Jira** account with API access
- A **GitHub** account with a personal access token
- An **Anthropic API key** (for Claude Code)

---

## 1. Start the Infrastructure

```bash
# From the project root
docker compose up -d postgres redis

# Verify they're running
docker compose ps
# Both should show "healthy"
```

---

## 2. Set Up the Database

```bash
# Push the schema to PostgreSQL
DATABASE_URL=postgresql://orchestra:orchestra_dev@localhost:5433/orchestra \
  pnpm --filter @orchestra/core exec npx prisma db push

# Generate the Prisma client
DATABASE_URL=postgresql://orchestra:orchestra_dev@localhost:5433/orchestra \
  pnpm --filter @orchestra/core exec npx prisma generate
```

---

## 3. Build and Start the Backend

```bash
# Build the backend
pnpm --filter @orchestra/shared build
pnpm --filter @orchestra/core build

# Start the backend (runs on port 3001)
DATABASE_URL=postgresql://orchestra:orchestra_dev@localhost:5433/orchestra \
REDIS_URL=redis://localhost:6379 \
PORT=3001 \
JWT_SECRET=your-secret-here \
  node apps/core/dist/main.js
```

Verify it's running:
```bash
curl http://localhost:3001/health
# Should return: {"status":"ok","database":"connected",...}
```

---

## 4. Start the Frontend

In a new terminal:

```bash
# Start the frontend (runs on port 3000)
AUTH_SECRET=your-secret-here \
AUTH_TRUST_HOST=true \
NEXT_PUBLIC_API_URL=http://localhost:3001 \
  pnpm --filter @orchestra/web dev
```

Open **http://localhost:3000** in your browser.

---

## 5. Create Your Account

1. Go to **http://localhost:3000/auth/signin**
2. Click **Register** (toggle at the bottom of the form)
3. Enter your name, email, and password (min 8 characters)
4. Click **Create account**
5. You'll be redirected to the dashboard

---

## 6. Configure Integrations

Navigate to **http://localhost:3000/integrations**. You need to set up three integrations:

### Jira (PM Tool)

1. In the **PM Tools** section, click **Add Integration**
2. Select **jira** as the adapter
3. Fill in:
   - **Base URL**: Your Jira instance URL (e.g., `https://yourorg.atlassian.net`)
   - **Email**: Your Jira account email
   - **API Token**: Generate one at [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
4. Click **Save**
5. Click **Test Connection** — should show "Connected as [your name]"

### GitHub (Code Host)

1. In the **Code Hosts** section, click **Add Integration**
2. Select **github** as the adapter
3. Fill in:
   - **Token**: A GitHub Personal Access Token with `repo`, `write:discussion`, and `read:org` permissions. Generate at [https://github.com/settings/tokens](https://github.com/settings/tokens)
   - **Base URL**: Leave empty for github.com, or set for GitHub Enterprise
4. Click **Save**
5. Click **Test Connection** — should show "Connected as [your username]"

### Claude Code (Coding Agent)

1. In the **Coding Agents** section, click **Add Integration**
2. Select **claude-code** as the adapter
3. Fill in:
   - **API Key**: Your Anthropic API key from [https://console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
4. Click **Save**
5. Click **Test Connection** — should show "API key is valid"

> **Security note**: All secrets are encrypted at rest using AES-256-GCM. They appear as `*****` in the UI after saving and are never exposed in API responses.

---

## 7. Review the Default Workflow Template

Navigate to **http://localhost:3000/workflows/templates**.

You'll see the **"Full Development Cycle"** template with 5 phases:

| Phase | What it does |
|-------|-------------|
| **Interview** | Posts questions to the Jira ticket, collects stakeholder responses, synthesizes a spec |
| **Deep Research** | Spawns Claude Code to analyze the codebase, produces a research document |
| **Planning** | Generates an implementation plan with tasks, dependencies, and gates |
| **Execution** | Creates branches, runs coding agents per task, executes gate tests |
| **Review** | AI reviews PRs, posts inline comments, tracks human review and merge |

Click on the template to edit it if you want to customize phases, skip conditions, or gates.

---

## 8. Create Your First Workflow

### Option A: From the UI

1. Go to **http://localhost:3000/workflows**
2. Click **New Workflow**
3. Select the **"Full Development Cycle"** template
4. Enter a Jira ticket ID (e.g., `PROJ-123`)
5. Click **Create**

### Option B: Via API

```bash
# Get the template ID
TEMPLATE_ID=$(curl -s http://localhost:3001/templates | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

# Create a workflow
curl -X POST http://localhost:3001/workflows \
  -H "Content-Type: application/json" \
  -d "{\"templateId\": \"$TEMPLATE_ID\", \"ticketId\": \"PROJ-123\"}"
```

---

## 9. Watch the Workflow Progress

Once created, the workflow automatically begins:

### Phase 1: Interview
- Orchestra reads the Jira ticket description
- Posts initial questions as a **Jira comment** on the ticket
- **Your action**: Reply to the questions in Jira. The agent will process your responses.
- When you're satisfied the spec is complete, trigger the approval (via the workflow detail page or API):
  ```bash
  curl -X PATCH http://localhost:3001/workflows/<workflow-id>/transition \
    -H "Content-Type: application/json" \
    -d '{"state": "RESEARCHING"}'
  ```

### Phase 2: Deep Research
- Claude Code analyzes the codebase automatically
- No action required — this phase auto-completes
- Check the workflow detail page to see research findings

### Phase 3: Planning
- Claude Code generates an implementation plan with tasks and dependencies
- A plan summary is posted to Jira
- **Your action**: Review the plan on the workflow detail page
- Approve via API:
  ```bash
  curl -X PATCH http://localhost:3001/workflows/<workflow-id>/transition \
    -H "Content-Type: application/json" \
    -d '{"state": "EXECUTING"}'
  ```
- Child Jira tickets are created for each task

### Phase 4: Execution
- For each task (parallelized when dependencies allow):
  - A branch is created: `orchestra/<ticket-id>/<task-slug>`
  - Claude Code implements the changes
  - Gate tests run (with up to 3 self-healing retries)
  - On success, a PR is created
- Monitor progress on the workflow detail page (live updates via WebSocket)

### Phase 5: Review
- An AI reviewer examines each PR and posts inline comments
- If changes are needed, the executor agent addresses them
- **Your action**: Do a final human review on the PR
- Merge the PR when satisfied
- Orchestra detects the merge and closes the loop

---

## 10. Monitor Everything

### Dashboard (http://localhost:3000)
- Active workflows, agent count, success rate
- Green "Live" indicator when WebSocket is connected

### Workflow Detail (click any workflow)
- Phase timeline with animated current phase
- Task dependency graph with status colors
- Gate results with expandable output
- Activity feed with real-time events

### Agents (http://localhost:3000/agents)
- Active coding agents with live status
- Terminal-style log viewer per agent

### Audit Log (http://localhost:3000/audit)
- Full history of all system actions
- Filter by workflow, action type, actor, date range

---

## Workflow Lifecycle Controls

| Action | How |
|--------|-----|
| **Pause** a workflow | Workflow detail page → Pause button, or `POST /workflows/:id/pause` |
| **Resume** a paused workflow | Workflow detail page → Resume button, or `POST /workflows/:id/resume` |
| **Cancel** a workflow | Workflow detail page → Cancel button |
| **Retry** a failed task | The system retries automatically (3 attempts). If all fail, the workflow pauses for human intervention. |

---

## Custom Workflows

You can create custom workflow templates for different scenarios:

1. Go to **Templates** → click **Clone** on the default template
2. Edit the cloned template:
   - Remove phases (e.g., skip Interview for bug fixes)
   - Add skip conditions (e.g., skip Interview when ticket type is "Bug")
   - Customize gates per phase
3. Save and use your custom template when creating workflows

### Example: Bug Fix Workflow

Clone the default template, then:
- Set a skip condition on the Interview phase: `ticket.type equals Bug`
- This creates a 4-phase workflow: Research → Plan → Execute → Review

### Example: Hot Fix Workflow

Clone and keep only:
- Execution phase
- Review phase

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis connection string |
| `PORT` | No | `3001` | Backend API port |
| `JWT_SECRET` | Yes | — | Secret for JWT token signing |
| `AUTH_SECRET` | Yes | — | NextAuth session encryption secret |
| `AUTH_TRUST_HOST` | No | `false` | Set to `true` for local development |
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:3001` | Backend URL for the frontend |
| `AGENT_RUNTIME_MODE` | No | `process` | Agent execution mode: `process`, `docker`, or `k8s` |
| `AGENT_MAX_CONCURRENCY` | No | `5` | Max parallel coding agents |
| `CORS_ORIGINS` | No | `http://localhost:3000` | Comma-separated allowed origins |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Dashboard shows no data | Check that the backend is running: `curl http://localhost:3001/health` |
| "Test Connection" fails for Jira | Verify your base URL includes `https://` and your API token is correct |
| Workflow stuck in INTERVIEWING | The agent posted questions to Jira — check the ticket comments and reply |
| Agent fails to start | Check the Anthropic API key in Integrations. Verify with Test Connection. |
| WebSocket not connecting | The green "Live" dot should appear. Check that port 3001 is accessible. |
| NextAuth session errors | Ensure `AUTH_SECRET` env var is set when starting the frontend |
| Hydration mismatch warnings | If using Dark Reader browser extension, this is expected and harmless |

---

## Next Steps

- **Set up webhooks**: Configure Jira and GitHub webhooks pointing to `http://your-host:3001/webhooks/jira` and `/webhooks/github` to enable automatic event-driven workflow progression
- **Deploy to production**: See [deployment-guide.md](deployment-guide.md) for Kubernetes setup
- **Explore the API**: See [api-reference.md](api-reference.md) for all endpoints
