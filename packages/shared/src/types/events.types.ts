/**
 * Event types for the Orchestra monorepo.
 *
 * Every significant action in the system produces an event that flows through
 * the event bus. These types define the event catalogue and their payloads.
 */

/** Exhaustive enumeration of all event types in the Orchestra system. */
export enum EventType {
  // -- PM adapter events --------------------------------------------------
  /** A label was added to a ticket. */
  TICKET_LABELED = 'ticket.labeled',
  /** A ticket's fields were updated. */
  TICKET_UPDATED = 'ticket.updated',
  /** A new comment was posted on a ticket. */
  TICKET_COMMENTED = 'ticket.commented',

  // -- Code host adapter events -------------------------------------------
  /** A pull request was created. */
  PR_CREATED = 'pr.created',
  /** A comment was added to a pull request. */
  PR_COMMENTED = 'pr.commented',
  /** A review was submitted on a pull request. */
  PR_REVIEWED = 'pr.reviewed',
  /** A pull request was merged. */
  PR_MERGED = 'pr.merged',

  // -- Channel adapter events ---------------------------------------------
  /** A message was received in a monitored channel. */
  MESSAGE_RECEIVED = 'message.received',

  // -- Internal workflow events -------------------------------------------
  /** A workflow phase started executing. */
  PHASE_STARTED = 'phase.started',
  /** A workflow phase completed successfully. */
  PHASE_COMPLETED = 'phase.completed',
  /** A workflow phase failed. */
  PHASE_FAILED = 'phase.failed',

  /** A task was added to the execution queue. */
  TASK_QUEUED = 'task.queued',
  /** A coding agent started working on a task. */
  TASK_STARTED = 'task.started',
  /** A task was completed successfully. */
  TASK_COMPLETED = 'task.completed',
  /** A task failed after exhausting retries. */
  TASK_FAILED = 'task.failed',

  /** A quality gate passed. */
  GATE_PASSED = 'gate.passed',
  /** A quality gate failed. */
  GATE_FAILED = 'gate.failed',

  /** A workflow run completed successfully. */
  WORKFLOW_COMPLETED = 'workflow.completed',
  /** A workflow run failed. */
  WORKFLOW_FAILED = 'workflow.failed',

  /** A merge conflict was detected between concurrent tasks. */
  CONFLICT_DETECTED = 'conflict.detected',
}

// ---------------------------------------------------------------------------
// Base event
// ---------------------------------------------------------------------------

/**
 * Base interface for every event that flows through Orchestra's event bus.
 *
 * All specific event payloads extend this via the discriminated `type` field.
 */
export interface OrchestraEvent<T = Record<string, unknown>> {
  /** Globally unique event identifier. */
  id: string;
  /** Discriminator — one of {@link EventType}. */
  type: EventType;
  /** ID of the workflow run this event is associated with, if any. */
  workflowRunId?: string;
  /** ISO-8601 timestamp of when the event was produced. */
  timestamp: string;
  /** Identifier of the adapter or handler that produced this event. */
  source: string;
  /** Event-specific data. */
  payload: T;
}

// ---------------------------------------------------------------------------
// PM event payloads
// ---------------------------------------------------------------------------

/** Payload for {@link EventType.TICKET_LABELED}. */
export interface TicketLabeledPayload {
  /** ID of the ticket. */
  ticketId: string;
  /** Key of the ticket (e.g. "ENG-123"). */
  ticketKey: string;
  /** The label that was added. */
  labelName: string;
  /** ID of the label. */
  labelId: string;
  /** User who added the label. */
  actorId: string;
}

/** Payload for {@link EventType.TICKET_UPDATED}. */
export interface TicketUpdatedPayload {
  /** ID of the ticket. */
  ticketId: string;
  /** Key of the ticket. */
  ticketKey: string;
  /** Map of field name to `{ from, to }` change descriptions. */
  changes: Record<string, { from: unknown; to: unknown }>;
  /** User who made the update. */
  actorId: string;
}

/** Payload for {@link EventType.TICKET_COMMENTED}. */
export interface TicketCommentedPayload {
  /** ID of the ticket. */
  ticketId: string;
  /** Key of the ticket. */
  ticketKey: string;
  /** ID of the newly created comment. */
  commentId: string;
  /** Body of the comment (Markdown). */
  commentBody: string;
  /** User who posted the comment. */
  actorId: string;
}

