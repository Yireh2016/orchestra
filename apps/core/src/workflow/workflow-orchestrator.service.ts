import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import { WorkflowService } from './workflow.service';
import { TemplateService } from './template.service';
import { WorkflowState } from './entities/workflow.entity';
import {
  PhaseHandler,
  PhaseEvent,
} from '../phases/phase-handler.interface';
import { InterviewHandler } from '../phases/interview/interview.handler';
import { ResearchHandler } from '../phases/research/research.handler';
import { PlanningHandler } from '../phases/planning/planning.handler';
import { ExecutionHandler } from '../phases/execution/execution.handler';
import { ReviewHandler } from '../phases/review/review.handler';
import { TaskQueueService } from '../agent-runtime/task-queue.service';
import { ContainerService } from '../agent-runtime/container.service';
import { EventBusService } from '../events/event-bus.service';

/**
 * Shape of a phase definition as stored in the template's `phases` JSON column.
 * Matches the shared PhaseDefinition from packages/shared/src/types/template.types.ts.
 */
interface PhaseDefinition {
  name: string;
  handler: string;
  config: Record<string, unknown>;
  gate: unknown;
  skipConditions?: SkipCondition[];
  timeout?: number;
}

interface SkipCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'matches';
  value: string;
}

/**
 * The central orchestrator that drives workflow execution through its phases.
 *
 * It resolves which phase handler to invoke, evaluates skip conditions,
 * transitions workflow state, and logs audit entries for every significant action.
 */
