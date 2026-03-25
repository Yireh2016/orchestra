/**
 * Template types for the Orchestra monorepo.
 *
 * Templates define the blueprint for a workflow: which phases to run,
 * how they are gated, and what triggers them.
 */

/**
 * A reusable workflow template that teams configure once and trigger many times.
 */
export interface WorkflowTemplate {
  /** Unique identifier for this template. */
  id: string;
  /** Human-readable name shown in the UI. */
  name: string;
  /** Longer description of what this workflow does. */
  description: string;
  /** Ordered list of phases that make up this workflow. */
  phases: PhaseDefinition[];
  /** Configuration that determines how this workflow is triggered. */
  triggerConfig: TriggerConfig;
  /** Auto-incrementing version number. Bumped on every publish. */
  version: number;
  /** The team that owns this template. */
  teamId: string;
  /** If this template was forked, the ID of the original. */
  parentTemplateId?: string;
  /** Whether the template is published and available for triggering. */
  isPublished: boolean;
  /** ISO-8601 timestamp of creation. */
  createdAt: string;
  /** ISO-8601 timestamp of last update. */
  updatedAt: string;
}

/**
 * Defines a single phase inside a {@link WorkflowTemplate}.
 *
 * Phases run sequentially in the order they appear in the template's `phases` array.
 */
export interface PhaseDefinition {
  /** Unique name of this phase within the template (e.g. "interview", "plan"). */
  name: string;
  /** Registered phase-handler identifier that implements this phase's logic. */
  handler: string;
  /** Arbitrary configuration passed to the handler at runtime. */
  config: Record<string, unknown>;
  /** Quality gates that must pass before the phase is considered complete. */
  gate: GateConfig;
  /** Conditions under which this phase should be skipped entirely. */
  skipConditions: SkipCondition[];
  /** Optional maximum duration for this phase in milliseconds. */
  timeout?: number;
}

/** Quality gate configuration for a phase: a combination of automated and manual checks. */
export interface GateConfig {
  /** Automated gates (CI commands) that run without human intervention. */
  automated: AutoGate[];
  /** Manual gates that require a human to approve before proceeding. */
  manual: ManualGate[];
}

/** An automated quality gate that executes a shell command. */
export interface AutoGate {
  /** Human-readable name (e.g. "eslint", "jest-unit"). */
  name: string;
  /** Shell command to run. Exit code 0 = pass, non-zero = fail. */
  command: string;
  /** Maximum number of retry attempts before marking as permanently failed. */
  maxRetries: number;
  /** Timeout for a single execution of the command, in milliseconds. */
  timeoutMs: number;
}

/** A manual quality gate that requires human approval. */
export interface ManualGate {
  /** Human-readable name (e.g. "design-review", "security-sign-off"). */
  name: string;
  /** Description shown to the approver explaining what to check. */
  description: string;
  /** Optional role required to approve (e.g. "tech-lead"). If omitted, any team member can approve. */
  approverRole?: string;
}

/**
 * A condition that, when met, causes a phase to be skipped.
 *
 * Evaluated against the ticket or workflow context before the phase starts.
 */
export interface SkipCondition {
  /** Dot-notation path to the field being evaluated (e.g. "ticket.type", "ticket.priority"). */
  field: string;
  /** Comparison operator. */
  operator: 'equals' | 'not_equals' | 'contains' | 'matches';
  /** The value to compare against. For "matches", this is a regex pattern. */
  value: string;
}

/** Defines how a workflow is triggered. */
export interface TriggerConfig {
  /** The kind of trigger. */
  type: 'label' | 'assignment' | 'webhook';
  /** Label name that triggers the workflow (required when type is "label"). */
  label?: string;
  /** Assignee identifier that triggers the workflow (required when type is "assignment"). */
  assignee?: string;
  /** URL path segment for incoming webhooks (required when type is "webhook"). */
  webhookPath?: string;
}
