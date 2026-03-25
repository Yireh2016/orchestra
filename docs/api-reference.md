# Orchestra -- API Reference

Base URL: `http://localhost:3001` (development) or `https://orchestra.example.com/api` (production)

All endpoints except Health and Auth require a valid JWT bearer token in the `Authorization` header.

---

## Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns service health status, database connectivity, and Redis connectivity. Used by Kubernetes liveness and readiness probes. |

**Response:**
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "uptime": 123456
}
```

---

## Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/login` | Authenticate with email/password (if enabled). Returns access and refresh tokens. |
| `POST` | `/auth/refresh` | Exchange a refresh token for a new access token. |
| `GET` | `/auth/google` | Initiate Google OAuth 2.0 flow. |
| `GET` | `/auth/google/callback` | Google OAuth callback handler. |
| `GET` | `/auth/sso` | Initiate SSO (SAML/OIDC) flow. |
| `GET` | `/auth/sso/callback` | SSO callback handler. |
| `GET` | `/auth/me` | Return the currently authenticated user profile. |
| `POST` | `/auth/logout` | Invalidate the current session. |

---

## Workflows

Workflow runs represent active instances of a workflow template processing a ticket.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/workflows` | List all workflow runs. Supports filtering by `status`, `templateId`, `ticketId`. Paginated. |
| `POST` | `/api/workflows` | Create a new workflow run from a template. Body: `{ templateId, ticketId, config? }`. |
| `GET` | `/api/workflows/:id` | Get a single workflow run with full phase data, task graph, and current state. |
| `PATCH` | `/api/workflows/:id` | Update workflow run configuration or metadata. |
| `DELETE` | `/api/workflows/:id` | Cancel and delete a workflow run. |
| `POST` | `/api/workflows/:id/transition` | Trigger a state transition. Body: `{ action: "pause" | "resume" | "retry" | "skip_phase" | "cancel" }`. |
| `GET` | `/api/workflows/:id/tasks` | List all tasks in the workflow's execution DAG with statuses. |
| `GET` | `/api/workflows/:id/artifacts` | List artifacts produced by the workflow (spec.md, research.md, etc.). |
| `GET` | `/api/workflows/:id/timeline` | Get a timeline of all phase transitions and events. |

---

## Workflow Templates

Templates define reusable workflow configurations with phases, gates, and skip conditions.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/templates` | List all templates. Supports filtering by `teamId`, `isPublished`. Paginated. |
| `POST` | `/api/templates` | Create a new workflow template. Body: `{ name, description, phases, triggerConfig }`. |
| `GET` | `/api/templates/:id` | Get a single template with all phase definitions. |
| `PATCH` | `/api/templates/:id` | Update a template. Creates a new version. |
| `DELETE` | `/api/templates/:id` | Delete a template (only if no active workflow runs use it). |
| `POST` | `/api/templates/:id/clone` | Clone a template into the current team's workspace. Body: `{ name? }`. |
| `POST` | `/api/templates/:id/publish` | Publish a template to the shared library for other teams. |
| `GET` | `/api/templates/:id/versions` | List all versions of a template. |
| `GET` | `/api/templates/:id/versions/:version` | Get a specific version of a template. |

---

## Integrations

Integrations connect Orchestra to external services (PM tools, code hosts, channels, coding agents).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/integrations` | List all configured integrations for the current team. |
| `POST` | `/api/integrations` | Create a new integration. Body: `{ type, adapterName, config }`. |
| `GET` | `/api/integrations/:id` | Get integration details (config values are masked). |
| `PATCH` | `/api/integrations/:id` | Update integration configuration. |
| `DELETE` | `/api/integrations/:id` | Remove an integration. |
| `POST` | `/api/integrations/:id/test` | Test connectivity and authentication with the external service. Returns success/failure with details. |

**Integration types:** `pm`, `code_host`, `channel`, `coding_agent`

**Adapter names:** `jira`, `linear`, `github`, `gitlab`, `slack`, `teams`, `claude-code`, `aider`

---

## Agents

Agent instances represent running or completed coding agent containers.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents` | List all agent instances. Supports filtering by `status`, `workflowRunId`, `taskId`. Paginated. |
| `GET` | `/api/agents/:id` | Get agent instance details including task assignment, resource usage, and status. |
| `GET` | `/api/agents/:id/logs` | Stream or fetch agent container logs. Supports `?follow=true` for real-time streaming via SSE. |
| `POST` | `/api/agents/:id/stop` | Gracefully stop a running agent instance. |
| `GET` | `/api/agents/:id/output` | Get the structured output (artifacts, gate results) produced by the agent. |

