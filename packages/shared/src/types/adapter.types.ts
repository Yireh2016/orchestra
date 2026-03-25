/**
 * Adapter interface types for the Orchestra monorepo.
 *
 * These types define the data structures exchanged between Orchestra's core
 * and the various external-system adapters (PM tools, code hosts, chat
 * channels, and coding agents).
 */

// ---------------------------------------------------------------------------
// PM Adapter types
// ---------------------------------------------------------------------------

/** A project-management ticket (e.g. Linear issue, Jira ticket). */
export interface Ticket {
  /** Unique identifier within the PM system. */
  id: string;
  /** Short human-readable key (e.g. "ENG-1234"). */
  key: string;
  /** Ticket title / summary. */
  title: string;
  /** Full description body (Markdown). */
  description: string;
  /** Current status of the ticket. */
  status: Status;
  /** Labels attached to the ticket. */
  labels: Label[];
  /** User ID of the assignee, if any. */
  assigneeId?: string;
  /** User ID of the reporter / creator. */
  reporterId?: string;
  /** Priority level (lower number = higher priority). */
  priority?: number;
  /** IDs of parent tickets. */
  parentIds: string[];
  /** IDs of child / sub-tickets. */
  childIds: string[];
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-updated timestamp. */
  updatedAt: string;
}

/** A comment on a PM ticket. */
export interface Comment {
  /** Unique identifier. */
  id: string;
  /** ID of the ticket this comment belongs to. */
  ticketId: string;
  /** User ID of the author. */
  authorId: string;
  /** Display name of the author. */
  authorName: string;
  /** Comment body (Markdown). */
  body: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-updated timestamp. */
  updatedAt: string;
}

/** A label / tag that can be attached to tickets. */
export interface Label {
  /** Unique identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Optional hex colour code (e.g. "#ff0000"). */
  color?: string;
}

/** A ticket status within the PM system. */
export interface Status {
  /** Unique identifier. */
  id: string;
  /** Display name (e.g. "In Progress", "Done"). */
  name: string;
  /** Broad category the status belongs to. */
  category: 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
}

// ---------------------------------------------------------------------------
// Code Host Adapter types
// ---------------------------------------------------------------------------

/** A pull / merge request on a code host (GitHub, GitLab, etc.). */
export interface PullRequest {
  /** Unique identifier within the code host. */
  id: string;
  /** Numeric PR number. */
  number: number;
  /** PR title. */
  title: string;
  /** PR description body (Markdown). */
  body: string;
  /** Current state of the PR. */
  state: 'open' | 'closed' | 'merged';
  /** Name of the source (head) branch. */
  sourceBranch: string;
  /** Name of the target (base) branch. */
  targetBranch: string;
  /** User ID of the PR author. */
  authorId: string;
  /** User IDs of requested reviewers. */
  reviewerIds: string[];
  /** Whether the PR is marked as a draft. */
  isDraft: boolean;
  /** Full URL to the PR on the code host. */
  url: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-updated timestamp. */
  updatedAt: string;
}

