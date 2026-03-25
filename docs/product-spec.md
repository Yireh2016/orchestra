# Orchestra — Agentic Coding Workflow Platform

## Product Spec v0.3

**Status**: PO-reviewed — tech stack approved
**Last updated**: 2026-03-25
**Tech stack**: See [tech-stack.md](tech-stack.md)

---

## 1. Vision

Orchestra is a platform that turns project management tickets into working, reviewed pull requests — autonomously. It orchestrates AI coding agents through configurable workflows while keeping humans in control at critical decision points.

The platform is **tool-agnostic**: any project management tool, code host, communication channel, or coding agent can be plugged in via adapters.

---

## 2. Workflow Templates

Workflows are configurable templates that define the phases a ticket goes through. Teams can clone and customize workflows, or create entirely new ones.

### 2.1 Default Workflow: "Full Development Cycle"

The built-in workflow shipped with Orchestra. Suitable for epics, features, and large tasks.

```
TRIGGER (label/tag on ticket)
    │
    ▼
PHASE 1: INTERVIEW
    • Freeform conversation with stakeholders
    • Multi-channel: Slack, PM tool comments, etc.
    • Single source of truth: PM tool item description
    • Conflict detection across respondents
    • Output: spec.md (persisted in repo + synced to PM tool)
    • Gate: Stakeholder explicitly approves spec
    │
    ▼
PHASE 2: DEEP RESEARCH
    • Parallel codebase exploration agents
    • Document-only: what exists, how it works, where it lives
    • Feasibility assessment, risk identification
    • Output: research.md with file:line references
    • Gate: Research complete, no unresolved questions
    │
    ▼
PHASE 3: PLANNING
    • Break work into PR-sized tasks (one branch per task)
    • Dependency DAG + execution groups for parallelization
    • Each task has acceptance criteria + gate tests
    • Output: implementation-plan.md + child tickets in PM tool
    • Gate: Human approves plan
    │
    ▼
PHASE 4: EXECUTION (per task, parallelized via DAG)
    • Coding agent implements the task on its own branch
    • Self-healing gate loop (up to 3 retries per gate)
    • After all gates pass → create PR
    • Gate: All automated tests pass, code compiles
    │
    ▼
PHASE 5: REVIEW
    • Reviewer agent examines PR, adds inline comments
    • Executor agent addresses review comments
    • Loop until reviewer is satisfied
    • Human reviews PR (approval happens in PR)
    • Human comments handled by agent (label/tag trigger)
    • Human merges when satisfied → ticket moves to Done
    • Gate: Human approval + merge
```

### 2.2 Workflow Template System

```
Workflow Template
├── name: string
├── description: string
├── trigger: TriggerConfig (label/tag pattern)
├── phases: Phase[] (ordered list)
│   ├── Phase
│   │   ├── name: string
│   │   ├── handler: string (registered phase handler)
│   │   ├── config: object (handler-specific settings)
│   │   ├── gate: GateConfig
│   │   │   ├── automated: AutoGate[] (tests, lint, build)
│   │   │   └── manual: ManualGate[] (human checkpoints)
│   │   ├── skipConditions: Condition[] (e.g., skip interview for bugs)
│   │   └── timeout: Duration (optional)
│   └── ...
├── artifactPaths: object (where to persist outputs)
└── metadata: object (author, version, team)
```

**Key capabilities:**
- **Clone & customize**: Teams clone the default workflow and modify phases, gates, skip conditions
- **Skip conditions**: e.g., bug-fix workflow skips Interview, goes straight to Research
- **Custom phases**: Teams can register new phase handlers via plugins
- **Shared library**: Workflows can be published for other teams to discover and clone
- **Version control**: Workflow templates are versioned; running workflows pin to a version

### 2.3 Example Workflows

| Workflow | Phases | Use case |
|----------|--------|----------|
| Full Development Cycle | Interview → Research → Plan → Execute → Review | Features, epics |
| Bug Fix | Research → Plan → Execute → Review | Bug tickets (skip interview) |
| Hot Fix | Execute → Review | Urgent fixes (minimal process) |
| Research Only | Interview → Research | Spike/investigation tickets |
| Plan & Estimate | Interview → Research → Plan | Planning sprints, no execution |

---

## 3. Architecture

