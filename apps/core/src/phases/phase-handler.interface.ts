import { WorkflowRun } from '../workflow/entities/workflow.entity';

export interface PhaseEvent {
  type: string;
  payload: Record<string, unknown>;
  source: string;
  timestamp: Date;
}

export interface PhaseStatus {
  phase: string;
  progress: number;
  details: Record<string, unknown>;
}

export interface PhaseHandler {
  start(workflowRun: WorkflowRun): Promise<void>;
  handleEvent(workflowRun: WorkflowRun, event: PhaseEvent): Promise<void>;
  getStatus(workflowRun: WorkflowRun): Promise<PhaseStatus>;
  complete(workflowRun: WorkflowRun): Promise<void>;
}

export const PHASE_HANDLER = Symbol('PHASE_HANDLER');
