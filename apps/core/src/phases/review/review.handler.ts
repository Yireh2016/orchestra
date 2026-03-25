import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  PhaseHandler,
  PhaseEvent,
  PhaseStatus,
} from '../phase-handler.interface';
import { WorkflowRun } from '../../workflow/entities/workflow.entity';
import { PrismaService } from '../../common/database/prisma.service';
import { CODING_AGENT_ADAPTER } from '../../adapters/interfaces/coding-agent-adapter.interface';
import type { CodingAgentAdapter } from '../../adapters/interfaces/coding-agent-adapter.interface';
import { CODE_HOST_ADAPTER } from '../../adapters/interfaces/code-host-adapter.interface';
import type { CodeHostAdapter } from '../../adapters/interfaces/code-host-adapter.interface';

@Injectable()
export class ReviewHandler implements PhaseHandler {
  private readonly logger = new Logger(ReviewHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CODING_AGENT_ADAPTER) private readonly codingAgent: CodingAgentAdapter,
    @Inject(CODE_HOST_ADAPTER) private readonly codeHost: CodeHostAdapter,
  ) {}

  async start(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Starting review phase for run ${workflowRun.id}`);

    const tasks = await this.prisma.task.findMany({
      where: {
        workflowRunId: workflowRun.id,
        status: 'PASSED',
      },
    });

    const phaseData = workflowRun.phaseData as Record<string, any>;

    const reviewData: Record<string, any> = {
      status: 'in_progress',
      prs: [],
      startedAt: new Date().toISOString(),
    };

    for (const task of tasks) {
      if (task.prUrl) {
        reviewData.prs.push({
          taskId: task.id,
          prUrl: task.prUrl,
          reviewStatus: 'pending',
        });

        try {
          await this.codingAgent.spawn({
            prompt: `Review the pull request at ${task.prUrl}. Check for:
1. Code quality and adherence to project conventions
2. Test coverage
3. Security vulnerabilities
4. Performance implications
5. Documentation completeness

Provide actionable review comments.`,
            workingDirectory: '.',
            timeout: 300000,
          });
        } catch (err) {
          this.logger.warn(`Failed to spawn review agent for PR ${task.prUrl}: ${(err as Error).message}`);
        }
      }
    }

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: { ...phaseData, review: reviewData },
      },
    });
  }

  async handleEvent(
    workflowRun: WorkflowRun,
    event: PhaseEvent,
  ): Promise<void> {
    this.logger.log(
      `Review event for run ${workflowRun.id}: ${event.type}`,
    );

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const review = phaseData.review ?? { prs: [] };

    if (event.type === 'review_submitted') {
      const prUrl = event.payload.prUrl as string;
      const pr = review.prs.find(
        (p: { prUrl: string }) => p.prUrl === prUrl,
      );
      if (pr) {
        pr.reviewStatus = event.payload.approved ? 'approved' : 'changes_requested';
        pr.reviewComments = event.payload.comments;
      }

      if (!event.payload.approved) {
        const taskId = pr?.taskId;
        if (taskId) {
          const task = await this.prisma.task.findUnique({
            where: { id: taskId },
          });

          if (task) {
            try {
              await this.codingAgent.spawn({
                prompt: `Address the following review comments on branch ${task.branch}:\n\n${JSON.stringify(event.payload.comments, null, 2)}`,
                workingDirectory: '.',
                timeout: 300000,
              });
            } catch (err) {
              this.logger.warn(`Failed to spawn agent to address review comments for task ${taskId}: ${(err as Error).message}`);
            }
          }
        }
      }

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: { ...phaseData, review },
        },
      });
    }

    if (event.type === 'pr_merged') {
      const prUrl = event.payload.prUrl as string;
      const pr = review.prs.find(
        (p: { prUrl: string }) => p.prUrl === prUrl,
      );
      if (pr) {
        pr.reviewStatus = 'merged';
        pr.mergedAt = new Date().toISOString();
      }

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: { ...phaseData, review },
        },
      });

      // Check if all PRs are merged, signaling phase completion
      const allMerged = review.prs.every(
        (p: { reviewStatus: string }) => p.reviewStatus === 'merged',
      );

      if (allMerged && review.prs.length > 0) {
        review.status = 'completed';
        review.completedAt = new Date().toISOString();

        await this.prisma.workflowRun.update({
          where: { id: workflowRun.id },
          data: {
            phaseData: { ...phaseData, review },
          },
        });

        this.logger.log(
          `All PRs merged for run ${workflowRun.id}, review phase complete`,
        );
      }
    }
  }

  async getStatus(workflowRun: WorkflowRun): Promise<PhaseStatus> {
    const phaseData = workflowRun.phaseData as Record<string, any>;
    const review = phaseData.review ?? { prs: [] };

    const total = review.prs.length;
    const merged = review.prs.filter(
      (p: { reviewStatus: string }) => p.reviewStatus === 'merged',
    ).length;

    return {
      phase: 'review',
      progress: total > 0 ? (merged / total) * 100 : 0,
      details: {
        totalPRs: total,
        merged,
        approved: review.prs.filter(
          (p: { reviewStatus: string }) => p.reviewStatus === 'approved',
        ).length,
        changesRequested: review.prs.filter(
          (p: { reviewStatus: string }) => p.reviewStatus === 'changes_requested',
        ).length,
        pending: review.prs.filter(
          (p: { reviewStatus: string }) => p.reviewStatus === 'pending',
        ).length,
      },
    };
  }

  async complete(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Completing review phase for run ${workflowRun.id}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const review = phaseData.review ?? {};
    review.status = 'completed';
    review.completedAt = new Date().toISOString();

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: { ...phaseData, review },
      },
    });
  }
}
