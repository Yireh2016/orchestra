export enum WorkflowState {
  TRIGGERED = 'TRIGGERED',
  INTERVIEWING = 'INTERVIEWING',
  RESEARCHING = 'RESEARCHING',
  PLANNING = 'PLANNING',
  EXECUTING = 'EXECUTING',
  REVIEWING = 'REVIEWING',
  DONE = 'DONE',
  PAUSED = 'PAUSED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface WorkflowRun {
  id: string;
  templateId: string;
  templateVersion: number;
  ticketId: string;
  state: WorkflowState;
  phaseData: Record<string, unknown>;
  projectId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Valid forward transitions in the workflow state machine.
 * PAUSED, FAILED, and CANCELLED can be reached from any active state.
 */
export const VALID_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  [WorkflowState.TRIGGERED]: [
    WorkflowState.INTERVIEWING,
    WorkflowState.RESEARCHING,
    WorkflowState.PLANNING,
    WorkflowState.EXECUTING,
    WorkflowState.REVIEWING,
    WorkflowState.PAUSED,
    WorkflowState.FAILED,
    WorkflowState.CANCELLED,
  ],
  [WorkflowState.INTERVIEWING]: [
    WorkflowState.RESEARCHING,
    WorkflowState.PAUSED,
    WorkflowState.FAILED,
    WorkflowState.CANCELLED,
  ],
  [WorkflowState.RESEARCHING]: [
    WorkflowState.PLANNING,
    WorkflowState.PAUSED,
    WorkflowState.FAILED,
    WorkflowState.CANCELLED,
  ],
  [WorkflowState.PLANNING]: [
    WorkflowState.EXECUTING,
    WorkflowState.PAUSED,
    WorkflowState.FAILED,
    WorkflowState.CANCELLED,
  ],
  [WorkflowState.EXECUTING]: [
    WorkflowState.REVIEWING,
    WorkflowState.PAUSED,
    WorkflowState.FAILED,
    WorkflowState.CANCELLED,
  ],
  [WorkflowState.REVIEWING]: [
    WorkflowState.DONE,
    WorkflowState.EXECUTING,
    WorkflowState.PAUSED,
    WorkflowState.FAILED,
    WorkflowState.CANCELLED,
  ],
  [WorkflowState.DONE]: [
    WorkflowState.TRIGGERED,
  ],
  [WorkflowState.PAUSED]: [
    WorkflowState.TRIGGERED,
    WorkflowState.INTERVIEWING,
    WorkflowState.RESEARCHING,
    WorkflowState.PLANNING,
    WorkflowState.EXECUTING,
    WorkflowState.REVIEWING,
    WorkflowState.CANCELLED,
  ],
  [WorkflowState.FAILED]: [
    WorkflowState.TRIGGERED,
  ],
  [WorkflowState.CANCELLED]: [
    WorkflowState.TRIGGERED,
  ],
};