/** A review comment on a pull request. */
export interface PRComment {
  /** Unique identifier. */
  id: string;
  /** ID of the pull request this comment belongs to. */
  pullRequestId: string;
  /** User ID of the author. */
  authorId: string;
  /** Display name of the author. */
  authorName: string;
  /** Comment body (Markdown). */
  body: string;
  /** File path the comment is attached to (for inline comments). */
  filePath?: string;
  /** Line number the comment is attached to (for inline comments). */
  line?: number;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/** A git branch on the code host. */
export interface Branch {
  /** Branch name. */
  name: string;
  /** SHA of the branch tip. */
  sha: string;
  /** Whether this is the repository's default branch. */
  isDefault: boolean;
  /** Whether the branch is protected. */
  isProtected: boolean;
}

// ---------------------------------------------------------------------------
// Channel Adapter types (Slack, Discord, etc.)
// ---------------------------------------------------------------------------

/** A chat message in a channel. */
export interface Message {
  /** Unique message identifier. */
  id: MessageId;
  /** ID of the channel the message was posted in. */
  channelId: string;
  /** The user who sent the message. */
  author: User;
  /** Plain-text message content. */
  content: string;
  /** ID of the thread this message belongs to, if threaded. */
  threadId?: string;
  /** ISO-8601 timestamp. */
  timestamp: string;
}

/** Opaque identifier for a chat message. */
export type MessageId = string;

/** A chat channel (Slack channel, Discord channel, etc.). */
export interface Channel {
  /** Unique identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Whether this is a direct-message channel. */
  isDirectMessage: boolean;
  /** IDs of members in this channel. */
  memberIds: string[];
}

/** A chat-platform user. */
export interface User {
  /** Unique identifier. */
  id: string;
  /** Display name. */
  displayName: string;
  /** Email address, if available. */
  email?: string;
  /** URL to the user's avatar image. */
  avatarUrl?: string;
}

// ---------------------------------------------------------------------------
// Coding Agent Adapter types
// ---------------------------------------------------------------------------

/** Configuration used to spawn a coding-agent instance. */
export interface AgentConfig {
  /** Which agent provider to use (e.g. "claude-code", "codex"). */
  provider: string;
  /** Model identifier to pass to the provider. */
  model: string;
  /** Repository URL the agent will operate on. */
  repoUrl: string;
  /** Base branch to create feature branches from. */
  baseBranch: string;
  /** Maximum wall-clock time the agent may run, in milliseconds. */
  timeoutMs: number;
  /** Arbitrary provider-specific settings. */
  extras: Record<string, unknown>;
}

/** A running (or terminated) coding-agent instance. */
export interface AgentInstance {
  /** Unique instance identifier. */
  id: string;
  /** The configuration used to create this instance. */
  config: AgentConfig;
  /** Current status. */
  status: AgentStatus;
  /** ID of the task this agent is working on, if any. */
  taskId?: string;
  /** ISO-8601 timestamp when the instance was created. */
  createdAt: string;
  /** ISO-8601 timestamp of the last status change. */
  updatedAt: string;
}

/** Lifecycle status of a coding-agent instance. */
export enum AgentStatus {
  /** The agent is being provisioned. */
  INITIALIZING = 'initializing',
  /** The agent is idle and ready to accept a task. */
  IDLE = 'idle',
  /** The agent is actively working on a task. */
  RUNNING = 'running',
  /** The agent completed its task and shut down cleanly. */
  COMPLETED = 'completed',
  /** The agent encountered a fatal error. */
  ERRORED = 'errored',
  /** The agent was explicitly terminated. */
  TERMINATED = 'terminated',
}

/** A task definition sent to a coding agent. */
export interface TaskDefinition {
  /** Unique task identifier. */
  id: string;
  /** Human-readable title. */
  title: string;
  /** Detailed instructions for the agent (Markdown). */
  instructions: string;
  /** Git branch the agent should work on. */
  branch: string;
  /** Relevant file paths the agent should focus on. */
  relevantFiles: string[];
  /** Acceptance criteria the result must satisfy. */
  acceptanceCriteria: string[];
  /** Maximum wall-clock time for this task, in milliseconds. */
  timeoutMs: number;
}

/** The result produced by a coding agent after completing (or failing) a task. */
export interface TaskResult {
  /** ID of the task this result corresponds to. */
  taskId: string;
  /** Whether the agent considers the task successful. */
  success: boolean;
  /** Human-readable summary of what was done. */
  summary: string;
  /** Files that were modified. */
  filesChanged: string[];
  /** The branch containing the agent's commits. */
  branch: string;
  /** Error message if the task failed. */
  error?: string;
  /** ISO-8601 timestamp of completion. */
  completedAt: string;
}

/** Result of running a shell command inside an agent's environment. */
export interface CommandResult {
  /** The command that was executed. */
  command: string;
  /** Process exit code. */
  exitCode: number;
  /** Combined stdout content. */
  stdout: string;
  /** Combined stderr content. */
  stderr: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

/** A chunk of streaming output from a coding agent. */
export interface OutputChunk {
  /** ID of the agent instance producing this output. */
  agentInstanceId: string;
  /** The kind of output. */
  type: 'stdout' | 'stderr' | 'status' | 'artifact';
  /** The raw content of this chunk. */
  content: string;
  /** ISO-8601 timestamp. */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Common / cross-cutting types
// ---------------------------------------------------------------------------

/**
 * A subscription handle returned by event-subscription methods.
 * Call {@link Subscription.unsubscribe} to stop receiving events.
 */
export interface Subscription {
  /** Stops the subscription and frees associated resources. */
  unsubscribe(): void;
}

// ---------------------------------------------------------------------------
// DTO types (Data Transfer Objects for create / update operations)
// ---------------------------------------------------------------------------

/** Payload for creating a new PM ticket. */
export interface CreateTicketDto {
  /** Ticket title. */
  title: string;
  /** Ticket description (Markdown). */
  description: string;
  /** ID of the status to set. */
  statusId?: string;
  /** Label IDs to attach. */
  labelIds?: string[];
  /** User ID to assign the ticket to. */
  assigneeId?: string;
  /** Priority level. */
  priority?: number;
  /** ID of the parent ticket, if this is a sub-task. */
  parentId?: string;
}

/** Payload for updating an existing PM ticket. */
export interface UpdateTicketDto {
  /** New title (omit to keep current). */
  title?: string;
  /** New description (omit to keep current). */
  description?: string;
  /** New status ID (omit to keep current). */
  statusId?: string;
  /** Label IDs to set (replaces all existing labels). */
  labelIds?: string[];
  /** New assignee user ID (omit to keep current, set to null to unassign). */
  assigneeId?: string | null;
  /** New priority (omit to keep current). */
  priority?: number;
}

/** Payload for creating a new pull request. */
export interface CreatePRDto {
  /** PR title. */
  title: string;
  /** PR description body (Markdown). */
  body: string;
  /** Source (head) branch name. */
  sourceBranch: string;
  /** Target (base) branch name. */
  targetBranch: string;
  /** Whether to create the PR as a draft. */
  isDraft?: boolean;
  /** User IDs to request reviews from. */
  reviewerIds?: string[];
}