### 3.1 System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      ORCHESTRA PLATFORM                         │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    GATEWAY LAYER                          │  │
│  │                                                           │  │
│  │  Inbound:  Webhook receivers (PM, Code Host, Channels)   │  │
│  │  Outbound: Adapter clients (post comments, create PRs)   │  │
│  │                                                           │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │  │
│  │  │ PM Tool  │ │ Code     │ │ Channel  │ │ Generic    │  │  │
│  │  │ Adapter  │ │ Host     │ │ Adapter  │ │ Webhook    │  │  │
│  │  │ (Jira)   │ │ Adapter  │ │ (Slack)  │ │ Receiver   │  │  │
│  │  │          │ │ (GitHub) │ │          │ │            │  │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬───────┘  │  │
│  └───────┼─────────────┼───────────┼─────────────┼──────────┘  │
│          └─────────────┴─────┬─────┴─────────────┘             │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   ORCHESTRATOR (Core)                     │  │
│  │                                                           │  │
│  │  ┌────────────────┐ ┌────────────────┐ ┌──────────────┐  │  │
│  │  │ Workflow Engine │ │ State Manager  │ │ Plugin       │  │  │
│  │  │ (State Machine) │ │ (Persistence)  │ │ Registry     │  │  │
│  │  └────────┬───────┘ └────────────────┘ └──────────────┘  │  │
│  │           │                                               │  │
│  │  ┌────────▼───────────────────────────────────────────┐   │  │
│  │  │          WORKFLOW TEMPLATE ENGINE                   │   │  │
│  │  │                                                    │   │  │
│  │  │  Loads workflow definitions, resolves phases,      │   │  │
│  │  │  evaluates skip conditions, manages versioning     │   │  │
│  │  └────────┬───────────────────────────────────────────┘   │  │
│  │           │                                               │  │
│  │  ┌────────▼───────────────────────────────────────────┐   │  │
│  │  │              PHASE HANDLERS                        │   │  │
│  │  │                                                    │   │  │
│  │  │  ┌─────────────┐ ┌──────────┐ ┌─────────────────┐ │   │  │
│  │  │  │ Interviewer │ │Researcher│ │    Planner       │ │   │  │
│  │  │  └─────────────┘ └──────────┘ └─────────────────┘ │   │  │
│  │  │  ┌─────────────┐ ┌──────────┐ ┌─────────────────┐ │   │  │
│  │  │  │  Executor   │ │ Reviewer │ │ Custom (plugin) │ │   │  │
│  │  │  └─────────────┘ └──────────┘ └─────────────────┘ │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────▼───────────────────────────────┐  │
│  │                 AGENT RUNTIME                             │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │  │
│  │  │ Agent Pool  │  │ Task Queue  │  │ Container   │      │  │
│  │  │ Manager     │  │ (DAG-aware) │  │ Orchestrator│      │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │  │
│  │         │                │                 │              │  │
│  │         ▼                ▼                 ▼              │  │
│  │  ┌─────────────────────────────────────────────────┐     │  │
│  │  │           CODING AGENT CONTAINERS               │     │  │
│  │  │                                                 │     │  │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐     │     │  │
│  │  │  │ Claude    │ │ Claude    │ │ Agent N   │     │     │  │
│  │  │  │ Code #1   │ │ Code #2   │ │ (plugin)  │     │     │  │
│  │  │  │ (Task A)  │ │ (Task B)  │ │ (Task C)  │     │     │  │
│  │  │  └───────────┘ └───────────┘ └───────────┘     │     │  │
│  │  └─────────────────────────────────────────────────┘     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    CONFIG UI (Web App)                    │  │
│  │                                                           │  │
│  │  • Auth: Google OAuth 2.0 + SSO (SAML/OIDC)             │  │
│  │  • Integration setup (PM tool, code host, channels)      │  │
│  │  • Workflow template editor (clone, customize, publish)  │  │
│  │  • Agent management (add/remove coding agents)           │  │
│  │  • Dashboard: active workflows, task status, logs        │  │
│  │  • Plugin marketplace (install/configure adapters)       │  │
│  │                                                           │  │
│  │  Served as separate module (future: mobile client)       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Plugin Interface Contracts

Every external system connects through a typed interface.

#### PMAdapter (Jira, Linear, Asana, etc.)

```
PMAdapter:
  // Reading
  getTicket(id) → Ticket
  getTicketComments(id) → Comment[]
  watchForLabelChanges(label, callback) → Subscription

  // Writing
  createTicket(parentId, data) → Ticket
  updateTicket(id, data) → void
  addComment(ticketId, message) → void
  updateStatus(ticketId, status) → void
  addLabel(ticketId, label) → void
  removeLabel(ticketId, label) → void
  linkTickets(parentId, childId, relationship) → void

  // Metadata
  getAvailableStatuses() → Status[]
  getAvailableLabels() → Label[]
```

#### CodeHostAdapter (GitHub, GitLab, Bitbucket, etc.)

```
CodeHostAdapter:
  // Branches & PRs
  createBranch(repo, baseBranch, newBranch) → void
  createPR(repo, data) → PullRequest
  getPR(repo, prId) → PullRequest
  getPRComments(repo, prId) → Comment[]
  addPRComment(repo, prId, comment) → void
  addInlineComment(repo, prId, file, line, comment) → void

  // Webhooks
  watchForPREvents(repo, callback) → Subscription

  // Repo
  cloneRepo(repo, branch, targetDir) → void
  pushBranch(repo, branch) → void
```

