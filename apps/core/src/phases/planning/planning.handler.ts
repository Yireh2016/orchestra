import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  PhaseHandler,
  PhaseEvent,
  PhaseStatus,
} from '../phase-handler.interface';
import { WorkflowRun } from '../../workflow/entities/workflow.entity';
import { PrismaService } from '../../common/database/prisma.service';
import { DagBuilderService, TaskNode } from './dag-builder.service';
import { CHANNEL_ADAPTER } from '../../adapters/interfaces/channel-adapter.interface';
import type { ChannelAdapter } from '../../adapters/interfaces/channel-adapter.interface';

@Injectable()
export class PlanningHandler implements PhaseHandler {
  private readonly logger = new Logger(PlanningHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dagBuilder: DagBuilderService,
    @Inject(CHANNEL_ADAPTER) private readonly channel: ChannelAdapter,
  ) {}

  private getProjectContext(workflowRun: WorkflowRun): string {
    const phaseData = workflowRun.phaseData as Record<string, any>;
    const ctx = phaseData._projectContext;
    if (!ctx) return '';
    return [
      '## Project Context',
      `Project: ${ctx.name}`,
      ctx.description ? `Description: ${ctx.description}` : '',
      `Repositories: ${(ctx.repositories as any[])?.map((r: any) => `${r.url} (branch: ${r.defaultBranch || 'main'})`).join(', ') || 'None'}`,
      '',
      ctx.context || '',
      '---',
      '',
    ].filter(Boolean).join('\n');
  }

  async start(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Starting planning phase for run ${workflowRun.id}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const researchOutput = phaseData.research?.output ?? '';
    const projectContext = this.getProjectContext(workflowRun);

    try {
      const planningMessage = projectContext
        ? `Planning phase started. Based on research, I'll generate an implementation plan.\n\n${projectContext}\nResearch summary available. Please provide any additional constraints or task breakdown preferences.`
        : `Planning phase started. Based on research, I'll generate an implementation plan.\n\nResearch summary available. Please provide any additional constraints or task breakdown preferences.`;

      await this.channel.sendMessage({
        threadId: workflowRun.ticketId,
        content: planningMessage,
      });
    } catch (err) {
      this.logger.warn(`Failed to send planning start message: ${(err as Error).message}`);
    }

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: {
          ...phaseData,
          planning: {
            status: 'awaiting_input',
            researchContext: researchOutput,
            tasks: [],
            dag: null,
            executionGroups: [],
          },
        },
      },
    });
  }

  async handleEvent(
    workflowRun: WorkflowRun,
    event: PhaseEvent,
  ): Promise<void> {
    this.logger.log(
      `Planning event for run ${workflowRun.id}: ${event.type}`,
    );

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const planning = phaseData.planning ?? { tasks: [] };

    if (event.type === 'tasks_defined') {
      const tasks = event.payload.tasks as TaskNode[];
      planning.tasks = tasks;

      const dag = this.dagBuilder.buildDag(tasks);
      planning.dag = dag;

      const executionGroups = this.dagBuilder.computeExecutionGroups(dag);
      planning.executionGroups = executionGroups;

      planning.status = 'plan_ready';

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: { ...phaseData, planning },
        },
      });

      try {
        await this.channel.sendMessage({
          threadId: workflowRun.ticketId,
          content: `Implementation plan generated with ${tasks.length} tasks in ${executionGroups.length} execution groups.\n\nGroups:\n${executionGroups.map((g: string[], i: number) => `  Group ${i + 1}: ${g.join(', ')}`).join('\n')}\n\nApprove to proceed to execution.`,
        });
      } catch (err) {
        this.logger.warn(`Failed to send plan generated message: ${(err as Error).message}`);
      }
    }

    if (event.type === 'plan_approved') {
      planning.status = 'approved';
      planning.approvedBy = event.source;
      planning.approvedAt = new Date().toISOString();

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: { ...phaseData, planning },
        },
      });

      this.logger.log(
        `Plan approved for run ${workflowRun.id} by ${event.source}, ready for execution phase`,
      );

      try {
        await this.channel.sendMessage({
          threadId: workflowRun.ticketId,
          content: `Plan approved by ${event.source}. Proceeding to execution phase.`,
        });
      } catch (err) {
        this.logger.warn(`Failed to send plan approved message: ${(err as Error).message}`);
      }
    }
  }

  async getStatus(workflowRun: WorkflowRun): Promise<PhaseStatus> {
    const phaseData = workflowRun.phaseData as Record<string, any>;
    const planning = phaseData.planning ?? {};

    return {
      phase: 'planning',
      progress: planning.status === 'approved' ? 100 : planning.status === 'plan_ready' ? 75 : 25,
      details: {
        status: planning.status ?? 'not_started',
        taskCount: planning.tasks?.length ?? 0,
        executionGroupCount: planning.executionGroups?.length ?? 0,
      },
    };
  }

  async complete(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Completing planning phase for run ${workflowRun.id}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const planning = phaseData.planning ?? {};

    const tasks = planning.tasks ?? [];
    for (const task of tasks) {
      await this.prisma.task.create({
        data: {
          workflowRunId: workflowRun.id,
          ticketId: task.id,
          branch: `feature/${workflowRun.ticketId}/${task.id}`,
          dependsOn: task.dependsOn ?? [],
          status: 'PENDING',
          gateResults: {},
        },
      });
    }

    planning.status = 'completed';
    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: { ...phaseData, planning },
      },
    });
  }
}
