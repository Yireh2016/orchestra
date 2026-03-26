import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  PhaseHandler,
  PhaseEvent,
  PhaseStatus,
} from '../phase-handler.interface';
import { WorkflowRun } from '../../workflow/entities/workflow.entity';
import { PrismaService } from '../../common/database/prisma.service';
import { GateRunnerService } from './gate-runner.service';
import { TaskQueueService } from '../../agent-runtime/task-queue.service';
import { CODING_AGENT_ADAPTER } from '../../adapters/interfaces/coding-agent-adapter.interface';
import type { CodingAgentAdapter } from '../../adapters/interfaces/coding-agent-adapter.interface';
import { CODE_HOST_ADAPTER } from '../../adapters/interfaces/code-host-adapter.interface';
import type { CodeHostAdapter } from '../../adapters/interfaces/code-host-adapter.interface';
import { PM_ADAPTER } from '../../adapters/interfaces/pm-adapter.interface';
import type { PMAdapter } from '../../adapters/interfaces/pm-adapter.interface';

const MAX_TASK_RETRIES = 3;

@Injectable()
export class ExecutionHandler implements PhaseHandler {
  private readonly logger = new Logger(ExecutionHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateRunner: GateRunnerService,
    private readonly taskQueue: TaskQueueService,
    @Inject(CODING_AGENT_ADAPTER) private readonly codingAgent: CodingAgentAdapter,
    @Inject(CODE_HOST_ADAPTER) private readonly codeHost: CodeHostAdapter,
    @Inject(PM_ADAPTER) private readonly pm: PMAdapter,
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

  private getRepoFromProjectContext(workflowRun: WorkflowRun): { url: string; defaultBranch: string } | null {
    const phaseData = workflowRun.phaseData as Record<string, any>;
    const ctx = phaseData._projectContext;
    if (!ctx || !ctx.repositories) return null;
    const repos = ctx.repositories as any[];
    if (repos.length === 0) return null;
    return { url: repos[0].url, defaultBranch: repos[0].defaultBranch || 'main' };
  }

  async start(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Starting execution phase for run ${workflowRun.id}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const projectRepo = this.getRepoFromProjectContext(workflowRun);
    const repo = projectRepo?.url ?? phaseData.repo ?? phaseData.planning?.repo ?? '';
    const baseBranch = projectRepo?.defaultBranch ?? phaseData.baseBranch ?? 'main';

    // Load all tasks for this workflow run
    const tasks = await this.prisma.task.findMany({
      where: { workflowRunId: workflowRun.id },
    });

    // Find root tasks (no dependencies)
    const rootTasks = tasks.filter(
      (t) => t.dependsOn.length === 0 && t.status === 'PENDING',
    );

    this.logger.log(
      `Found ${rootTasks.length} root tasks out of ${tasks.length} total`,
    );

    const projectContext = this.getProjectContext(workflowRun);

    // For each root task: create branch and queue
    for (const task of rootTasks) {
      try {
        await this.codeHost.createBranch(repo, task.branch, baseBranch);
      } catch (err) {
        this.logger.warn(
          `Failed to create branch ${task.branch}: ${(err as Error).message}`,
        );
      }

      try {
        await this.taskQueue.enqueue({
          taskId: task.id,
          workflowRunId: workflowRun.id,
          prompt: `${projectContext}Implement the following task on branch ${task.branch}:\n\nTicket: ${task.ticketId}\n\nFollow existing code patterns and conventions.`,
          workingDirectory: '.',
          repoUrl: repo,
          branch: task.branch,
          baseBranch,
          taskDefinition: {
            title: task.ticketId,
            description: `Implement task ${task.ticketId} on branch ${task.branch}`,
            acceptanceCriteria: [],
          },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to enqueue task ${task.id}: ${(err as Error).message}`,
        );
      }
    }

    // Set phaseData status to executing
    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: {
          ...phaseData,
          execution: {
            status: 'executing',
            startedAt: new Date().toISOString(),
            totalTasks: tasks.length,
            completedTasks: 0,
            retriesMap: {},
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
      `Execution event for run ${workflowRun.id}: ${event.type}`,
    );

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const execution = phaseData.execution ?? { retriesMap: {} };
    const repo = phaseData.repo ?? phaseData.planning?.repo ?? '';
    const baseBranch = phaseData.baseBranch ?? 'main';

    if (event.type === 'task_completed') {
      const taskId = event.payload.taskId as string;

      // Run gates to verify the task
      const gateResults = await this.gateRunner.runGates(taskId);
      const allPassed = gateResults.every((g) => g.passed);

      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: allPassed ? 'PASSED' : 'FAILED',
          gateResults: gateResults as any,
        },
      });

      if (allPassed) {
        this.logger.log(`Task ${taskId} passed all gates`);

        // Check for newly unblocked downstream tasks
        await this.enqueueUnblockedTasks(workflowRun, repo, baseBranch);

        // Check if all tasks are done
        const allTasks = await this.prisma.task.findMany({
          where: { workflowRunId: workflowRun.id },
        });

        const allTasksPassed = allTasks.every((t) => t.status === 'PASSED');

        if (allTasksPassed) {
          // Create PRs for each task
          for (const task of allTasks) {
            try {
              const pr = await this.codeHost.createPullRequest({
                title: `[Orchestra] ${task.ticketId}`,
                body: `Automated PR for task ${task.ticketId}.\n\nWorkflow Run: ${workflowRun.id}`,
                sourceBranch: task.branch,
                targetBranch: baseBranch,
                repo,
              });

              await this.prisma.task.update({
                where: { id: task.id },
                data: { prUrl: pr.url },
              });
            } catch (err) {
              this.logger.warn(
                `Failed to create PR for task ${task.id}: ${(err as Error).message}`,
              );
            }
          }

          execution.status = 'completed';
          execution.completedAt = new Date().toISOString();
          execution.readyForCompletion = true;

          await this.prisma.workflowRun.update({
            where: { id: workflowRun.id },
            data: {
              phaseData: { ...phaseData, execution },
            },
          });
        }
      }
    }

    if (event.type === 'task_failed') {
      const taskId = event.payload.taskId as string;
      const retriesMap: Record<string, number> = execution.retriesMap ?? {};
      const currentRetries = retriesMap[taskId] ?? 0;

      // Load gate results for context
      const task = await this.prisma.task.findUnique({
        where: { id: taskId },
      });

      if (!task) return;

      const gateResults = (task.gateResults as any)?.results ?? task.gateResults;
      const failedGates = Array.isArray(gateResults)
        ? gateResults.filter((g: any) => !g.passed)
        : [];

      this.logger.warn(
        `Task ${taskId} failed, retry ${currentRetries + 1}/${MAX_TASK_RETRIES}`,
      );

      if (currentRetries < MAX_TASK_RETRIES) {
        // Re-queue with self-healing context
        retriesMap[taskId] = currentRetries + 1;
        execution.retriesMap = retriesMap;

        await this.prisma.workflowRun.update({
          where: { id: workflowRun.id },
          data: {
            phaseData: { ...phaseData, execution },
          },
        });

        await this.prisma.task.update({
          where: { id: taskId },
          data: { status: 'PENDING' },
        });

        const healPrompt = `The following gates failed after your previous attempt on branch ${task.branch}:\n${failedGates.map((g: any) => `- ${g.gate ?? g.name}: ${g.error ?? 'failed'}`).join('\n')}\n\nPlease fix the issues. This is retry ${currentRetries + 1} of ${MAX_TASK_RETRIES}.`;

        try {
          await this.taskQueue.enqueue({
            taskId: task.id,
            workflowRunId: workflowRun.id,
            prompt: healPrompt,
            workingDirectory: '.',
            repoUrl: repo,
            branch: task.branch,
            baseBranch,
            taskDefinition: {
              title: task.ticketId,
              description: healPrompt,
              acceptanceCriteria: [],
            },
          });
        } catch (err) {
          this.logger.warn(
            `Failed to re-queue task ${taskId} for self-heal: ${(err as Error).message}`,
          );
        }
      } else {
        // Max retries exceeded — pause workflow, notify via Jira
        this.logger.warn(
          `Task ${taskId} exceeded max retries, pausing workflow`,
        );

        execution.status = 'paused';
        execution.pausedAt = new Date().toISOString();
        execution.pauseReason = `Task ${task.ticketId} failed after ${MAX_TASK_RETRIES} retries`;

        await this.prisma.workflowRun.update({
          where: { id: workflowRun.id },
          data: {
            phaseData: { ...phaseData, execution },
          },
        });

        try {
          await this.pm.addComment(
            workflowRun.ticketId,
            `Workflow paused: Task ${task.ticketId} failed after ${MAX_TASK_RETRIES} retries.\n\nFailed gates:\n${failedGates.map((g: any) => `- ${g.gate ?? g.name}: ${g.error ?? 'failed'}`).join('\n')}\n\nManual intervention required.`,
          );
        } catch (err) {
          this.logger.warn(
            `Failed to post failure notification to Jira: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  private async enqueueUnblockedTasks(
    workflowRun: WorkflowRun,
    repo: string,
    baseBranch: string,
  ): Promise<void> {
    const pendingTasks = await this.prisma.task.findMany({
      where: {
        workflowRunId: workflowRun.id,
        status: 'PENDING',
      },
    });

    for (const task of pendingTasks) {
      if (task.dependsOn.length === 0) continue; // already handled in start()

      const allDepsPassed = await this.checkDependenciesMet(task.dependsOn);

      if (allDepsPassed) {
        this.logger.log(`Dependencies met for task ${task.id}, enqueuing`);

        try {
          await this.codeHost.createBranch(repo, task.branch, baseBranch);
        } catch (err) {
          this.logger.warn(
            `Failed to create branch ${task.branch}: ${(err as Error).message}`,
          );
        }

        try {
          await this.taskQueue.enqueue({
            taskId: task.id,
            workflowRunId: workflowRun.id,
            prompt: `Implement the following task on branch ${task.branch}:\n\nTicket: ${task.ticketId}\n\nFollow existing code patterns and conventions.`,
            workingDirectory: '.',
            repoUrl: repo,
            branch: task.branch,
            baseBranch,
            taskDefinition: {
              title: task.ticketId,
              description: `Implement task ${task.ticketId} on branch ${task.branch}`,
              acceptanceCriteria: [],
            },
          });
        } catch (err) {
          this.logger.warn(
            `Failed to enqueue task ${task.id}: ${(err as Error).message}`,
          );
        }
      }
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
        queued: tasks.filter((t) => t.status === 'QUEUED').length,
        pending: tasks.filter((t) => t.status === 'PENDING').length,
        failed: tasks.filter((t) => t.status === 'FAILED').length,
        passed: tasks.filter((t) => t.status === 'PASSED').length,
      },
    };
  }

  async complete(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Completing execution phase for run ${workflowRun.id}`);

    // Verify all tasks passed
    const tasks = await this.prisma.task.findMany({
      where: { workflowRunId: workflowRun.id },
    });

    const allPassed = tasks.every((t) => t.status === 'PASSED');
    if (!allPassed) {
      this.logger.warn(
        `Completing execution phase for run ${workflowRun.id} with non-passed tasks`,
      );
    }

    // Update Jira ticket statuses
    for (const task of tasks) {
      try {
        const transitions = await this.pm.getTransitions(task.ticketId);
        const inReviewTransition = transitions.find(
          (t) =>
            t.name.toLowerCase().includes('review') ||
            t.to.toLowerCase().includes('review'),
        );
        if (inReviewTransition) {
          await this.pm.transitionTicket(task.ticketId, inReviewTransition.id);
        }
      } catch (err) {
        this.logger.warn(
          `Failed to transition Jira ticket ${task.ticketId}: ${(err as Error).message}`,
        );
      }
    }

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const execution = phaseData.execution ?? {};
    execution.status = 'completed';
    execution.completedAt = new Date().toISOString();

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: { ...phaseData, execution },
      },
    });
  }
}
