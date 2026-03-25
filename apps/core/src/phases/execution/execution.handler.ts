import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  PhaseHandler,
  PhaseEvent,
  PhaseStatus,
} from '../phase-handler.interface';
import { WorkflowRun } from '../../workflow/entities/workflow.entity';
import { PrismaService } from '../../common/database/prisma.service';
import { GateRunnerService } from './gate-runner.service';
import { CODING_AGENT_ADAPTER } from '../../adapters/interfaces/coding-agent-adapter.interface';
import type { CodingAgentAdapter } from '../../adapters/interfaces/coding-agent-adapter.interface';

@Injectable()
export class ExecutionHandler implements PhaseHandler {
  private readonly logger = new Logger(ExecutionHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateRunner: GateRunnerService,
    @Inject(CODING_AGENT_ADAPTER) private readonly codingAgent: CodingAgentAdapter,
  ) {}

  async start(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Starting execution phase for run ${workflowRun.id}`);

    const tasks = await this.prisma.task.findMany({
      where: {
        workflowRunId: workflowRun.id,
        status: 'PENDING',
      },
    });

    const readyTasks = tasks.filter(
      (t) => !t.dependsOn.length || t.dependsOn.every((d) => false),
    );

    const rootTasks = tasks.filter((task) => task.dependsOn.length === 0);

    for (const task of rootTasks) {
      await this.executeTask(workflowRun, task.id);
    }

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: {
          ...(workflowRun.phaseData as Record<string, unknown>),
          execution: {
            status: 'running',
            startedAt: new Date().toISOString(),
          },
        },
      },
    });
  }

  private async executeTask(
    workflowRun: WorkflowRun,
    taskId: string,
  ): Promise<void> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return;

    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: 'QUEUED' },
    });

    const agentInstance = await this.codingAgent.spawn({
      prompt: `Implement the following task on branch ${task.branch}:\n\nTask: ${task.ticketId}\n\nFollow existing code patterns and conventions.`,
      workingDirectory: '.',
      timeout: 600000,
    });

    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'RUNNING',
        agentInstanceId: agentInstance.id,
      },
    });
  }

  async handleEvent(
    workflowRun: WorkflowRun,
    event: PhaseEvent,
  ): Promise<void> {
    this.logger.log(
      `Execution event for run ${workflowRun.id}: ${event.type}`,
    );

    if (event.type === 'task_completed') {
      const taskId = event.payload.taskId as string;

      const gateResults = await this.gateRunner.runGates(taskId);

      const allPassed = gateResults.every((g) => g.passed);

      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: allPassed ? 'PASSED' : 'FAILED',
          gateResults: gateResults as any,
        },
      });

      if (!allPassed) {
        this.logger.warn(`Gates failed for task ${taskId}, attempting self-heal`);
        const failedGates = gateResults.filter((g) => !g.passed);

        const healPrompt = `The following gates failed after your changes:\n${failedGates.map((g) => `- ${g.gate}: ${g.error}`).join('\n')}\n\nPlease fix the issues and try again.`;

        await this.codingAgent.spawn({
          prompt: healPrompt,
          workingDirectory: '.',
          timeout: 300000,
        });
        return;
      }

      const downstream = await this.prisma.task.findMany({
        where: {
          workflowRunId: workflowRun.id,
          dependsOn: { has: taskId },
        },
      });

      for (const task of downstream) {
        const allDepsPassed = await this.checkDependenciesMet(task.dependsOn);
        if (allDepsPassed) {
          await this.executeTask(workflowRun, task.id);
        }
      }

      await this.checkPhaseCompletion(workflowRun);
    }
  }

  private async checkDependenciesMet(dependsOn: string[]): Promise<boolean> {
    for (const depId of dependsOn) {
      const dep = await this.prisma.task.findUnique({
        where: { id: depId },
      });
      if (!dep || dep.status !== 'PASSED') return false;
    }
    return true;
  }

  private async checkPhaseCompletion(workflowRun: WorkflowRun): Promise<void> {
    const tasks = await this.prisma.task.findMany({
      where: { workflowRunId: workflowRun.id },
    });

    const allDone = tasks.every(
      (t) => t.status === 'PASSED' || t.status === 'FAILED',
    );

    if (allDone) {
      const phaseData = workflowRun.phaseData as Record<string, any>;
      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: {
            ...phaseData,
            execution: {
              ...phaseData.execution,
              status: 'completed',
              completedAt: new Date().toISOString(),
            },
          },
        },
      });
    }
  }

  async getStatus(workflowRun: WorkflowRun): Promise<PhaseStatus> {
    const tasks = await this.prisma.task.findMany({
      where: { workflowRunId: workflowRun.id },
    });

    const total = tasks.length;
    const completed = tasks.filter(
      (t) => t.status === 'PASSED' || t.status === 'FAILED',
    ).length;

    return {
      phase: 'execution',
      progress: total > 0 ? (completed / total) * 100 : 0,
      details: {
        totalTasks: total,
        completed,
        running: tasks.filter((t) => t.status === 'RUNNING').length,
        pending: tasks.filter((t) => t.status === 'PENDING').length,
        failed: tasks.filter((t) => t.status === 'FAILED').length,
      },
    };
  }

  async complete(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Completing execution phase for run ${workflowRun.id}`);
  }
}
