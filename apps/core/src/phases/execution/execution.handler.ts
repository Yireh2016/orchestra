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

  /**
   * Extract repo slug from a URL: https://github.com/owner/repo → owner/repo
   */
  private extractSlug(url: string): string {
    const match = url.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/);
    return match ? match[1] : url;
  }

  /**
   * Get the default repo from the project context (fallback when task doesn't specify one).
   */
  private getDefaultRepoFromProject(workflowRun: WorkflowRun): { slug: string; url: string; defaultBranch: string } | null {
    const phaseData = workflowRun.phaseData as Record<string, any>;
    const ctx = phaseData._projectContext;
    if (!ctx || !ctx.repositories) return null;
    const repos = ctx.repositories as any[];
    if (repos.length === 0) return null;

    const primaryRepo = repos.find((r: any) => r.primary) ?? repos[0];
    return { slug: this.extractSlug(primaryRepo.url), url: primaryRepo.url, defaultBranch: primaryRepo.defaultBranch || 'main' };
  }

  /**
   * Resolve the repo for a specific task. Tasks may specify their own repo from the plan.
   * Falls back to the project default.
   */
  private resolveTaskRepo(
    taskTicketId: string,
    phaseData: Record<string, any>,
    workflowRun: WorkflowRun,
  ): { slug: string; url: string; defaultBranch: string } {
    // Check if the plan task specifies a repo
    const planTasks = (phaseData.planning?.tasks ?? []) as any[];
    const planTask = planTasks.find((t: any) => t.id === taskTicketId);

    if (planTask?.repo) {
      const url = planTask.repo;
      // Find the matching project repo to get the defaultBranch
      const ctx = phaseData._projectContext;
      const repos = (ctx?.repositories ?? []) as any[];
      const match = repos.find((r: any) => r.url === url);
      return {
        slug: this.extractSlug(url),
        url,
        defaultBranch: match?.defaultBranch || 'main',
      };
    }

    // Fallback to project default
    const defaultRepo = this.getDefaultRepoFromProject(workflowRun);
    return defaultRepo ?? { slug: '', url: '', defaultBranch: 'main' };
  }

  async start(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Starting execution phase for run ${workflowRun.id}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;

    // Load all tasks for this workflow run — create from plan if missing
    let tasks = await this.prisma.task.findMany({
      where: { workflowRunId: workflowRun.id },
    });

    // If no tasks in DB but plan has tasks in phaseData, create them (rerun scenario)
    if (tasks.length === 0) {
      const planTasks = (phaseData.planning?.tasks ?? []) as any[];
      if (planTasks.length > 0) {
        this.logger.log(`No tasks in DB — creating ${planTasks.length} tasks from plan`);
        for (const pt of planTasks) {
          await this.prisma.task.create({
            data: {
              workflowRunId: workflowRun.id,
              ticketId: pt.id ?? pt.title,
              branch: `orchestra/${workflowRun.ticketId}/${pt.branch ?? pt.id}`,
              dependsOn: pt.dependsOn ?? [],
              status: 'PENDING',
              gateResults: {
                automatedGates: pt.automatedGates ?? pt.gates ?? [],
                manualGates: pt.manualGates ?? [],
              },
            },
          });
        }
        tasks = await this.prisma.task.findMany({
          where: { workflowRunId: workflowRun.id },
        });
        this.logger.log(`Created ${tasks.length} tasks in DB`);
      }
    }

    // Find tasks that are ready to execute:
    // - PENDING with no deps (root tasks), OR
    // - PENDING with all deps PASSED (unblocked by previous run)
    const passedTaskIds = new Set(tasks.filter(t => t.status === 'PASSED').map(t => t.ticketId));
    const readyTasks = tasks.filter(t => {
      if (t.status !== 'PENDING') return false;
      if (t.dependsOn.length === 0) return true;
      return t.dependsOn.every(dep => passedTaskIds.has(dep));
    });

    this.logger.log(
      `Found ${readyTasks.length} ready tasks out of ${tasks.length} total (${passedTaskIds.size} already passed)`,
    );

    const projectContext = this.getProjectContext(workflowRun);

    // For each ready task: resolve repo, create branch, queue
    for (const task of readyTasks) {
      const taskRepo = this.resolveTaskRepo(task.ticketId, phaseData, workflowRun);
      this.logger.log(`Task ${task.ticketId}: using repo ${taskRepo.slug} (branch: ${taskRepo.defaultBranch})`);

      try {
        await this.codeHost.createBranch(taskRepo.slug, task.branch, taskRepo.defaultBranch);
      } catch (err) {
        this.logger.warn(`Failed to create branch ${task.branch}: ${(err as Error).message}`);
      }

      const planTasks = (phaseData.planning?.tasks ?? []) as any[];
      const planTask = planTasks.find((t: any) => t.id === task.ticketId);

      try {
        await this.taskQueue.enqueue({
          taskId: task.id,
          workflowRunId: workflowRun.id,
          prompt: `${projectContext}Implement the following task on branch ${task.branch}:\n\nTask: ${planTask?.title ?? task.ticketId}\nDescription: ${planTask?.description ?? ''}\nRepository: ${taskRepo.url}\n\nFollow existing code patterns and conventions.`,
          workingDirectory: '.',
          repoUrl: taskRepo.url,
          branch: task.branch,
          baseBranch: taskRepo.defaultBranch,
          taskDefinition: {
            title: planTask?.title ?? task.ticketId,
            description: planTask?.description ?? `Implement task ${task.ticketId}`,
            acceptanceCriteria: planTask?.acceptanceCriteria ?? [],
            gates: planTask?.automatedGates ?? planTask?.gates ?? [],
          },
          automatedGates: planTask?.automatedGates ?? planTask?.gates ?? [],
        });
      } catch (err) {
        this.logger.warn(`Failed to enqueue task ${task.id}: ${(err as Error).message}`);
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
        const task = await this.prisma.task.findUnique({ where: { id: taskId } });
        const planTasks = (phaseData.planning?.tasks ?? phaseData.plan?.tasks ?? []) as any[];
        const planTask = planTasks.find((t: any) => t.id === task?.ticketId);

        this.logger.log(`Task ${taskId} passed all gates`);

        // Determine manual gates from the plan
        const manualGates: { name: string; description: string }[] = planTask?.manualGates ?? [];

        // Create PR for tasks that target a repo (non-null repo in plan)
        // Skip tasks with repo=null (investigation/admin tasks)
        let prUrl: string | null = null;
        if (task && planTask?.repo) {
          const taskRepo = this.resolveTaskRepo(task.ticketId, phaseData, workflowRun);
          try {
            const pr = await this.codeHost.createPullRequest({
              title: `[Orchestra] ${task.ticketId}: ${planTask?.title ?? task.ticketId}`,
              body: `Automated PR by Orchestra.\n\nWorkflow: ${workflowRun.id}\nTask: ${task.ticketId}\n\n${planTask?.description ?? ''}`,
              sourceBranch: task.branch,
              targetBranch: taskRepo.defaultBranch,
              repo: taskRepo.slug,
            });
            prUrl = pr.url;
            await this.prisma.task.update({ where: { id: task.id }, data: { prUrl: pr.url } });
            this.logger.log(`Created PR for task ${task.id}: ${pr.url}`);
          } catch (err) {
            // 422 = branch doesn't exist or no diff (task made no changes) — that's fine
            this.logger.warn(`PR not created for task ${task.id}: ${(err as Error).message}`);
          }
        } else {
          this.logger.log(`Task ${taskId}: no repo in plan — skipping PR creation`);
        }

        // If manual gates exist, post checklist on PR and set AWAITING_MANUAL_GATES
        if (manualGates.length > 0 && prUrl && task) {
          const checklistBody = [
            '## Manual Validation Required',
            '',
            'Please verify the following before approving this PR:',
            '',
            ...manualGates.map(g => `- [ ] **${g.name}**: ${g.description}`),
            '',
            'Reply with `/orchestra gates-passed` when all manual checks pass, or `/orchestra fix: [description]` if issues are found.',
          ].join('\n');

          try {
            const match = prUrl.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
            if (match) {
              const [, repo, prNumberStr] = match;
              await this.codeHost.addPRComment(repo, parseInt(prNumberStr, 10), checklistBody);
              this.logger.log(`Posted manual gates checklist on PR ${prUrl}`);
            }
          } catch (err) {
            this.logger.warn(`Failed to post manual gates checklist: ${(err as Error).message}`);
          }

          await this.prisma.task.update({
            where: { id: task.id },
            data: { status: 'AWAITING_MANUAL_GATES' },
          });
          this.logger.log(`Task ${taskId} set to AWAITING_MANUAL_GATES`);
        } else if (task) {
          // No manual gates — task is fully PASSED (already set above by gate runner)
          this.logger.log(`Task ${taskId}: no manual gates — fully passed`);
        }

        // Enqueue unblocked downstream tasks
        await this.enqueueUnblockedTasks(workflowRun, phaseData);

        // Check if all tasks are done — AWAITING_MANUAL_GATES does NOT count as passed
        const allTasks = await this.prisma.task.findMany({
          where: { workflowRunId: workflowRun.id },
        });
        const allTasksPassed = allTasks.every((t) => t.status === 'PASSED');

        if (allTasksPassed) {
          this.logger.log(`All ${allTasks.length} tasks passed — execution phase complete`);

          // Mark execution as completed so polling advances to review
          execution.status = 'completed';
          execution.completedAt = new Date().toISOString();
          execution.allTasksPassed = true;
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

    if (event.type === 'manual_gates_passed') {
      const taskId = event.payload.taskId as string;
      this.logger.log(`Manual gates passed for task ${taskId}`);

      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: 'PASSED' },
      });

      // Check if all tasks are now fully done
      const allTasks = await this.prisma.task.findMany({
        where: { workflowRunId: workflowRun.id },
      });
      const allTasksPassed = allTasks.every((t) => t.status === 'PASSED');

      if (allTasksPassed) {
        this.logger.log(`All ${allTasks.length} tasks passed (including manual gates) — execution phase complete`);
        execution.status = 'completed';
        execution.completedAt = new Date().toISOString();
        execution.allTasksPassed = true;
        execution.readyForCompletion = true;

        await this.prisma.workflowRun.update({
          where: { id: workflowRun.id },
          data: {
            phaseData: { ...phaseData, execution },
          },
        });
      }
    }

    if (event.type === 'manual_gate_fix_requested') {
      const taskId = event.payload.taskId as string;
      const fixDescription = event.payload.fixDescription as string;
      const task = await this.prisma.task.findUnique({ where: { id: taskId } });

      if (task && task.status === 'AWAITING_MANUAL_GATES') {
        this.logger.log(`Fix requested for task ${taskId}: ${fixDescription}`);

        // Set task back to PENDING and re-queue with fix context
        await this.prisma.task.update({
          where: { id: taskId },
          data: { status: 'PENDING' },
        });

        const taskRepo = this.resolveTaskRepo(task.ticketId, phaseData, workflowRun);
        const planTasks = (phaseData.planning?.tasks ?? []) as any[];
        const planTask = planTasks.find((t: any) => t.id === task.ticketId);

        const fixPrompt = `A reviewer found issues during manual validation of your PR on branch ${task.branch}.\n\nFix requested: ${fixDescription}\n\nPlease fix the issues. This is a fix request from manual gate review.`;

        try {
          await this.taskQueue.enqueue({
            taskId: task.id,
            workflowRunId: workflowRun.id,
            prompt: fixPrompt,
            workingDirectory: '.',
            repoUrl: taskRepo.url,
            branch: task.branch,
            baseBranch: taskRepo.defaultBranch,
            taskDefinition: {
              title: planTask?.title ?? task.ticketId,
              description: fixPrompt,
              acceptanceCriteria: planTask?.acceptanceCriteria ?? [],
              gates: planTask?.automatedGates ?? planTask?.gates ?? [],
            },
            automatedGates: planTask?.automatedGates ?? planTask?.gates ?? [],
          });
        } catch (err) {
          this.logger.warn(`Failed to enqueue fix for task ${taskId}: ${(err as Error).message}`);
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

        const healRepo = this.resolveTaskRepo(task.ticketId, phaseData, workflowRun);
        try {
          await this.taskQueue.enqueue({
            taskId: task.id,
            workflowRunId: workflowRun.id,
            prompt: healPrompt,
            workingDirectory: '.',
            repoUrl: healRepo.url,
            branch: task.branch,
            baseBranch: healRepo.defaultBranch,
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
    phaseData: Record<string, any>,
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
        const taskRepo = this.resolveTaskRepo(task.ticketId, phaseData, workflowRun);
        const planTasks = (phaseData.planning?.tasks ?? []) as any[];
        const planTask = planTasks.find((t: any) => t.id === task.ticketId);
        const projectContext = this.getProjectContext(workflowRun);

        this.logger.log(`Dependencies met for task ${task.id} (repo: ${taskRepo.slug}), enqueuing`);

        try {
          await this.codeHost.createBranch(taskRepo.slug, task.branch, taskRepo.defaultBranch);
        } catch (err) {
          this.logger.warn(`Failed to create branch ${task.branch}: ${(err as Error).message}`);
        }

        try {
          await this.taskQueue.enqueue({
            taskId: task.id,
            workflowRunId: workflowRun.id,
            prompt: `${projectContext}Implement the following task on branch ${task.branch}:\n\nTask: ${planTask?.title ?? task.ticketId}\nDescription: ${planTask?.description ?? ''}\nRepository: ${taskRepo.url}\n\nFollow existing code patterns and conventions.`,
            workingDirectory: '.',
            repoUrl: taskRepo.url,
            branch: task.branch,
            baseBranch: taskRepo.defaultBranch,
            taskDefinition: {
              title: planTask?.title ?? task.ticketId,
              description: planTask?.description ?? `Implement task ${task.ticketId}`,
              acceptanceCriteria: planTask?.acceptanceCriteria ?? [],
              gates: planTask?.automatedGates ?? planTask?.gates ?? [],
            },
            automatedGates: planTask?.automatedGates ?? planTask?.gates ?? [],
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
      // dependsOn contains ticketId values (e.g., "task-1"), not UUIDs
      const dep = await this.prisma.task.findFirst({
        where: { ticketId: depId },
      });
      if (!dep || dep.status !== 'PASSED') {
        this.logger.debug(`Dependency ${depId}: ${dep ? `status=${dep.status}` : 'not found'}`);
        return false;
      }
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
        awaitingManualGates: tasks.filter((t) => t.status === 'AWAITING_MANUAL_GATES').length,
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