// ---------------------------------------------------------------------------
// Code host event payloads
// ---------------------------------------------------------------------------

/** Payload for {@link EventType.PR_CREATED}. */
export interface PRCreatedPayload {
  /** ID of the pull request. */
  pullRequestId: string;
  /** PR number. */
  pullRequestNumber: number;
  /** PR title. */
  title: string;
  /** Source (head) branch. */
  sourceBranch: string;
  /** Target (base) branch. */
  targetBranch: string;
  /** Author user ID. */
  authorId: string;
  /** Full URL to the PR. */
  url: string;
}

/** Payload for {@link EventType.PR_COMMENTED}. */
export interface PRCommentedPayload {
  /** ID of the pull request. */
  pullRequestId: string;
  /** PR number. */
  pullRequestNumber: number;
  /** ID of the comment. */
  commentId: string;
  /** Comment body (Markdown). */
  body: string;
  /** User who posted the comment. */
  actorId: string;
}

/** Payload for {@link EventType.PR_REVIEWED}. */
export interface PRReviewedPayload {
  /** ID of the pull request. */
  pullRequestId: string;
  /** PR number. */
  pullRequestNumber: number;
  /** Review verdict. */
  verdict: 'approved' | 'changes_requested' | 'commented';
  /** Reviewer user ID. */
  reviewerId: string;
  /** Optional review body. */
  body?: string;
}

/** Payload for {@link EventType.PR_MERGED}. */
export interface PRMergedPayload {
  /** ID of the pull request. */
  pullRequestId: string;
  /** PR number. */
  pullRequestNumber: number;
  /** The branch that was merged. */
  sourceBranch: string;
  /** The branch merged into. */
  targetBranch: string;
  /** Merge commit SHA. */
  mergeCommitSha: string;
  /** User who performed the merge. */
  actorId: string;
}

// ---------------------------------------------------------------------------
// Channel event payloads
// ---------------------------------------------------------------------------

/** Payload for {@link EventType.MESSAGE_RECEIVED}. */
export interface MessageReceivedPayload {
  /** ID of the channel. */
  channelId: string;
  /** ID of the message. */
  messageId: string;
  /** Message content. */
  content: string;
  /** Author user ID. */
  authorId: string;
  /** Author display name. */
  authorName: string;
  /** Thread ID, if the message is part of a thread. */
  threadId?: string;
}

// ---------------------------------------------------------------------------
// Internal workflow event payloads
// ---------------------------------------------------------------------------

/** Payload for {@link EventType.PHASE_STARTED}. */
export interface PhaseStartedPayload {
  /** Name of the phase. */
  phaseName: string;
  /** ID of the workflow run. */
  workflowRunId: string;
}

/** Payload for {@link EventType.PHASE_COMPLETED}. */
export interface PhaseCompletedPayload {
  /** Name of the phase. */
  phaseName: string;
  /** ID of the workflow run. */
  workflowRunId: string;
  /** Artifacts produced by the phase. */
  artifacts: Record<string, string>;
}

/** Payload for {@link EventType.PHASE_FAILED}. */
export interface PhaseFailedPayload {
  /** Name of the phase. */
  phaseName: string;
  /** ID of the workflow run. */
  workflowRunId: string;
  /** Error message describing the failure. */
  error: string;
}

/** Payload for {@link EventType.TASK_QUEUED}. */
export interface TaskQueuedPayload {
  /** ID of the task. */
  taskId: string;
  /** Title of the task. */
  title: string;
  /** ID of the workflow run. */
  workflowRunId: string;
  /** Execution group order. */
  executionGroupOrder: number;
}

/** Payload for {@link EventType.TASK_STARTED}. */
export interface TaskStartedPayload {
  /** ID of the task. */
  taskId: string;
  /** ID of the agent instance handling the task. */
  agentInstanceId: string;
  /** ID of the workflow run. */
  workflowRunId: string;
}

/** Payload for {@link EventType.TASK_COMPLETED}. */
export interface TaskCompletedPayload {
  /** ID of the task. */
  taskId: string;
  /** Summary of what was accomplished. */
  summary: string;
  /** Files changed by the agent. */
  filesChanged: string[];
  /** Branch containing the work. */
  branch: string;
  /** PR URL, if one was created. */
  prUrl?: string;
  /** ID of the workflow run. */
  workflowRunId: string;
}