@Injectable()
export class WorkflowOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowOrchestratorService.name);
  private phaseHandlers: Map<string, PhaseHandler> = new Map();

  constructor(
    private readonly workflowService: WorkflowService,
    private readonly templateService: TemplateService,
    private readonly prisma: PrismaService,
    private readonly interviewHandler: InterviewHandler,
    private readonly researchHandler: ResearchHandler,
    private readonly planningHandler: PlanningHandler,
    private readonly executionHandler: ExecutionHandler,
    private readonly reviewHandler: ReviewHandler,
    private readonly taskQueue: TaskQueueService,
    private readonly containerService: ContainerService,
    private readonly eventBus: EventBusService,
  ) {}

  onModuleInit() {
    this.phaseHandlers = new Map<string, PhaseHandler>([
      ['interview', this.interviewHandler],
      ['research', this.researchHandler],
      ['planning', this.planningHandler],
      ['execution', this.executionHandler],
      ['review', this.reviewHandler],
    ]);
    this.logger.log(
      `Registered ${this.phaseHandlers.size} phase handlers: ${[...this.phaseHandlers.keys()].join(', ')}`,
    );

    // Wire up the task completion callback so agent-runtime results flow back
    // into the orchestrator's phase logic.
    this.taskQueue.setOnTaskCompleted(async (data) => {
      await this.handleTaskCompleted(data.workflowRunId, data.taskId);
    });
    this.logger.log('Task completion callback registered with TaskQueueService');
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Called when a new workflow run is created — finds and starts the first
   * applicable phase (skipping any whose skip-conditions are met).
   */
  async startWorkflow(workflowRunId: string): Promise<void> {
    const run = await this.prisma.workflowRun.findUniqueOrThrow({
      where: { id: workflowRunId },
    });
    const template = await this.prisma.workflowTemplate.findUniqueOrThrow({
      where: { id: run.templateId },
    });

    const phases = template.phases as unknown as PhaseDefinition[];
    const firstPhase = this.findNextPhase(phases, null, run);

    this.eventBus.emit({
      type: 'workflow.started',
      workflowRunId,
      payload: {},
    });

    if (firstPhase) {
      await this.transitionToPhase(workflowRunId, firstPhase);
    } else {
      // No applicable phases — mark the workflow as done immediately
      await this.workflowService.transitionState(
        workflowRunId,
        WorkflowState.DONE,
      );
      await this.logAudit(workflowRunId, 'workflow.completed', 'orchestrator');
      this.eventBus.emit({
        type: 'workflow.completed',
        workflowRunId,
        payload: {},
      });
    }
  }

  /**
   * Called when an external event arrives (webhook, message, etc.).
   * Delegates to the handler that owns the workflow's current phase.
   */
  async handleEvent(
    workflowRunId: string,
    event: PhaseEvent,
  ): Promise<void> {
    const run = await this.prisma.workflowRun.findUniqueOrThrow({
      where: { id: workflowRunId },
    });
    const handler = this.getHandlerForState(run.state as string);
    if (handler) {
      try {
        await handler.handleEvent(run as any, event);
      } catch (err) {
        this.logger.warn(`Failed to handle event "${event.type}" in state "${run.state}" for workflow ${workflowRunId}: ${(err as Error).message}`);
      }
    } else {
      this.logger.warn(
        `No handler for state "${run.state}" on workflow run ${workflowRunId}`,
      );
    }
  }

  /**
   * Called when the current phase completes — persists phase completion data,
   * then transitions to the next phase or marks the workflow as done.
   */
  async completeCurrentPhase(workflowRunId: string): Promise<void> {
    const run = await this.prisma.workflowRun.findUniqueOrThrow({
      where: { id: workflowRunId },
    });
    const template = await this.prisma.workflowTemplate.findUniqueOrThrow({
      where: { id: run.templateId },
    });
    const phases = template.phases as unknown as PhaseDefinition[];

    // Let the current handler perform any cleanup
    const currentHandler = this.getHandlerForState(run.state as string);
    if (currentHandler) {
      await currentHandler.complete(run as any);
    }

    // Mark the current phase as completed in phaseData
    const currentPhaseName = this.stateToPhaseHandler(run.state as string);
    const phaseData = (run.phaseData as Record<string, any>) || {};
    phaseData[currentPhaseName!] = {
      ...phaseData[currentPhaseName!],
      status: 'completed',
      completedAt: new Date().toISOString(),
    };
    await this.prisma.workflowRun.update({
      where: { id: workflowRunId },
      data: { phaseData },
    });

    await this.logAudit(
      workflowRunId,
      `phase.completed.${currentPhaseName}`,
      'orchestrator',
    );

    this.eventBus.emit({
      type: 'phase.completed',
      workflowRunId,
      payload: { phase: currentPhaseName },
    });

    // Find and transition to the next phase
    const nextPhase = this.findNextPhase(phases, currentPhaseName, run);
    if (nextPhase) {
      await this.transitionToPhase(workflowRunId, nextPhase);
    } else {
      // All phases complete
      await this.workflowService.transitionState(
        workflowRunId,
        WorkflowState.DONE,
      );
      await this.logAudit(workflowRunId, 'workflow.completed', 'orchestrator');
      this.eventBus.emit({
        type: 'workflow.completed',
        workflowRunId,
        payload: {},
      });
    }
  }

  /**
   * Convenience method — called when a task in the execution phase completes.
   * Wraps the event and delegates to {@link handleEvent}.
   */
  async handleTaskCompleted(
    workflowRunId: string,
    taskId: string,
  ): Promise<void> {
    this.eventBus.emit({
      type: 'task.completed',
      workflowRunId,
      taskId,
      payload: {},
    });

    await this.handleEvent(workflowRunId, {
      type: 'task_completed',
      source: 'agent-runtime',
      payload: { taskId },
      timestamp: new Date(),
    });
  }

  /**
   * Pause a running workflow. Records the state the workflow was in before
   * pausing so it can be resumed to the same phase later.
   */
  async pauseWorkflow(
    workflowRunId: string,
    reason: string,
  ): Promise<void> {
    const run = await this.prisma.workflowRun.findUniqueOrThrow({
      where: { id: workflowRunId },
    });

    const phaseData = (run.phaseData as Record<string, any>) || {};
    phaseData._pausedFromState = run.state;
    phaseData._pauseReason = reason;
    phaseData._pausedAt = new Date().toISOString();

    await this.prisma.workflowRun.update({
      where: { id: workflowRunId },
      data: { phaseData },
    });

    await this.workflowService.transitionState(
      workflowRunId,
      WorkflowState.PAUSED,
    );
    await this.logAudit(workflowRunId, 'workflow.paused', 'orchestrator');
    this.eventBus.emit({
      type: 'workflow.paused',
      workflowRunId,
      payload: { reason },
    });
    this.logger.log(
      `Workflow ${workflowRunId} paused from state ${run.state}: ${reason}`,
    );
  }

  /**
   * Resume a previously paused workflow. Restores the state the workflow
   * was in before it was paused.
   */
  async resumeWorkflow(workflowRunId: string): Promise<void> {
    const run = await this.prisma.workflowRun.findUniqueOrThrow({
      where: { id: workflowRunId },
    });

    const phaseData = (run.phaseData as Record<string, any>) || {};
    const resumeState = phaseData._pausedFromState as string | undefined;

    if (!resumeState) {
      this.logger.warn(
        `No _pausedFromState found for workflow ${workflowRunId}; cannot resume.`,
      );
      return;
    }

    // Clean up pause metadata
    delete phaseData._pausedFromState;
    delete phaseData._pauseReason;
    delete phaseData._pausedAt;

    await this.prisma.workflowRun.update({
      where: { id: workflowRunId },
      data: { phaseData },
    });

    await this.workflowService.transitionState(
      workflowRunId,
      resumeState as WorkflowState,
    );
    await this.logAudit(workflowRunId, 'workflow.resumed', 'orchestrator');
    this.eventBus.emit({
      type: 'workflow.resumed',
      workflowRunId,
      payload: {},
    });
    this.logger.log(
      `Workflow ${workflowRunId} resumed to state ${resumeState}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Map a WorkflowState enum value to its corresponding phase handler name. */
  private stateToPhaseHandler(state: string): string | null {
    const map: Record<string, string> = {
      INTERVIEWING: 'interview',
      RESEARCHING: 'research',
      PLANNING: 'planning',
      EXECUTING: 'execution',
      REVIEWING: 'review',
    };
    return map[state] || null;
  }

  /** Map a phase handler name to its corresponding WorkflowState. */
  private phaseHandlerToState(handler: string): WorkflowState {
    const map: Record<string, WorkflowState> = {
      interview: WorkflowState.INTERVIEWING,
      research: WorkflowState.RESEARCHING,
      planning: WorkflowState.PLANNING,
      execution: WorkflowState.EXECUTING,
      review: WorkflowState.REVIEWING,
    };
    return map[handler] || WorkflowState.TRIGGERED;
  }

  /** Resolve the PhaseHandler instance for the given workflow state. */
  private getHandlerForState(state: string): PhaseHandler | null {
    const name = this.stateToPhaseHandler(state);
    return name ? this.phaseHandlers.get(name) || null : null;
  }

  /**
   * Walk the template's phase list starting after `currentHandler` and
   * return the first phase whose skip-conditions are not met.
   */
  private findNextPhase(
    phases: PhaseDefinition[],
    currentHandler: string | null,
    run: any,
  ): PhaseDefinition | null {
    const currentIdx = currentHandler
      ? phases.findIndex((p) => p.handler === currentHandler)
      : -1;

    for (let i = currentIdx + 1; i < phases.length; i++) {
      if (!this.shouldSkipPhase(phases[i], run)) {
        return phases[i];
      }
    }
    return null;
  }

  /** Evaluate skip conditions for a single phase against the workflow run. */
  private shouldSkipPhase(phase: PhaseDefinition, run: any): boolean {
    if (!phase.skipConditions || phase.skipConditions.length === 0) {
      return false;
    }
    return phase.skipConditions.some((condition) => {
      const value = this.getNestedValue(run, condition.field);
      switch (condition.operator) {
        case 'equals':
          return value === condition.value;
        case 'not_equals':
          return value !== condition.value;
        case 'contains':
          return String(value).includes(condition.value);
        case 'matches':
          return new RegExp(condition.value).test(String(value));
        default:
          return false;
      }
    });
  }

  /**
   * Transition a workflow run into the given phase: update state, initialise
   * phase data, and invoke the handler's `start` method.
   */
  private async transitionToPhase(
    workflowRunId: string,
    phase: PhaseDefinition,
  ): Promise<void> {
    const targetState = this.phaseHandlerToState(phase.handler);
    await this.workflowService.transitionState(workflowRunId, targetState);

    // Initialise this phase's entry in phaseData
    const run = await this.prisma.workflowRun.findUniqueOrThrow({
      where: { id: workflowRunId },
    });
    const phaseData = (run.phaseData as Record<string, any>) || {};
    phaseData[phase.handler] = {
      name: phase.name,
      status: 'active',
      startedAt: new Date().toISOString(),
      artifacts: {},
      metadata: {},
    };
    await this.prisma.workflowRun.update({
      where: { id: workflowRunId },
      data: { phaseData },
    });

    // Kick off the phase handler
    const handler = this.phaseHandlers.get(phase.handler);
    if (handler) {
      try {
        await handler.start(run as any);
      } catch (err) {
        this.logger.warn(`Failed to start phase handler "${phase.handler}" for workflow ${workflowRunId}: ${(err as Error).message}`);
      }
    }

    await this.logAudit(
      workflowRunId,
      `phase.started.${phase.handler}`,
      'orchestrator',
    );
    this.eventBus.emit({
      type: 'phase.started',
      workflowRunId,
      payload: { phase: phase.name },
    });
    this.logger.log(
      `Workflow ${workflowRunId} transitioned to phase "${phase.handler}" (${targetState})`,
    );
  }

  /** Write an entry to the audit log. */
  private async logAudit(
    workflowRunId: string,
    action: string,
    actor: string,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        workflowRunId,
        action,
        actor,
        details: {},
      },
    });
  }

  /** Safely traverse a dot-separated path on an object. */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }
}
