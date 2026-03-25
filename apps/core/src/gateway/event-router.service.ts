import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';

export interface InboundEvent {
  provider: string;
  eventType: string;
  payload: Record<string, unknown>;
  ticketId?: string;
  prUrl?: string;
}

@Injectable()
export class EventRouterService {
  private readonly logger = new Logger(EventRouterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowService: WorkflowService,
  ) {}

  async route(event: InboundEvent): Promise<void> {
    this.logger.log(
      `Routing event from ${event.provider}: ${event.eventType}`,
    );

    const workflowRun = await this.findTargetWorkflow(event);

    if (!workflowRun) {
      this.logger.warn(
        `No active workflow found for event: ${JSON.stringify({
          provider: event.provider,
          eventType: event.eventType,
          ticketId: event.ticketId,
          prUrl: event.prUrl,
        })}`,
      );
      return;
    }

    await this.prisma.auditLog.create({
      data: {
        workflowRunId: workflowRun.id,
        action: `webhook.${event.provider}.${event.eventType}`,
        actor: event.provider,
        details: event.payload as any,
      },
    });

    this.logger.log(
      `Routed ${event.provider}:${event.eventType} to workflow ${workflowRun.id}`,
    );
  }

  private async findTargetWorkflow(event: InboundEvent) {
    if (event.ticketId) {
      const runs = await this.prisma.workflowRun.findMany({
        where: {
          ticketId: event.ticketId,
          state: { notIn: ['DONE', 'FAILED'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      return runs[0] ?? null;
    }

    if (event.prUrl) {
      const task = await this.prisma.task.findFirst({
        where: { prUrl: event.prUrl },
        include: { workflowRun: true },
      });
      return task?.workflowRun ?? null;
    }

    return null;
  }

  extractTicketId(provider: string, payload: Record<string, unknown>): string | undefined {
    switch (provider) {
      case 'jira': {
        const issue = payload.issue as Record<string, unknown> | undefined;
        return issue?.key as string | undefined;
      }
      case 'github': {
        const prBody = (payload.pull_request as Record<string, unknown>)?.body as string | undefined;
        const match = prBody?.match(/([A-Z]+-\d+)/);
        return match?.[1];
      }
      case 'slack': {
        const text = payload.text as string | undefined;
        const match = text?.match(/([A-Z]+-\d+)/);
        return match?.[1];
      }
      default:
        return undefined;
    }
  }

  extractPrUrl(provider: string, payload: Record<string, unknown>): string | undefined {
    if (provider === 'github') {
      const pr = payload.pull_request as Record<string, unknown> | undefined;
      return pr?.html_url as string | undefined;
    }
    return undefined;
  }
}
