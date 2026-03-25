import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowOrchestratorService } from './workflow-orchestrator.service';
import { WorkflowState } from './entities/workflow.entity';
import { createMockPrisma, MockPrisma } from '../test/mock-prisma';

function createMockHandler() {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    handleEvent: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({ phase: '', progress: 0, details: {} }),
    complete: vi.fn().mockResolvedValue(undefined),
  };
}

describe('WorkflowOrchestratorService', () => {
  let service: WorkflowOrchestratorService;
  let prisma: MockPrisma;
  let workflowService: { transitionState: ReturnType<typeof vi.fn>; findById: ReturnType<typeof vi.fn> };
  let templateService: { findById: ReturnType<typeof vi.fn> };
  let interviewHandler: ReturnType<typeof createMockHandler>;
  let researchHandler: ReturnType<typeof createMockHandler>;
  let planningHandler: ReturnType<typeof createMockHandler>;
  let executionHandler: ReturnType<typeof createMockHandler>;
  let reviewHandler: ReturnType<typeof createMockHandler>;
  let taskQueue: { setOnTaskCompleted: ReturnType<typeof vi.fn> };
  let eventBus: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = createMockPrisma();
    workflowService = {
      transitionState: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
    };
    templateService = { findById: vi.fn() };
    interviewHandler = createMockHandler();
    researchHandler = createMockHandler();
    planningHandler = createMockHandler();
    executionHandler = createMockHandler();
    reviewHandler = createMockHandler();
    taskQueue = { setOnTaskCompleted: vi.fn() };
    eventBus = { emit: vi.fn() };

    service = new WorkflowOrchestratorService(
      workflowService as any,
      templateService as any,
      prisma as any,
      interviewHandler as any,
      researchHandler as any,
      planningHandler as any,
      executionHandler as any,
      reviewHandler as any,
      taskQueue as any,
      {} as any, // containerService
      eventBus as any,
    );

    // Trigger onModuleInit to register phase handlers
    service.onModuleInit();
  });

  const makeRun = (state: WorkflowState, phaseData: Record<string, any> = {}) => ({
    id: 'run-1',
    templateId: 'tpl-1',
    templateVersion: 1,
    ticketId: 'ticket-1',
    state,
    phaseData,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const makeTemplate = (phases: any[]) => ({
    id: 'tpl-1',
    name: 'Test Template',
    phases,
  });

  describe('startWorkflow()', () => {
    it('should transition to first phase and call handler.start()', async () => {
      const run = makeRun(WorkflowState.TRIGGERED);
      const template = makeTemplate([
        { name: 'Interview', handler: 'interview', config: {}, gate: null },
      ]);

      prisma.workflowRun.findUniqueOrThrow.mockResolvedValue(run);
      prisma.workflowTemplate.findUniqueOrThrow.mockResolvedValue(template);
      prisma.workflowRun.update.mockResolvedValue(run);

      await service.startWorkflow('run-1');

      expect(workflowService.transitionState).toHaveBeenCalledWith(
        'run-1',
        WorkflowState.INTERVIEWING,
      );
      expect(interviewHandler.start).toHaveBeenCalled();
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'workflow.started' }),
      );
    });

    it('should skip phases with matching skip conditions', async () => {
      const run = makeRun(WorkflowState.TRIGGERED);
      (run as any).source = 'automated';

      const template = makeTemplate([
        {
          name: 'Interview',
          handler: 'interview',
          config: {},
          gate: null,
          skipConditions: [
            { field: 'source', operator: 'equals', value: 'automated' },
          ],
        },
        { name: 'Research', handler: 'research', config: {}, gate: null },
      ]);

      prisma.workflowRun.findUniqueOrThrow.mockResolvedValue(run);
      prisma.workflowTemplate.findUniqueOrThrow.mockResolvedValue(template);
      prisma.workflowRun.update.mockResolvedValue(run);

      await service.startWorkflow('run-1');

      expect(workflowService.transitionState).toHaveBeenCalledWith(
        'run-1',
        WorkflowState.RESEARCHING,
      );
      expect(interviewHandler.start).not.toHaveBeenCalled();
      expect(researchHandler.start).toHaveBeenCalled();
    });

    it('should mark workflow DONE when all phases are skipped', async () => {
      const run = makeRun(WorkflowState.TRIGGERED);
      (run as any).source = 'automated';

      const template = makeTemplate([
        {
          name: 'Interview',
          handler: 'interview',
          config: {},
          gate: null,
          skipConditions: [
            { field: 'source', operator: 'equals', value: 'automated' },
          ],
        },
      ]);

      prisma.workflowRun.findUniqueOrThrow.mockResolvedValue(run);
      prisma.workflowTemplate.findUniqueOrThrow.mockResolvedValue(template);

      await service.startWorkflow('run-1');

      expect(workflowService.transitionState).toHaveBeenCalledWith(
        'run-1',
        WorkflowState.DONE,
      );
    });

    it('should handle template with no phases by marking DONE', async () => {
      const run = makeRun(WorkflowState.TRIGGERED);
      const template = makeTemplate([]);

      prisma.workflowRun.findUniqueOrThrow.mockResolvedValue(run);
      prisma.workflowTemplate.findUniqueOrThrow.mockResolvedValue(template);

      await service.startWorkflow('run-1');

      expect(workflowService.transitionState).toHaveBeenCalledWith(
        'run-1',
        WorkflowState.DONE,
      );
    });
  });

  describe('completeCurrentPhase()', () => {
    it('should advance to the next phase', async () => {
      const run = makeRun(WorkflowState.INTERVIEWING, {
        interview: { status: 'active' },
      });
      const template = makeTemplate([
        { name: 'Interview', handler: 'interview', config: {}, gate: null },
        { name: 'Research', handler: 'research', config: {}, gate: null },
      ]);

      prisma.workflowRun.findUniqueOrThrow.mockResolvedValue(run);
      prisma.workflowTemplate.findUniqueOrThrow.mockResolvedValue(template);
      prisma.workflowRun.update.mockResolvedValue(run);

      await service.completeCurrentPhase('run-1');

      expect(interviewHandler.complete).toHaveBeenCalled();
      expect(workflowService.transitionState).toHaveBeenCalledWith(
        'run-1',
        WorkflowState.RESEARCHING,
      );
      expect(researchHandler.start).toHaveBeenCalled();
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'phase.completed' }),
      );
    });

    it('should mark workflow DONE when all phases complete', async () => {
      const run = makeRun(WorkflowState.REVIEWING, {
        review: { status: 'active' },
      });
      const template = makeTemplate([
        { name: 'Review', handler: 'review', config: {}, gate: null },
      ]);

      prisma.workflowRun.findUniqueOrThrow.mockResolvedValue(run);
      prisma.workflowTemplate.findUniqueOrThrow.mockResolvedValue(template);
      prisma.workflowRun.update.mockResolvedValue(run);

      await service.completeCurrentPhase('run-1');

      expect(reviewHandler.complete).toHaveBeenCalled();
      expect(workflowService.transitionState).toHaveBeenCalledWith(
        'run-1',
        WorkflowState.DONE,
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'workflow.completed' }),
      );
    });
  });

  describe('handleEvent()', () => {
    it('should delegate to the correct phase handler', async () => {
      const run = makeRun(WorkflowState.INTERVIEWING);
      prisma.workflowRun.findUniqueOrThrow.mockResolvedValue(run);

      const event = {
        type: 'user_response',
        source: 'slack',
        payload: { text: 'hello' },
        timestamp: new Date(),
      };

      await service.handleEvent('run-1', event);

      expect(interviewHandler.handleEvent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'run-1' }),
        event,
      );
    });

    it('should not throw when no handler found for current state', async () => {
      const run = makeRun(WorkflowState.DONE);
      prisma.workflowRun.findUniqueOrThrow.mockResolvedValue(run);

      const event = {
        type: 'some_event',
        source: 'test',
        payload: {},
        timestamp: new Date(),
      };

      await expect(service.handleEvent('run-1', event)).resolves.toBeUndefined();
    });

    it('should handle errors from phase handler gracefully', async () => {
      const run = makeRun(WorkflowState.INTERVIEWING);
      prisma.workflowRun.findUniqueOrThrow.mockResolvedValue(run);
      interviewHandler.handleEvent.mockRejectedValue(new Error('Handler error'));

      const event = {
        type: 'bad_event',
        source: 'test',
        payload: {},
        timestamp: new Date(),
      };

      await expect(service.handleEvent('run-1', event)).resolves.toBeUndefined();
    });
  });

  describe('pauseWorkflow()', () => {
    it('should save state and transition to PAUSED', async () => {
      const run = makeRun(WorkflowState.EXECUTING, {});
      prisma.workflowRun.findUniqueOrThrow.mockResolvedValue(run);
      prisma.workflowRun.update.mockResolvedValue(run);

      await service.pauseWorkflow('run-1', 'User requested pause');

      expect(prisma.workflowRun.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: {
          phaseData: expect.objectContaining({
            _pausedFromState: WorkflowState.EXECUTING,
            _pauseReason: 'User requested pause',
            _pausedAt: expect.any(String),
          }),
        },
      });

      expect(workflowService.transitionState).toHaveBeenCalledWith(
        'run-1',
        WorkflowState.PAUSED,
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'workflow.paused' }),
      );
    });
  });

  describe('resumeWorkflow()', () => {
    it('should restore previous state and clean up pause metadata', async () => {
      const run = makeRun(WorkflowState.PAUSED, {
        _pausedFromState: WorkflowState.EXECUTING,
        _pauseReason: 'User requested pause',
        _pausedAt: '2026-01-01T00:00:00.000Z',
      });
      prisma.workflowRun.findUniqueOrThrow.mockResolvedValue(run);
      prisma.workflowRun.update.mockResolvedValue(run);

      await service.resumeWorkflow('run-1');

      // phaseData should not contain pause metadata
      const updateCall = prisma.workflowRun.update.mock.calls[0][0];
      expect(updateCall.data.phaseData._pausedFromState).toBeUndefined();
      expect(updateCall.data.phaseData._pauseReason).toBeUndefined();
      expect(updateCall.data.phaseData._pausedAt).toBeUndefined();

      expect(workflowService.transitionState).toHaveBeenCalledWith(
        'run-1',
        WorkflowState.EXECUTING,
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'workflow.resumed' }),
      );
    });

    it('should not transition if no _pausedFromState found', async () => {
      const run = makeRun(WorkflowState.PAUSED, {});
      prisma.workflowRun.findUniqueOrThrow.mockResolvedValue(run);

      await service.resumeWorkflow('run-1');

      expect(workflowService.transitionState).not.toHaveBeenCalled();
    });
  });
});