/** Payload for {@link EventType.TASK_FAILED}. */
export interface TaskFailedPayload {
  /** ID of the task. */
  taskId: string;
  /** Error message. */
  error: string;
  /** ID of the workflow run. */
  workflowRunId: string;
}

/** Payload for {@link EventType.GATE_PASSED}. */
export interface GatePassedPayload {
  /** ID of the task the gate belongs to. */
  taskId: string;
  /** Name of the gate. */
  gateName: string;
  /** Number of attempts it took. */
  attempts: number;
  /** ID of the workflow run. */
  workflowRunId: string;
}

/** Payload for {@link EventType.GATE_FAILED}. */
export interface GateFailedPayload {
  /** ID of the task the gate belongs to. */
  taskId: string;
  /** Name of the gate. */
  gateName: string;
  /** Error output. */
  error: string;
  /** Total attempts made. */
  attempts: number;
  /** ID of the workflow run. */
  workflowRunId: string;
}

/** Payload for {@link EventType.WORKFLOW_COMPLETED}. */
export interface WorkflowCompletedPayload {
  /** ID of the workflow run. */
  workflowRunId: string;
  /** Total number of tasks that were executed. */
  totalTasks: number;
  /** Number of tasks that passed. */
  passedTasks: number;
  /** Total wall-clock duration in milliseconds. */
  durationMs: number;
}

/** Payload for {@link EventType.WORKFLOW_FAILED}. */
export interface WorkflowFailedPayload {
  /** ID of the workflow run. */
  workflowRunId: string;
  /** The phase in which the failure occurred. */
  failedPhase: string;
  /** Error message. */
  error: string;
}

/** Payload for {@link EventType.CONFLICT_DETECTED}. */
export interface ConflictDetectedPayload {
  /** ID of the workflow run. */
  workflowRunId: string;
  /** IDs of the tasks whose branches conflict. */
  conflictingTaskIds: string[];
  /** Files that have conflicts. */
  conflictingFiles: string[];
  /** Branch names involved. */
  branches: string[];
}

// ---------------------------------------------------------------------------
// Union of all typed events (discriminated union on `type`)
// ---------------------------------------------------------------------------

/** Discriminated union of every typed Orchestra event. */
export type TypedOrchestraEvent =
  | OrchestraEvent<TicketLabeledPayload> & { type: EventType.TICKET_LABELED }
  | OrchestraEvent<TicketUpdatedPayload> & { type: EventType.TICKET_UPDATED }
  | OrchestraEvent<TicketCommentedPayload> & { type: EventType.TICKET_COMMENTED }
  | OrchestraEvent<PRCreatedPayload> & { type: EventType.PR_CREATED }
  | OrchestraEvent<PRCommentedPayload> & { type: EventType.PR_COMMENTED }
  | OrchestraEvent<PRReviewedPayload> & { type: EventType.PR_REVIEWED }
  | OrchestraEvent<PRMergedPayload> & { type: EventType.PR_MERGED }
  | OrchestraEvent<MessageReceivedPayload> & { type: EventType.MESSAGE_RECEIVED }
  | OrchestraEvent<PhaseStartedPayload> & { type: EventType.PHASE_STARTED }
  | OrchestraEvent<PhaseCompletedPayload> & { type: EventType.PHASE_COMPLETED }
  | OrchestraEvent<PhaseFailedPayload> & { type: EventType.PHASE_FAILED }
  | OrchestraEvent<TaskQueuedPayload> & { type: EventType.TASK_QUEUED }
  | OrchestraEvent<TaskStartedPayload> & { type: EventType.TASK_STARTED }
  | OrchestraEvent<TaskCompletedPayload> & { type: EventType.TASK_COMPLETED }
  | OrchestraEvent<TaskFailedPayload> & { type: EventType.TASK_FAILED }
  | OrchestraEvent<GatePassedPayload> & { type: EventType.GATE_PASSED }
  | OrchestraEvent<GateFailedPayload> & { type: EventType.GATE_FAILED }
  | OrchestraEvent<WorkflowCompletedPayload> & { type: EventType.WORKFLOW_COMPLETED }
  | OrchestraEvent<WorkflowFailedPayload> & { type: EventType.WORKFLOW_FAILED }
  | OrchestraEvent<ConflictDetectedPayload> & { type: EventType.CONFLICT_DETECTED };