---

## Webhooks

Inbound webhook receivers for external services. Each provider has its own endpoint with signature validation.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhooks/jira` | Receive Jira webhooks (ticket updates, label changes, comments). |
| `POST` | `/webhooks/github` | Receive GitHub webhooks (PR events, push events, comments). |
| `POST` | `/webhooks/slack` | Receive Slack event callbacks (messages, reactions). |
| `POST` | `/webhooks/generic` | Generic webhook receiver for custom integrations. |

All webhook endpoints validate request signatures using provider-specific methods (e.g., `x-hub-signature-256` for GitHub, Jira webhook secret).

---

## Audit Log

Immutable history of all actions taken by users and agents within the platform.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/audit-log` | List audit log entries. Supports filtering by `workflowRunId`, `actor`, `action`, date range. Paginated. |
| `GET` | `/api/audit-log/:id` | Get a single audit log entry with full details. |

**Action types:** `workflow.created`, `workflow.transitioned`, `phase.started`, `phase.completed`, `task.started`, `task.completed`, `task.failed`, `agent.spawned`, `agent.stopped`, `pr.created`, `pr.reviewed`, `pr.merged`, `integration.configured`, `template.cloned`, `template.published`, `settings.updated`

---

## Settings

Platform-level configuration for the current team.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Get current platform settings. |
| `PATCH` | `/api/settings` | Update platform settings. Body: any subset of settings fields. |

**Settings fields:**
- `defaultTemplateId` -- Default workflow template for new triggers
- `maxConcurrentAgents` -- Maximum number of concurrent agent containers
- `agentTimeoutSeconds` -- Default timeout for agent jobs
- `gateRetryLimit` -- Number of self-healing retries before escalation (default: 3)
- `branchPrefix` -- Branch naming prefix (default: `orchestra`)
- `artifactPath` -- Repository path for persisted artifacts (default: `plans/`)

---

## Agent Callback

Internal endpoint used by agent containers to report results back to the orchestrator.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/agent-callback` | Agent reports task completion, gate results, or failure. Body: `{ agentId, taskId, status, gateResults?, artifacts?, error? }`. |

This endpoint is authenticated via the agent-specific API key injected into the container environment.

---

## WebSocket Events

Real-time updates are delivered via WebSocket (socket.io) at the `/events` namespace.

| Event | Direction | Description |
|-------|-----------|-------------|
| `workflow:status` | Server -> Client | Workflow state transition. Payload: `{ workflowId, state, previousState }`. |
| `phase:update` | Server -> Client | Phase progress update. Payload: `{ workflowId, phase, status, data }`. |
| `task:update` | Server -> Client | Task status change. Payload: `{ workflowId, taskId, status, gateResults? }`. |
| `agent:log` | Server -> Client | Real-time agent log line. Payload: `{ agentId, line, timestamp }`. |
| `agent:output` | Server -> Client | Structured agent output chunk. Payload: `{ agentId, type, content }`. |

Subscribe to events for a specific workflow: `socket.emit('subscribe', { workflowId })`.

---

## Common Response Formats

### Pagination

All list endpoints support pagination via query parameters:

```
GET /api/workflows?page=1&limit=20&sortBy=createdAt&order=desc
```

Response includes pagination metadata:
```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 142,
    "totalPages": 8
  }
}
```

### Error Responses

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    { "field": "templateId", "message": "Template not found" }
  ]
}
```

Standard HTTP status codes: `200` OK, `201` Created, `204` No Content, `400` Bad Request, `401` Unauthorized, `403` Forbidden, `404` Not Found, `409` Conflict, `422` Unprocessable Entity, `500` Internal Server Error.
