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
import { PM_ADAPTER } from '../../adapters/interfaces/pm-adapter.interface';
import type { PMAdapter } from '../../adapters/interfaces/pm-adapter.interface';

interface ReviewOutput {
  approved: boolean;
  comments: Array<{ file: string; line: number; body: string }>;
  summary: string;
}

interface PRReviewState {
  taskId: string;
  prUrl: string;
  prNumber: number;
  reviewStatus: 'pending' | 'approved' | 'changes_requested' | 'merged';
  reviewComments?: any[];
  mergedAt?: string;
}

@Injectable()
export class ReviewHandler implements PhaseHandler {
  private readonly logger = new Logger(ReviewHandler.name);

  constructor(
    private readonly prisma: PrismaService,
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

  async start(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Starting review phase for run ${workflowRun.id}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const repo = phaseData.repo ?? phaseData.planning?.repo ?? '';
    const planning = phaseData.planning ?? {};
    const planTasks = (planning.tasks ?? []) as Array<{
      title: string;
      description: string;
      acceptanceCriteria: string[];
    }>;

    // Load all tasks with PRs from DB
    const tasks = await this.prisma.task.findMany({
      where: {
        workflowRunId: workflowRun.id,
        status: 'PASSED',
        prUrl: { not: null },
      },
    });

    const reviewData: {
      status: string;
      prs: PRReviewState[];
      startedAt: string;
    } = {
      status: 'reviewing',
      prs: [],
      startedAt: new Date().toISOString(),
    };

    for (const task of tasks) {
      if (!task.prUrl) continue;

      // Extract PR number from URL
      const prNumberMatch = task.prUrl.match(/\/pull\/(\d+)/);
      const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : 0;

      // Find the matching plan task for context
      const planTask = planTasks.find(
        (pt) =>
          task.ticketId.includes(pt.title.toLowerCase().replace(/\s+/g, '-')) ||
          pt.title === task.ticketId,
      );

      const prState: PRReviewState = {
        taskId: task.id,
        prUrl: task.prUrl,
        prNumber,
        reviewStatus: 'pending',
      };
      reviewData.prs.push(prState);

      // Spawn reviewer coding agent
      const projectContext = this.getProjectContext(workflowRun);
      const reviewPrompt = `${projectContext}Review this pull request. Check for:
- Code correctness and potential bugs
- Adherence to the specification
- Code style and best practices
- Missing tests or edge cases

PR URL: ${task.prUrl}
Task description: ${planTask?.description ?? task.ticketId}
Acceptance criteria: ${planTask?.acceptanceCriteria?.join(', ') ?? 'N/A'}

Post your review comments as structured JSON:
{
  "approved": boolean,
  "comments": [{ "file": "path", "line": number, "body": "comment" }],
  "summary": "string"
}`;

      try {
        const agentInstance = await this.codingAgent.spawn({
          prompt: reviewPrompt,
          workingDirectory: '.',
          timeout: 300000,
        });

        const rawOutput = await this.codingAgent.getOutput(agentInstance.id);

        // Parse review output
        const jsonMatch = rawOutput.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [
          null,
          rawOutput,
        ];
        const review: ReviewOutput = JSON.parse(jsonMatch[1]!.trim());

        // Post inline comments via CodeHostAdapter
        for (const comment of review.comments) {
          try {
            await this.codeHost.addReviewComment(repo, prNumber, {
              body: comment.body,
              path: comment.file,
              line: comment.line,
            });
          } catch (err) {
            this.logger.warn(
              `Failed to post inline comment on PR #${prNumber}: ${(err as Error).message}`,
            );
          }
        }

        // Post summary as PR comment
        try {
          const summaryBody = [
            `## Orchestra Code Review`,
            ``,
            `**Verdict:** ${review.approved ? 'Approved' : 'Changes Requested'}`,
            ``,
            review.summary,
            ``,
            `*${review.comments.length} inline comment(s) posted.*`,
          ].join('\n');

          await this.codeHost.addPRComment(repo, prNumber, summaryBody);
        } catch (err) {
          this.logger.warn(
            `Failed to post PR summary comment on PR #${prNumber}: ${(err as Error).message}`,
          );
        }

        prState.reviewStatus = review.approved ? 'approved' : 'changes_requested';
        prState.reviewComments = review.comments;
      } catch (err) {
        this.logger.warn(
          `Failed to spawn review agent for PR ${task.prUrl}: ${(err as Error).message}`,
        );
      }
    }

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: { ...phaseData, review: reviewData } as any,
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
    const repo = phaseData.repo ?? phaseData.planning?.repo ?? '';

    if (event.type === 'review_submitted' || event.type === 'pr.reviewed') {
      const prUrl = event.payload.prUrl as string;
      const pr = (review.prs as PRReviewState[]).find(
        (p) => p.prUrl === prUrl,
      );
      if (!pr) return;

      const isApproved = event.payload.approved as boolean;

      if (isApproved) {
        // Mark PR as ready for human review
        pr.reviewStatus = 'approved';

        await this.prisma.workflowRun.update({
          where: { id: workflowRun.id },
          data: {
            phaseData: { ...phaseData, review },
          },
        });
      } else {
        // Spawn executor agent to address review comments
        pr.reviewStatus = 'changes_requested';
        pr.reviewComments = event.payload.comments as any[];

        const task = await this.prisma.task.findUnique({
          where: { id: pr.taskId },
        });

        if (task) {
          try {
            const fixPrompt = `Address the following review comments on branch ${task.branch}:\n\n${JSON.stringify(event.payload.comments, null, 2)}\n\nFix all issues and push the changes.`;

            const agentInstance = await this.codingAgent.spawn({
              prompt: fixPrompt,
              workingDirectory: '.',
              timeout: 300000,
            });

            // Wait for executor to finish, then re-trigger reviewer
            try {
              await this.codingAgent.getOutput(agentInstance.id);
            } catch (outputErr) {
              this.logger.warn(
                `Failed to get fix agent output: ${(outputErr as Error).message}`,
              );
            }

            // Re-trigger reviewer agent for the same PR
            const planTasks = ((phaseData.planning ?? {}).tasks ?? []) as Array<{
              title: string;
              description: string;
              acceptanceCriteria: string[];
            }>;
            const planTask = planTasks.find(
              (pt) =>
                task.ticketId.includes(
                  pt.title.toLowerCase().replace(/\s+/g, '-'),
                ) || pt.title === task.ticketId,
            );

            const reReviewProjectContext = this.getProjectContext(workflowRun);
            const reReviewPrompt = `${reReviewProjectContext}Review this pull request again after changes were made. Check for:
- Code correctness and potential bugs
- Adherence to the specification
- Code style and best practices
- Missing tests or edge cases

PR URL: ${pr.prUrl}
Task description: ${planTask?.description ?? task.ticketId}
Acceptance criteria: ${planTask?.acceptanceCriteria?.join(', ') ?? 'N/A'}

Post your review comments as structured JSON:
{
  "approved": boolean,
  "comments": [{ "file": "path", "line": number, "body": "comment" }],
  "summary": "string"
}`;

            try {
              const reviewAgent = await this.codingAgent.spawn({
                prompt: reReviewPrompt,
                workingDirectory: '.',
                timeout: 300000,
              });

              const rawOutput = await this.codingAgent.getOutput(reviewAgent.id);
              const jsonMatch = rawOutput.match(
                /```(?:json)?\s*([\s\S]*?)```/,
              ) ?? [null, rawOutput];
              const reviewResult: ReviewOutput = JSON.parse(
                jsonMatch[1]!.trim(),
              );

              // Post new inline comments
              for (const comment of reviewResult.comments) {
                try {
                  await this.codeHost.addReviewComment(repo, pr.prNumber, {
                    body: comment.body,
                    path: comment.file,
                    line: comment.line,
                  });
                } catch (err) {
                  this.logger.warn(
                    `Failed to post re-review inline comment: ${(err as Error).message}`,
                  );
                }
              }

              try {
                await this.codeHost.addPRComment(
                  repo,
                  pr.prNumber,
                  `## Orchestra Re-Review\n\n**Verdict:** ${reviewResult.approved ? 'Approved' : 'Changes Requested'}\n\n${reviewResult.summary}`,
                );
              } catch (err) {
                this.logger.warn(
                  `Failed to post re-review summary: ${(err as Error).message}`,
                );
              }

              pr.reviewStatus = reviewResult.approved
                ? 'approved'
                : 'changes_requested';
              pr.reviewComments = reviewResult.comments;
            } catch (reReviewErr) {
              this.logger.warn(
                `Failed to spawn re-review agent: ${(reReviewErr as Error).message}`,
              );
            }
          } catch (err) {
            this.logger.warn(
              `Failed to spawn executor agent to address comments for task ${pr.taskId}: ${(err as Error).message}`,
            );
          }
        }

        await this.prisma.workflowRun.update({
          where: { id: workflowRun.id },
          data: {
            phaseData: { ...phaseData, review },
          },
        });
      }
    }

    if (event.type === 'pr_merged' || event.type === 'pr.merged') {
      const prUrl = event.payload.prUrl as string;
      const pr = (review.prs as PRReviewState[]).find(
        (p) => p.prUrl === prUrl,
      );
      if (pr) {
        pr.reviewStatus = 'merged';
        pr.mergedAt = new Date().toISOString();

        // Update the task status in DB
        try {
          await this.prisma.task.update({
            where: { id: pr.taskId },
            data: { status: 'PASSED' }, // Keep as PASSED; merged is tracked in review data
          });
        } catch (err) {
          this.logger.warn(
            `Failed to update task status after merge: ${(err as Error).message}`,
          );
        }

        // Update Jira ticket status to Done
        const task = await this.prisma.task.findUnique({
          where: { id: pr.taskId },
        });

        if (task) {
          try {
            const transitions = await this.pm.getTransitions(task.ticketId);
            const doneTransition = transitions.find(
              (t) =>
                t.name.toLowerCase().includes('done') ||
                t.to.toLowerCase().includes('done'),
            );
            if (doneTransition) {
              await this.pm.transitionTicket(task.ticketId, doneTransition.id);
            }
          } catch (err) {
            this.logger.warn(
              `Failed to transition ticket ${task.ticketId} to Done: ${(err as Error).message}`,
            );
          }
        }
      }

      // Check if all PRs merged
      const allMerged = (review.prs as PRReviewState[]).every(
        (p) => p.reviewStatus === 'merged',
      );

      if (allMerged && review.prs.length > 0) {
        review.status = 'completed';
        review.completedAt = new Date().toISOString();
        review.readyForCompletion = true;

        this.logger.log(
          `All PRs merged for run ${workflowRun.id}, review phase complete`,
        );
      }

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: { ...phaseData, review },
        },
      });
    }
  }

  async getStatus(workflowRun: WorkflowRun): Promise<PhaseStatus> {
    const phaseData = workflowRun.phaseData as Record<string, any>;
    const review = phaseData.review ?? { prs: [] };

    const prs = review.prs as PRReviewState[];
    const total = prs.length;
    const merged = prs.filter((p) => p.reviewStatus === 'merged').length;

    return {
      phase: 'review',
      progress: total > 0 ? (merged / total) * 100 : 0,
      details: {
        totalPRs: total,
        merged,
        approved: prs.filter((p) => p.reviewStatus === 'approved').length,
        changesRequested: prs.filter(
          (p) => p.reviewStatus === 'changes_requested',
        ).length,
        pending: prs.filter((p) => p.reviewStatus === 'pending').length,
      },
    };
  }

  async complete(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Completing review phase for run ${workflowRun.id}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const review = phaseData.review ?? { prs: [] };
    const prs = review.prs as PRReviewState[];

    review.status = 'completed';
    review.completedAt = new Date().toISOString();

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: { ...phaseData, review },
      },
    });

    // Post summary to Jira
    const mergedCount = prs.filter((p) => p.reviewStatus === 'merged').length;

    try {
      await this.pm.addComment(
        workflowRun.ticketId,
        `Review phase completed. ${mergedCount}/${prs.length} PRs merged successfully.`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to post review completion comment to Jira: ${(err as Error).message}`,
      );
    }

    // Update all related ticket statuses to Done
    const tasks = await this.prisma.task.findMany({
      where: { workflowRunId: workflowRun.id },
    });

    for (const task of tasks) {
      try {
        const transitions = await this.pm.getTransitions(task.ticketId);
        const doneTransition = transitions.find(
          (t) =>
            t.name.toLowerCase().includes('done') ||
            t.to.toLowerCase().includes('done'),
        );
        if (doneTransition) {
          await this.pm.transitionTicket(task.ticketId, doneTransition.id);
        }
      } catch (err) {
        this.logger.warn(
          `Failed to transition ticket ${task.ticketId} to Done: ${(err as Error).message}`,
        );
      }
    }
  }
}
