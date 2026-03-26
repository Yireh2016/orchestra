---
name: Project entity design decisions
description: Projects group workflows with repo/integration/context info — key decisions made 2026-03-26
type: project
---

## Project Entity — Design Decisions

- Multi-repo support (frontend + backend repos in one project)
- Auto-detect PM project key from ticket format (RMK-13661 → RMK)
- Context auto-generated on first repo scan:
  - First checks for CLAUDE.md, agents.md, .claude/ files
  - Falls back to scanning README, package.json, tech stack files
  - Result is editable by the user
- Projects contain: repos, integrations mapping, workflows, AI context
- All AI prompts across all phases receive project context

**Why:** Coding agent was working blind — no repo awareness, no codebase context.
**How to apply:** Every workflow creation requires a project. Project context injected into all AI prompts.
