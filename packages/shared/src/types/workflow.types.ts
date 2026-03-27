/**
 * Workflow types for the Orchestra monorepo.
 *
 * Defines the core data structures that drive workflow execution,
 * including states, task graphs, phase tracking, and gate results.
 */

/** The lifecycle states a workflow run can be in. */
export enum WorkflowState {
  /** Initial state after a trigger fires. */
  TRIGGERED = 'triggered',
  /** The system is gathering requirements / clarifications from the user. */
  INTERVIEWING = 'interviewing',
  /** Background research is being performed (e.g. codebase analysis). */
  RESEARCHING = 'researching',
  /** A task plan / DAG is being constructed. */
  PLANNING = 'planning',
  /** Tasks are actively being executed by coding agents. */
  EXECUTING = 'executing',
  /** Results are being reviewed (automated gates + optional manual review). */
  REVIEWING = 'reviewing',
  /** The workflow completed successfully. Terminal state. */
  DONE = 'done',
  /** The workflow has been paused (e.g. waiting for manual approval). */
  PAUSED = 'paused',
  /** The workflow failed. Terminal state. */
  FAILED = 'failed',
}

/** Status of an individual task inside a workflow's task graph. */
export enum TaskStatus {
  /** Task has been created but not yet scheduled. */
  PENDING = 'pending',
  /** Task is queued and waiting for an available agent. */
  QUEUED = 'queued',
  /** Task is actively being worked on by an agent. */
  RUNNING = 'running',
  /** Task completed and all gates passed. */
  PASSED = 'passed',
  /** Task failed after exhausting retries. */
  FAILED = 'failed',
  /** Automated gates passed; waiting for human to verify manual gates. */
  AWAITING_MANUAL_GATES = 'awaiting_manual_gates',
}

/**
 * A single workflow run — the runtime instance of a {@link WorkflowTemplate}.
 */
export interface WorkflowRun {
  /** Unique identifier for this run. */
  id: string;
  /** The template this run was created from. */
  templateId: string;
  /** Snapshot of the template version at the time the run was created. */
  templateVersion: number;
  /** The PM ticket that triggered this run. */
  ticketId: string;
  /** Current lifecycle state of the run. */
  state: WorkflowState;
  /** Per-phase state, keyed by phase name. */
  phaseData: Record<string, PhaseState>;
  /** The task DAG generated during the planning phase. */
  taskGraph?: TaskDAG;
  /** ISO-8601 timestamp of creation. */
  createdAt: string;
  /** ISO-8601 timestamp of last update. */
  updatedAt: string;
}

/** Tracks the runtime status of a single phase within a workflow run. */
export interface PhaseState {
  /** Human-readable phase name (matches the {@link PhaseDefinition} name). */
  name: string;
  /** Current status of this phase. */
  status: 'pending' | 'active' | 'completed' | 'skipped' | 'failed';
  /** ISO-8601 timestamp when the phase started executing. */
  startedAt?: string;
  /** ISO-8601 timestamp when the phase finished. */
  completedAt?: string;
  /** Artifacts produced by this phase, keyed by artifact name. Values are paths or URLs. */
  artifacts: Record<string, string>;
  /** Arbitrary metadata attached during phase execution. */
  metadata: Record<string, unknown>;
}

/** A directed acyclic graph of tasks to be executed by coding agents. */
export interface TaskDAG {
  /** All task nodes in the graph. */
  nodes: TaskNode[];
  /** Ordered groups of tasks that can run in parallel within each group. */
  executionGroups: ExecutionGroup[];
}

/** A single node in the {@link TaskDAG}. */
export interface TaskNode {
  /** Unique identifier for this task. */
  id: string;
  /** The PM ticket (or sub-ticket) this task maps to. */
  ticketId: string;
  /** Git branch name where work happens. */
  branch: string;
  /** Short human-readable title. */
  title: string;
  /** IDs of tasks that must complete before this one can start. */
  dependsOn: string[];
  /** Current execution status. */
  status: TaskStatus;
  /** The coding-agent instance assigned to this task, if any. */
  agentInstanceId?: string;
  /** Results from quality gates (lint, test, etc.) run against this task. */
  gateResults: GateResult[];
  /** URL of the pull request created for this task, if any. */
  prUrl?: string;
  /** ISO-8601 timestamp of creation. */
  createdAt: string;
  /** ISO-8601 timestamp of last update. */
  updatedAt: string;
}

/** A group of tasks that share the same execution order and can run concurrently. */
export interface ExecutionGroup {
  /** Execution order (0-based). Lower numbers run first. */
  order: number;
  /** IDs of tasks in this group. */
  taskIds: string[];
  /** Aggregate status of all tasks in the group. */
  status: 'pending' | 'running' | 'completed' | 'failed';
}

/** The result of running a single quality gate against a task. */
export interface GateResult {
  /** Human-readable gate name (e.g. "lint", "unit-tests"). */
  name: string;
  /** Whether the gate is automated (CI command) or requires human approval. */
  type: 'automated' | 'manual';
  /** Shell command executed for automated gates. */
  command?: string;
  /** Current pass/fail status. */
  status: 'pending' | 'passed' | 'failed';
  /** How many times this gate has been attempted so far. */
  attempts: number;
  /** Maximum number of attempts before the gate is marked as permanently failed. */
  maxAttempts: number;
  /** Stdout / structured output from the gate command. */
  output?: string;
  /** Error message if the gate failed. */
  error?: string;
  /** ISO-8601 timestamp of the most recent execution. */
  executedAt?: string;
}

/**
 * Map of every legal state transition.
 *
 * Key = current state, value = array of states the workflow is allowed to move to.
 */
export const VALID_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  [WorkflowState.TRIGGERED]: [
    WorkflowState.INTERVIEWING,
    WorkflowState.RESEARCHING,
    WorkflowState.FAILED,
  ],
  [WorkflowState.INTERVIEWING]: [
    WorkflowState.RESEARCHING,
    WorkflowState.PAUSED,
    WorkflowState.FAILED,
  ],
  [WorkflowState.RESEARCHING]: [
    WorkflowState.PLANNING,
    WorkflowState.PAUSED,
    WorkflowState.FAILED,
  ],
  [WorkflowState.PLANNING]: [
    WorkflowState.EXECUTING,
    WorkflowState.PAUSED,
    WorkflowState.FAILED,
  ],
  [WorkflowState.EXECUTING]: [
    WorkflowState.REVIEWING,
    WorkflowState.PAUSED,
    WorkflowState.FAILED,
  ],
  [WorkflowState.REVIEWING]: [
    WorkflowState.EXECUTING,
    WorkflowState.DONE,
    WorkflowState.PAUSED,
    WorkflowState.FAILED,
  ],
  [WorkflowState.DONE]: [],
  [WorkflowState.PAUSED]: [
    WorkflowState.INTERVIEWING,
    WorkflowState.RESEARCHING,
    WorkflowState.PLANNING,
    WorkflowState.EXECUTING,
    WorkflowState.REVIEWING,
    WorkflowState.FAILED,
  ],
  [WorkflowState.FAILED]: [],
};
