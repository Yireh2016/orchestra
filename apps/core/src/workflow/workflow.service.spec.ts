import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowState } from './entities/workflow.entity';
import { createMockPrisma, MockPrisma } from '../test/mock-prisma';

describe('WorkflowService', () => {
  let service: WorkflowService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new WorkflowService(prisma as any);
  });

  describe('create()', () => {
    it('should create a workflow run with TRIGGERED state', async () => {
      const template = { id: 'tpl-1', name: 'Test Template', version: 3 };
      prisma.workflowTemplate.findUnique.mockResolvedValue(template);

      const expectedRun = {
        id: 'run-1',
        templateId: 'tpl-1',
        templateVersion: 3,
        ticketId: 'ticket-1',
        state: WorkflowState.TRIGGERED,
        phaseData: {},
      };
      prisma.workflowRun.create.mockResolvedValue(expectedRun);

      const result = await service.create({
        templateId: 'tpl-1',
        ticketId: 'ticket-1',
      });

      expect(result).toEqual(expectedRun);
      expect(prisma.workflowRun.create).toHaveBeenCalledWith({
        data: {
          templateId: 'tpl-1',
          templateVersion: 3,
          ticketId: 'ticket-1',
          state: WorkflowState.TRIGGERED,
          phaseData: {},
        },
      });
    });

    it('should throw NotFoundException when template does not exist', async () => {
      prisma.workflowTemplate.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ templateId: 'nonexistent', ticketId: 'ticket-1' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById()', () => {
    it('should return a specific workflow run', async () => {
      const run = { id: 'run-1', templateId: 'tpl-1', state: WorkflowState.TRIGGERED };
      prisma.workflowRun.findUnique.mockResolvedValue(run);

      const result = await service.findById('run-1');
      expect(result).toEqual(run);
      expect(prisma.workflowRun.findUnique).toHaveBeenCalledWith({ where: { id: 'run-1' } });
    });

    it('should throw NotFoundException when run does not exist', async () => {
      prisma.workflowRun.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('list()', () => {
    it('should return all workflow runs', async () => {
      const runs = [
        { id: 'run-1', state: WorkflowState.TRIGGERED },
        { id: 'run-2', state: WorkflowState.DONE },
      ];
      prisma.workflowRun.findMany.mockResolvedValue(runs);

      const result = await service.list();
      expect(result).toEqual(runs);
      expect(prisma.workflowRun.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by templateId', async () => {
      prisma.workflowRun.findMany.mockResolvedValue([]);
      await service.list({ templateId: 'tpl-1' });
      expect(prisma.workflowRun.findMany).toHaveBeenCalledWith({
        where: { templateId: 'tpl-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by state', async () => {
      prisma.workflowRun.findMany.mockResolvedValue([]);
      await service.list({ state: WorkflowState.EXECUTING });
      expect(prisma.workflowRun.findMany).toHaveBeenCalledWith({
        where: { state: WorkflowState.EXECUTING },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('transitionState()', () => {
    const makeRun = (state: WorkflowState) => ({
      id: 'run-1',
      templateId: 'tpl-1',
      state,
    });

    it('should allow TRIGGERED -> INTERVIEWING', async () => {
      prisma.workflowRun.findUnique.mockResolvedValue(makeRun(WorkflowState.TRIGGERED));
      prisma.workflowRun.update.mockResolvedValue(makeRun(WorkflowState.INTERVIEWING));

      const result = await service.transitionState('run-1', WorkflowState.INTERVIEWING);
      expect(result.state).toBe(WorkflowState.INTERVIEWING);
    });

    it('should allow INTERVIEWING -> RESEARCHING', async () => {
      prisma.workflowRun.findUnique.mockResolvedValue(makeRun(WorkflowState.INTERVIEWING));
      prisma.workflowRun.update.mockResolvedValue(makeRun(WorkflowState.RESEARCHING));

      const result = await service.transitionState('run-1', WorkflowState.RESEARCHING);
      expect(result.state).toBe(WorkflowState.RESEARCHING);
    });

    it('should allow RESEARCHING -> PLANNING', async () => {
      prisma.workflowRun.findUnique.mockResolvedValue(makeRun(WorkflowState.RESEARCHING));
      prisma.workflowRun.update.mockResolvedValue(makeRun(WorkflowState.PLANNING));

      const result = await service.transitionState('run-1', WorkflowState.PLANNING);
      expect(result.state).toBe(WorkflowState.PLANNING);
    });

    it('should allow REVIEWING -> DONE', async () => {
      prisma.workflowRun.findUnique.mockResolvedValue(makeRun(WorkflowState.REVIEWING));
      prisma.workflowRun.update.mockResolvedValue(makeRun(WorkflowState.DONE));

      const result = await service.transitionState('run-1', WorkflowState.DONE);
      expect(result.state).toBe(WorkflowState.DONE);
    });

    it('should reject TRIGGERED -> EXECUTING (skipping phases)', async () => {
      prisma.workflowRun.findUnique.mockResolvedValue(makeRun(WorkflowState.TRIGGERED));

      await expect(
        service.transitionState('run-1', WorkflowState.EXECUTING),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject DONE -> INTERVIEWING (terminal state)', async () => {
      prisma.workflowRun.findUnique.mockResolvedValue(makeRun(WorkflowState.DONE));

      await expect(
        service.transitionState('run-1', WorkflowState.INTERVIEWING),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject FAILED -> any state (terminal state)', async () => {
      prisma.workflowRun.findUnique.mockResolvedValue(makeRun(WorkflowState.FAILED));

      await expect(
        service.transitionState('run-1', WorkflowState.TRIGGERED),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow PAUSED from any active state', async () => {
      const activeStates = [
        WorkflowState.TRIGGERED,
        WorkflowState.INTERVIEWING,
        WorkflowState.RESEARCHING,
        WorkflowState.PLANNING,
        WorkflowState.EXECUTING,
        WorkflowState.REVIEWING,
      ];

      for (const state of activeStates) {
        prisma.workflowRun.findUnique.mockResolvedValue(makeRun(state));
        prisma.workflowRun.update.mockResolvedValue(makeRun(WorkflowState.PAUSED));

        const result = await service.transitionState('run-1', WorkflowState.PAUSED);
        expect(result.state).toBe(WorkflowState.PAUSED);
      }
    });

    it('should allow FAILED from any active state', async () => {
      const activeStates = [
        WorkflowState.TRIGGERED,
        WorkflowState.INTERVIEWING,
        WorkflowState.RESEARCHING,
        WorkflowState.PLANNING,
        WorkflowState.EXECUTING,
        WorkflowState.REVIEWING,
      ];

      for (const state of activeStates) {
        prisma.workflowRun.findUnique.mockResolvedValue(makeRun(state));
        prisma.workflowRun.update.mockResolvedValue(makeRun(WorkflowState.FAILED));

        const result = await service.transitionState('run-1', WorkflowState.FAILED);
        expect(result.state).toBe(WorkflowState.FAILED);
      }
    });

    it('should allow PAUSED -> resume to any active state', async () => {
      const resumeTargets = [
        WorkflowState.TRIGGERED,
        WorkflowState.INTERVIEWING,
        WorkflowState.RESEARCHING,
        WorkflowState.PLANNING,
        WorkflowState.EXECUTING,
        WorkflowState.REVIEWING,
      ];

      for (const target of resumeTargets) {
        prisma.workflowRun.findUnique.mockResolvedValue(makeRun(WorkflowState.PAUSED));
        prisma.workflowRun.update.mockResolvedValue(makeRun(target));

        const result = await service.transitionState('run-1', target);
        expect(result.state).toBe(target);
      }
    });
  });
});
