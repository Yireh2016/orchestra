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
}

export interface WorkflowRun {
  id: string;
  templateId: string;
  templateVersion: number;
  ticketId: string;
  state: WorkflowState;
  phaseData: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Valid forward transitions in the workflow state machine.
 * PAUSED and FAILED can be reached from any active state.
 */
export const VALID_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  [WorkflowState.TRIGGERED]: [
    WorkflowState.INTERVIEWING,
    WorkflowState.PAUSED,
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
    WorkflowState.DONE,
    WorkflowState.EXECUTING,
    WorkflowState.PAUSED,
    WorkflowState.FAILED,
  ],
  [WorkflowState.DONE]: [],
  [WorkflowState.PAUSED]: [
    WorkflowState.TRIGGERED,
    WorkflowState.INTERVIEWING,
    WorkflowState.RESEARCHING,
    WorkflowState.PLANNING,
    WorkflowState.EXECUTING,
    WorkflowState.REVIEWING,
  ],
  [WorkflowState.FAILED]: [],
};
