import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  PhaseHandler,
  PhaseEvent,
  PhaseStatus,
} from '../phase-handler.interface';
import { WorkflowRun } from '../../workflow/entities/workflow.entity';
import { PrismaService } from '../../common/database/prisma.service';
import { ConflictDetectorService } from './conflict-detector.service';
import { CHANNEL_ADAPTER } from '../../adapters/interfaces/channel-adapter.interface';
import type { ChannelAdapter } from '../../adapters/interfaces/channel-adapter.interface';

@Injectable()
export class InterviewHandler implements PhaseHandler {
  private readonly logger = new Logger(InterviewHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conflictDetector: ConflictDetectorService,
    @Inject(CHANNEL_ADAPTER) private readonly channel: ChannelAdapter,
  ) {}

  async start(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Starting interview phase for run ${workflowRun.id}`);

    const initialQuestions = [
      'What is the desired outcome of this change?',
      'Are there any constraints or deadlines?',
      'Who are the stakeholders that should be consulted?',
      'Are there any related tickets or prior work?',
      'What are the acceptance criteria?',
    ];

    await this.channel.sendMessage({
      threadId: workflowRun.ticketId,
      content: `Starting requirements interview for ticket ${workflowRun.ticketId}:\n\n${initialQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
    });

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: {
          ...(workflowRun.phaseData as Record<string, unknown>),
          interview: {
            questions: initialQuestions,
            responses: [],
            conflicts: [],
            status: 'awaiting_responses',
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
      `Interview event for run ${workflowRun.id}: ${event.type}`,
    );

    if (event.type === 'message') {
      const phaseData = workflowRun.phaseData as Record<string, any>;
      const interview = phaseData.interview ?? {
        responses: [],
        conflicts: [],
      };

      const response = {
        from: event.source,
        content: event.payload.content as string,
        timestamp: event.timestamp,
      };

      interview.responses.push(response);

      const conflicts = await this.conflictDetector.detectConflicts(
        interview.responses,
      );
      interview.conflicts = conflicts;

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: {
            ...phaseData,
            interview,
          },
        },
      });

      if (conflicts.length > 0) {
        await this.channel.sendMessage({
          threadId: workflowRun.ticketId,
          content: `Potential conflicts detected:\n${conflicts.map((c: { description: string }) => `- ${c.description}`).join('\n')}\n\nPlease clarify these points.`,
        });
      }
    }
  }

  async getStatus(workflowRun: WorkflowRun): Promise<PhaseStatus> {
    const phaseData = workflowRun.phaseData as Record<string, any>;
    const interview = phaseData.interview ?? {};

    return {
      phase: 'interview',
      progress: interview.responses?.length
        ? Math.min(
            (interview.responses.length / interview.questions?.length) * 100,
            100,
          )
        : 0,
      details: {
        totalQuestions: interview.questions?.length ?? 0,
        responsesReceived: interview.responses?.length ?? 0,
        conflictsDetected: interview.conflicts?.length ?? 0,
        status: interview.status ?? 'not_started',
      },
    };
  }

  async complete(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Completing interview phase for run ${workflowRun.id}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const interview = phaseData.interview ?? {};

    interview.status = 'completed';
    interview.completedAt = new Date().toISOString();

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: {
          ...phaseData,
          interview,
        },
      },
    });
  }
}
