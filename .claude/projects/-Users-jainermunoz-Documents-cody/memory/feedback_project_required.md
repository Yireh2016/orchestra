---
name: Project field must be required for workflow creation
description: No workflow should exist without a project — add validation in UI and backend
type: feedback
---

The projectId field must be required when creating a workflow. No project-less workflows should exist.

**Why:** Without a project, the agent has no repo context, no integrations mapping, and no codebase to analyze. Every validation failure during the first session stemmed from missing project context.

**How to apply:**
- Backend: WorkflowService.create() should reject if projectId is missing or invalid
- Frontend: Workflow creation modal should require project selection (disable Create button until project is selected)
- Remove the auto-detect fallback as the sole mechanism — it should be a convenience, not the only way to link projects