#### ChannelAdapter (Slack, Jira Comments, Teams, Discord, etc.)

```
ChannelAdapter:
  // Conversations
  sendMessage(channelId, message) → MessageId
  getMessages(channelId, since?) → Message[]
  watchForMessages(channelId, callback) → Subscription

  // Threading
  replyToThread(channelId, threadId, message) → MessageId

  // Identity
  identifyUser(userId) → User
```

#### CodingAgentAdapter (Claude Code, Aider, Cursor, etc.)

```
CodingAgentAdapter:
  // Lifecycle
  spawn(config: AgentConfig) → AgentInstance
  stop(instanceId) → void
  getStatus(instanceId) → AgentStatus

  // Execution
  executeTask(instanceId, task: TaskDefinition) → TaskResult
  executeCommand(instanceId, command: string) → CommandResult

  // Communication
  sendPrompt(instanceId, prompt: string) → Response
  getOutput(instanceId) → Stream<OutputChunk>
```

### 3.3 State Machine — Workflow Lifecycle

```
                    ┌─────────────┐
      ticket        │             │
      labeled  ──►  │  TRIGGERED  │──► resolve workflow template
                    │             │──► evaluate skip conditions
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │             │  ◄── multi-channel conversation
                    │ INTERVIEWING│  ◄── conflict detection
                    │ (skippable) │  ──► spec.md written
                    └──────┬──────┘
                           │ stakeholder approves
                    ┌──────▼──────┐
                    │             │  ◄── parallel codebase agents
                    │ RESEARCHING │  ──► research.md written
                    │             │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │             │  ◄── interactive with stakeholders
                    │  PLANNING   │  ──► implementation-plan.md
                    │ (skippable) │  ──► child tickets (1 branch each)
                    └──────┬──────┘
                           │ human approves plan
                    ┌──────▼──────┐
                    │             │
                    │  EXECUTING  │  ──► parallel agent containers
                    │             │  ──► one branch per task
                    └──────┬──────┘      self-healing gate loops
                           │ all gates pass
                    ┌──────▼──────┐
                    │             │  ◄── agent↔agent review loop
                    │  REVIEWING  │  ◄── then human review (in PR)
                    │             │  ──► PR comments addressed
                    └──────┬──────┘
                           │ human merges
                    ┌──────▼──────┐
                    │             │
                    │    DONE     │  ──► ticket status updated
                    │             │
                    └─────────────┘

  Any state can transition to:
  ┌──────────┐  ┌──────────┐
  │  PAUSED  │  │  FAILED  │
  └──────────┘  └──────────┘
```

---

## 4. Key Design Decisions

### 4.1 Single Source of Truth

During interviews, conversations can happen across Slack, Jira comments, or any channel. But the **PM tool item description** is always the canonical spec. The interview phase:
1. Collects inputs from all channels
2. Synthesizes into a coherent spec
3. Updates the PM tool item description
4. Posts a summary back to all active channels

### 4.2 Conflict Detection

When multiple stakeholders respond to interview questions:
- Agent tracks who said what with timestamps
- Compares responses semantically for contradictions
- If conflict found: flags in ALL active channels with both positions quoted
- Pauses interview until conflict is resolved
- Resolution is documented in spec

### 4.3 Gate System

Gates are the self-healing mechanism:

```
Implementation → Run Gates → Pass? ─── YES ──→ Create PR
                     │
                     NO
                     │
                     ▼
              Diagnose + Fix (attempt 1)
                     │
              Run Gates → Pass? ─── YES ──→ Create PR
                     │
                     NO
                     │
              (up to 3 attempts, then escalate to human)
```

Gate types:
- **Automated**: test suites, linting, type checking, build
- **Manual**: UI verification, performance checks (requires human)

### 4.4 PR Review Loop

All human approval and review happens **in the PR itself** (target audience: developers).

```
PR Created
    │
    ▼
Reviewer Agent examines ──→ Adds inline comments
    │
    ▼
Executor Agent addresses comments
    │
    ▼
Reviewer re-examines ──→ Clean? ── YES ──→ Ready for Human
    │                                           │
    NO (loop back)                              ▼
                                         Human reviews (in PR)
                                              │
                                    Comments? ── YES ──→ Agent addresses
                                         │                (via label/tag)
                                         NO
                                         │
                                         ▼
                                      Human merges
```

### 4.5 Branching Strategy

Each task gets its **own branch**:
- Branch naming: `orchestra/<ticket-id>/<task-slug>` (e.g., `orchestra/PROJ-123/add-user-prefs-table`)
- One PR per branch/task
- Parallel tasks = parallel branches
- No shared feature branches — keeps PRs atomic and reviewable

