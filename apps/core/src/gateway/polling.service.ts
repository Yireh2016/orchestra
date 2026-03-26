import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/database/prisma.service';
import {
  PM_ADAPTER,
  PMAdapter,
} from '../adapters/interfaces/pm-adapter.interface';
import {
  CODE_HOST_ADAPTER,
  CodeHostAdapter,
} from '../adapters/interfaces/code-host-adapter.interface';
import { EventRouterService } from './event-router.service';
import { WorkflowOrchestratorService } from '../workflow/workflow-orchestrator.service';
import { EventBusService } from '../events/event-bus.service';

@Injectable()
export class PollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PollingService.name);
  private intervals: NodeJS.Timeout[] = [];
  private pollIntervalMs: number;
  private enabled: boolean;
  private lastPollAt: Date | null = null;

  // Track last-seen timestamps/IDs per workflow to avoid re-processing events
  // Key: `${provider}:${ticketId}` or `${provider}:${prUrl}`
  private lastSeen = new Map<string, string>(); // key -> last comment ID or timestamp

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(PM_ADAPTER) private readonly pm: PMAdapter,
    @Inject(CODE_HOST_ADAPTER) private readonly codeHost: CodeHostAdapter,
    private readonly eventRouter: EventRouterService,
    private readonly orchestrator: WorkflowOrchestratorService,
    private readonly eventBus: EventBusService,
  ) {
    this.pollIntervalMs = configService.get<number>('POLL_INTERVAL_MS', 15000);
    this.enabled = configService.get<string>('POLLING_ENABLED', 'true') !== 'false';
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Polling is disabled');
      return;
    }
    this.logger.log(`Polling enabled — interval: ${this.pollIntervalMs}ms`);

    // Start polling after a short delay to let the app initialize
    setTimeout(() => this.startPolling(), 5000);
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  // ---- Public API for PollingController ----

  getStatus() {
    return {
      enabled: this.enabled,
      intervalMs: this.pollIntervalMs,
      activePollers: this.intervals.length,
      lastPollAt: this.lastPollAt?.toISOString() ?? null,
    };
  }

  start() {
    if (this.intervals.length > 0) {
      this.logger.warn('Polling is already running');
      return;
    }
    this.enabled = true;
    this.startPolling();
  }

  stop() {
    this.enabled = false;
    this.stopPolling();
  }

  updateInterval(intervalMs: number) {
    if (intervalMs < 1000) {
      throw new Error('Poll interval must be at least 1000ms');
    }
    this.pollIntervalMs = intervalMs;

    // Restart polling with the new interval if currently active
    if (this.intervals.length > 0) {
      this.stopPolling();
      this.startPolling();
    }
  }

  // ---- Internal polling lifecycle ----

  private startPolling() {
    // Poll for Jira events (comments on active workflows)
    const jiraInterval = setInterval(() => this.pollJira(), this.pollIntervalMs);
    this.intervals.push(jiraInterval);

    // Poll for GitHub events (PR comments, reviews, merges)
    const githubInterval = setInterval(
      () => this.pollGitHub(),
      this.pollIntervalMs,
    );
    this.intervals.push(githubInterval);

    this.logger.log('Polling started for Jira and GitHub');
  }

  private stopPolling() {
    this.intervals.forEach((i) => clearInterval(i));
    this.intervals = [];
    this.logger.log('Polling stopped');
  }

  // ---- Jira polling ----

  private async pollJira() {
    try {
      // Find all active workflows in states that expect Jira comments
      const activeRuns = await this.prisma.workflowRun.findMany({
        where: {
          state: { in: ['INTERVIEWING', 'PLANNING', 'EXECUTING', 'REVIEWING'] },
        },
      });

      for (const run of activeRuns) {
        try {
          await this.checkJiraComments(run);
        } catch (err) {
          this.logger.warn(
            `Failed to poll Jira for ${run.ticketId}: ${(err as Error).message}`,
          );
        }

        // Check if phase is ready to advance (e.g., interview approved)
        try {
          await this.checkPhaseCompletion(run);
        } catch (err) {
          this.logger.warn(
            `Failed phase completion check for ${run.id}: ${(err as Error).message}`,
          );
        }
      }

      this.lastPollAt = new Date();
    } catch (err) {
      this.logger.warn(`Jira polling cycle failed: ${(err as Error).message}`);
    }
  }

  private async checkJiraComments(run: any) {
    const ticketId = run.ticketId;
    const key = `jira:comments:${ticketId}`;

    // Read lastSeen from DB (phaseData._polling) for crash resilience
    const phaseData = (run.phaseData ?? {}) as Record<string, any>;
    const pollingState = phaseData._polling ?? {};
    const lastSeenId = this.lastSeen.get(key) ?? pollingState[key] ?? null;

    // Fetch comments from Jira
    const comments = await this.pm.getComments(ticketId);
    if (!comments.length) return;

    // Find new comments (after the last one we've seen)
    let newComments = comments;
    if (lastSeenId) {
      const lastIdx = comments.findIndex((c) => c.id === lastSeenId);
      if (lastIdx >= 0) {
        newComments = comments.slice(lastIdx + 1);
      }
    } else {
      // First poll — only process comments created after the workflow started
      const runCreated = new Date(run.createdAt);
      newComments = comments.filter((c) => new Date(c.createdAt) > runCreated);
    }

    if (!newComments.length) return;

    // Update last seen — both in-memory and in DB for crash resilience
    const latestId = newComments[newComments.length - 1].id;
    this.lastSeen.set(key, latestId);
    try {
      const freshRun = await this.prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } });
      const freshPhaseData = (freshRun.phaseData ?? {}) as Record<string, any>;
      freshPhaseData._polling = { ...(freshPhaseData._polling ?? {}), [key]: latestId };
      await this.prisma.workflowRun.update({ where: { id: run.id }, data: { phaseData: freshPhaseData as any } });
    } catch (err) {
      this.logger.warn(`Failed to persist polling state for ${ticketId}: ${(err as Error).message}`);
    }

    // Route each new comment as an event
    for (const comment of newComments) {
      // Skip comments posted by Orchestra itself (avoid feedback loop)
      if (this.isOrchestraComment(comment.body)) continue;

      const event = {
        provider: 'jira',
        eventType: 'ticket.commented',
        ticketId,
        payload: {
          comment: {
            id: comment.id,
            author: comment.author,
            body: comment.body,
            createdAt: comment.createdAt,
          },
          issue: { key: ticketId },
        },
      };

      this.logger.log(
        `Polled new Jira comment on ${ticketId} by ${comment.author}`,
      );

      // Route through the event router -> orchestrator
      const routed = await this.eventRouter.routeAndGetTarget(event);
      if (routed) {
        await this.orchestrator.handleEvent(routed.workflowRunId, {
          type: 'ticket.commented',
          source: 'jira-polling',
          payload: event.payload,
          timestamp: new Date(),
        });

        this.eventBus.emit({
          type: 'poll.event_detected',
          workflowRunId: routed.workflowRunId,
          payload: {
            provider: 'jira',
            eventType: 'ticket.commented',
            ticketId,
          },
        });
      }
    }
  }

  // ---- GitHub polling ----

  private async pollGitHub() {
    try {
      // Find all active workflows in REVIEWING or EXECUTING state with PRs
      const activeRuns = await this.prisma.workflowRun.findMany({
        where: { state: { in: ['EXECUTING', 'REVIEWING'] } },
      });

      for (const run of activeRuns) {
        try {
          await this.checkGitHubPRs(run);
        } catch (err) {
          this.logger.warn(
            `Failed to poll GitHub for workflow ${run.id}: ${(err as Error).message}`,
          );
        }
      }

      this.lastPollAt = new Date();
    } catch (err) {
      this.logger.warn(
        `GitHub polling cycle failed: ${(err as Error).message}`,
      );
    }
  }

  private async checkGitHubPRs(run: any) {
    // Get tasks with PR URLs for this workflow
    const tasks = await this.prisma.task.findMany({
      where: { workflowRunId: run.id, prUrl: { not: null } },
    });

    for (const task of tasks) {
      if (!task.prUrl) continue;

      try {
        // Extract repo and PR number from URL
        // URL format: https://github.com/owner/repo/pull/123
        const match = task.prUrl.match(
          /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/,
        );
        if (!match) continue;
        const [, repo, prNumberStr] = match;
        const prNumber = parseInt(prNumberStr, 10);

        // Check PR state
        const pr = await this.codeHost.getPullRequest(repo, prNumber);

        // Check for merge
        if (pr.state === 'merged') {
          const mergeKey = `github:merged:${task.prUrl}`;
          if (this.lastSeen.has(mergeKey)) continue; // Already processed
          this.lastSeen.set(mergeKey, 'true');

          this.logger.log(`Polled PR merge: ${task.prUrl}`);

          await this.orchestrator.handleEvent(run.id, {
            type: 'pr_merged',
            source: 'github-polling',
            payload: { prUrl: task.prUrl, taskId: task.id, prNumber, repo },
            timestamp: new Date(),
          });

          this.eventBus.emit({
            type: 'poll.event_detected',
            workflowRunId: run.id,
            payload: {
              provider: 'github',
              eventType: 'pr_merged',
              prUrl: task.prUrl,
            },
          });
        }

        // Check for new review comments
        const commentsKey = `github:comments:${task.prUrl}`;
        const lastCommentId = this.lastSeen.get(commentsKey);
        const reviewComments = await this.codeHost.getReviewComments(
          repo,
          prNumber,
        );

        if (reviewComments.length) {
          let newComments = reviewComments;
          if (lastCommentId) {
            const lastIdx = reviewComments.findIndex(
              (c) => c.id === lastCommentId,
            );
            if (lastIdx >= 0) newComments = reviewComments.slice(lastIdx + 1);
          }

          if (newComments.length) {
            this.lastSeen.set(
              commentsKey,
              newComments[newComments.length - 1].id,
            );

            // Only emit if there are human comments (not from our bot)
            const humanComments = newComments.filter(
              (c) => !this.isOrchestraComment(c.body),
            );
            if (humanComments.length) {
              this.logger.log(
                `Polled ${humanComments.length} new PR comments on ${task.prUrl}`,
              );

              await this.orchestrator.handleEvent(run.id, {
                type: 'pr.reviewed',
                source: 'github-polling',
                payload: {
                  prUrl: task.prUrl,
                  taskId: task.id,
                  comments: humanComments,
                  prNumber,
                  repo,
                },
                timestamp: new Date(),
              });
            }
          }
        }
      } catch (err) {
        this.logger.warn(
          `Failed to poll PR ${task.prUrl}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ---- Deduplication helpers ----

  /**
   * Detect comments posted by Orchestra to avoid feedback loops.
   *
   * Prefixes are derived from the phase handlers:
   * - InterviewHandler: "**Requirements Interview**", "**Conflict Detected**",
   *   "**Follow-up Questions**", "**Draft Specification**",
   *   "**Interview Complete - Final Specification**"
   * - ResearchHandler: "**Research Phase Started**", "**Research Phase Complete**"
   * - ReviewHandler: "## Orchestra Code Review", "## Orchestra Re-Review",
   *   "Review phase completed."
   * - HTML marker: "<!-- orchestra-bot -->"
   */
  /**
   * Check if a workflow's current phase is ready to advance.
   * Called after processing comments to detect approval signals.
   */
  private async checkPhaseCompletion(run: any) {
    const freshRun = await this.prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } });
    const phaseData = (freshRun.phaseData ?? {}) as Record<string, any>;

    // Interview phase: auto-advance when spec is approved
    if (freshRun.state === 'INTERVIEWING' && phaseData.interview?.status === 'approved') {
      const key = `phase-complete:${run.id}:interview`;
      if (this.lastSeen.has(key)) return; // Already triggered
      this.lastSeen.set(key, 'true');

      this.logger.log(`Interview approved for workflow ${run.id} — triggering phase completion`);
      await this.orchestrator.completeCurrentPhase(run.id);
    }

    // Planning phase: auto-advance when plan is approved
    if (freshRun.state === 'PLANNING' && phaseData.planning?.status === 'approved') {
      const key = `phase-complete:${run.id}:planning`;
      if (this.lastSeen.has(key)) return;
      this.lastSeen.set(key, 'true');

      this.logger.log(`Plan approved for workflow ${run.id} — triggering phase completion`);
      await this.orchestrator.completeCurrentPhase(run.id);
    }

    // Review phase: auto-advance when all PRs are merged
    if (freshRun.state === 'REVIEWING' && phaseData.review?.status === 'completed') {
      const key = `phase-complete:${run.id}:review`;
      if (this.lastSeen.has(key)) return;
      this.lastSeen.set(key, 'true');

      this.logger.log(`All PRs merged for workflow ${run.id} — triggering phase completion`);
      await this.orchestrator.completeCurrentPhase(run.id);
    }
  }

  private isOrchestraComment(body: string): boolean {
    const orchestraPrefixes = [
      '**Requirements Interview**',
      '**Conflict Detected**',
      '**Follow-up Questions**',
      '**Draft Specification**',
      '**Interview Complete**',
      '**Interview Complete - Final Specification**',
      '**Research Phase Started**',
      '**Research Phase Complete**',
      '## Orchestra Code Review',
      '## Orchestra Re-Review',
      'Review phase completed.',
      '<!-- orchestra-bot -->',
    ];
    return orchestraPrefixes.some((prefix) => body.startsWith(prefix));
  }
}