### 4.6 Parallel Task Execution

The planning phase produces a dependency DAG. The orchestrator:
1. Identifies execution groups (tasks with no mutual dependencies)
2. Spins up one coding agent container per task in a group
3. Each container gets: repo clone on its own branch, task definition, gates to pass
4. Monitors all containers, handles failures independently
5. Only starts next execution group when all dependencies are satisfied

### 4.7 Deployment Model

```
Docker Compose (dev) / Kubernetes (prod)
│
├── orchestra-core (1 instance)
│   ├── Workflow engine + template engine
│   ├── State manager (SQLite/Postgres)
│   ├── Webhook receivers
│   ├── Plugin loader
│   └── API server (for Config UI)
│
├── orchestra-ui (1 instance)
│   └── Web app (served as separate module)
│
└── orchestra-agent-{id} (N instances, ephemeral)
    ├── Git + repo clone (own branch)
    ├── Coding agent (Claude Code / etc.)
    └── Task runner + gate executor
```

---

## 5. Trigger Mechanism

### v1: Label/Tag Based
- User adds a configured label (e.g., `orchestra:start`) to a PM tool ticket
- Orchestra receives webhook, resolves applicable workflow template, starts workflow
- Child tickets created by planning phase can be assigned to agent via label
- PR review comments trigger agent via label (e.g., `orchestra:address-comments`)

### Future (Must-Have): Bot User Account
- Agent appears as a team member in PM tool
- Direct assignment triggers workflow
- Mentioned in PR comments triggers response
- **Pending org policy review for implementation**

---

## 6. Configuration UI (Web App)

### Authentication
- Google OAuth 2.0
- SSO (SAML 2.0 / OIDC) for enterprise orgs

### Screens
1. **Dashboard** — Active workflows, task statuses, agent activity, logs
2. **Integrations** — Configure PM tool, code host, channels, coding agents (API keys, URLs, auth tokens)
3. **Workflow Templates** — Browse, clone, customize, publish workflow templates. Visual phase editor with skip conditions.
4. **Agent Management** — Registered coding agents, resource limits, concurrent execution caps
5. **Plugin Marketplace** — Browse/install adapter plugins
6. **Audit Log** — History of all agent actions

### Client Architecture
- Web app served as independent module with its own API layer
- Backend exposes REST/GraphQL API consumed by the UI
- Architecture supports future clients (mobile, CLI) via same API

---

## 7. Artifact Outputs

Each workflow produces these artifacts (persisted in repo under `plans/<ticket-id>/`):

| Phase | Artifact | Description |
|-------|----------|-------------|
| Interview | `spec.md` | Complete specification with Q&A, decisions, assumptions |
| Research | `research.md` | Codebase analysis with file:line references |
| Planning | `implementation-plan.md` | Phased plan with DAG, gates, acceptance criteria |
| Planning | Child tickets | Created in PM tool with links and dependencies |
| Execution | Branch + commits | Per-task branches (`orchestra/<ticket>/<slug>`) |
| Execution | Gate results | Logs of gate runs and self-healing attempts |
| Review | PR + comments | Pull request with reviewer agent comments |

---

## 8. Resolved Decisions

| # | Question | Decision | Notes |
|---|----------|----------|-------|
| 1 | Naming | **Orchestra** | — |
| 2 | Repo strategy | **One branch per task** | `orchestra/<ticket-id>/<task-slug>` |
| 3 | Approval UX | **In the PR** | Technical audience (developers) |
| 4 | Multi-repo | **Not in v1** | — |
| 5 | Cost controls | **Future iteration** | Must-have, not v1 |
| 6 | Notifications | **Not in v1** | Active channels only |
| 7 | Rollback | **No** | Post-merge issues treated as bug/hotfix tickets |
| 8 | Templates | **Yes** | Workflow template system with clone/customize/publish |
| 9 | Auth | **Google OAuth + SSO** | SAML 2.0 / OIDC |

---

## 9. What's NOT in Scope for v1

- Mobile client (architecture supports it, but web-only for v1)
- Bot user account in PM tools (label-based only; must-have for future)
- Multi-repo workflows
- Cost controls / budget limits (must-have for future)
- Email/push notifications
- Automated rollback (post-merge issues → new bug/hotfix ticket)
- Billing/usage tracking

---

## 10. Future Roadmap (Documented Must-Haves)

| Feature | Priority | Dependency |
|---------|----------|------------|
| Bot user account trigger | High | Org policy review |
| Cost controls per workflow | High | Usage tracking infrastructure |
| Mobile client | Medium | API already supports it |
| Multi-repo workflows | Medium | Branch strategy extension |
| Workflow marketplace | Low | Template system (v1) |
