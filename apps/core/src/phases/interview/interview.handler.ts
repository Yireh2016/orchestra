import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  PhaseHandler,
  PhaseEvent,
  PhaseStatus,
} from '../phase-handler.interface';
import { WorkflowRun } from '../../workflow/entities/workflow.entity';
import { PrismaService } from '../../common/database/prisma.service';
import { ConflictDetectorService } from './conflict-detector.service';
import { PM_ADAPTER } from '../../adapters/interfaces/pm-adapter.interface';
import type { PMAdapter } from '../../adapters/interfaces/pm-adapter.interface';

@Injectable()
export class InterviewHandler implements PhaseHandler {
  private readonly logger = new Logger(InterviewHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conflictDetector: ConflictDetectorService,
    @Inject(PM_ADAPTER) private readonly pmAdapter: PMAdapter,
  ) {}

  async start(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Starting interview phase for run ${workflowRun.id}`);

    const ticketId = workflowRun.ticketId;

    // Fetch ticket details to generate context-aware questions
    let ticketTitle = '';
    let ticketDescription = '';
    let ticketLabels: string[] = [];
    try {
      const ticket = await this.pmAdapter.getTicket(ticketId);
      ticketTitle = ticket.summary;
      ticketDescription = ticket.description;
      ticketLabels = ticket.labels ?? [];
    } catch (err) {
      this.logger.warn(
        `Failed to fetch ticket ${ticketId}: ${(err as Error).message}`,
      );
    }

    // Generate initial interview questions based on the ticket content
    const questions = this.generateInitialQuestions(
      ticketTitle,
      ticketDescription,
      ticketLabels,
    );

    const commentBody = [
      `**Requirements Interview** for *${ticketTitle || ticketId}*`,
      '',
      'I need to gather some information before we proceed. Please answer the following questions:',
      '',
      ...questions.map((q, i) => `${i + 1}. ${q}`),
      '',
      '_Reply to this comment with your answers. Tag additional stakeholders if needed._',
    ].join('\n');

    try {
      await this.pmAdapter.addComment(ticketId, commentBody);
    } catch (err) {
      this.logger.warn(
        `Failed to post interview questions to ${ticketId}: ${(err as Error).message}`,
      );
    }

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: {
          ...(workflowRun.phaseData as Record<string, unknown>),
          interview: {
            status: 'active',
            ticketId,
            questions,
            responses: [],
            spec: '',
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

    // Handle spec approval
    if (event.type === 'approve_spec' || event.type === 'interview_complete') {
      const phaseData = workflowRun.phaseData as Record<string, any>;
      const interview = phaseData.interview ?? {};

      interview.status = 'approved';
      interview.approvedBy = event.source;
      interview.approvedAt = new Date().toISOString();

      // Synthesize final spec from all responses if not already set
      if (!interview.spec) {
        interview.spec = this.synthesizeSpec(
          interview.questions ?? [],
          interview.responses ?? [],
        );
      }

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: { ...phaseData, interview },
        },
      });

      this.logger.log(
        `Interview phase approved for run ${workflowRun.id} by ${event.source}`,
      );
      return;
    }

    // Handle new Jira comment on the ticket
    if (event.type === 'ticket.commented') {
      const phaseData = workflowRun.phaseData as Record<string, any>;
      const interview = phaseData.interview ?? {
        questions: [],
        responses: [],
        spec: '',
      };

      // Handle both webhook format (payload.comment = string) and polling format (payload.comment = { body, author })
      const rawComment = event.payload.comment;
      const commentText = typeof rawComment === 'object' && rawComment !== null
        ? (rawComment as any).body ?? ''
        : (rawComment ?? event.payload.content ?? '') as string;
      const author = typeof rawComment === 'object' && rawComment !== null
        ? (rawComment as any).author ?? event.source
        : (event.payload.author ?? event.source) as string;

      const response = {
        author,
        content: commentText,
        timestamp: event.timestamp,
      };

      interview.responses = interview.responses ?? [];
      interview.responses.push(response);

      // Check for conflicts with previous responses
      const conflictResult = await this.conflictDetector.detectConflicts(
        interview.responses.map((r: any) => ({
          from: r.author,
          content: r.content,
          timestamp: r.timestamp,
        })),
      );

      if (conflictResult.hasConflict) {
        interview.status = 'paused_conflict';
        interview.conflicts = conflictResult.conflictingStatements;

        const conflictMessage = [
          '**Conflict Detected**',
          '',
          'The following statements appear to contradict each other:',
          '',
          ...conflictResult.conflictingStatements.map(
            (c: any) =>
              `- *${c.author1}* said: "${c.statement1}"\n  vs *${c.author2}* said: "${c.statement2}"\n  Reason: ${c.reason}`,
          ),
          '',
          '_Please clarify these points before we can proceed._',
        ].join('\n');

        try {
          await this.pmAdapter.addComment(workflowRun.ticketId, conflictMessage);
        } catch (err) {
          this.logger.warn(
            `Failed to post conflict notification: ${(err as Error).message}`,
          );
        }
      } else {
        // Analyze whether more questions are needed or spec is complete
        const allResponses = interview.responses as Array<{
          author: string;
          content: string;
        }>;
        const totalQuestions = (interview.questions ?? []).length;

        if (allResponses.length >= totalQuestions) {
          // Enough responses gathered; synthesize spec
          interview.spec = this.synthesizeSpec(
            interview.questions ?? [],
            allResponses,
          );
          interview.status = 'spec_ready';

          const specMessage = [
            '**Draft Specification**',
            '',
            interview.spec,
            '',
            '_Please review and reply with "approve" to proceed, or provide additional feedback._',
          ].join('\n');

          try {
            await this.pmAdapter.addComment(workflowRun.ticketId, specMessage);
          } catch (err) {
            this.logger.warn(
              `Failed to post draft spec: ${(err as Error).message}`,
            );
          }
        } else {
          // Generate follow-up questions based on responses so far
          const followUps = this.generateFollowUpQuestions(
            interview.questions ?? [],
            allResponses,
          );

          if (followUps.length > 0) {
            interview.questions = [
              ...(interview.questions ?? []),
              ...followUps,
            ];

            const followUpMessage = [
              '**Follow-up Questions**',
              '',
              ...followUps.map((q, i) => `${i + 1}. ${q}`),
            ].join('\n');

            try {
              await this.pmAdapter.addComment(
                workflowRun.ticketId,
                followUpMessage,
              );
            } catch (err) {
              this.logger.warn(
                `Failed to post follow-up questions: ${(err as Error).message}`,
              );
            }
          }
        }
      }

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: { ...phaseData, interview },
        },
      });
    }
  }

  async getStatus(workflowRun: WorkflowRun): Promise<PhaseStatus> {
    const phaseData = workflowRun.phaseData as Record<string, any>;
    const interview = phaseData.interview ?? {};

    const totalQuestions = interview.questions?.length ?? 0;
    const responsesReceived = interview.responses?.length ?? 0;

    let progress = 0;
    if (interview.status === 'approved' || interview.status === 'completed') {
      progress = 100;
    } else if (interview.status === 'spec_ready') {
      progress = 90;
    } else if (totalQuestions > 0) {
      progress = Math.min((responsesReceived / totalQuestions) * 80, 80);
    }

    return {
      phase: 'interview',
      progress,
      details: {
        totalQuestions,
        responsesReceived,
        conflictsDetected: interview.conflicts?.length ?? 0,
        status: interview.status ?? 'not_started',
        hasSpec: !!interview.spec,
      },
    };
  }

  async complete(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Completing interview phase for run ${workflowRun.id}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const interview = phaseData.interview ?? {};

    // Finalize spec if not already done
    if (!interview.spec && interview.responses?.length > 0) {
      interview.spec = this.synthesizeSpec(
        interview.questions ?? [],
        interview.responses,
      );
    }

    interview.status = 'completed';
    interview.completedAt = new Date().toISOString();

    // Post a summary comment to Jira with the finalized spec
    if (interview.spec) {
      const summaryComment = [
        '**Interview Complete - Final Specification**',
        '',
        interview.spec,
        '',
        '_This specification has been finalized and will be used for the next phases._',
      ].join('\n');

      try {
        await this.pmAdapter.addComment(workflowRun.ticketId, summaryComment);
      } catch (err) {
        this.logger.warn(
          `Failed to post final spec comment: ${(err as Error).message}`,
        );
      }

      // Update the Jira ticket description with the spec
      try {
        await this.pmAdapter.updateTicket(workflowRun.ticketId, {
          description: interview.spec,
        });
      } catch (err) {
        this.logger.warn(
          `Failed to update ticket description: ${(err as Error).message}`,
        );
      }
    }

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: { ...phaseData, interview },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private generateInitialQuestions(
    title: string,
    description: string,
    labels: string[],
  ): string[] {
    const questions: string[] = [];

    questions.push('What is the desired outcome of this change?');

    if (!description || description.length < 50) {
      questions.push(
        'Can you provide a more detailed description of what needs to be built?',
      );
    }

    questions.push('Are there any constraints, deadlines, or dependencies?');
    questions.push('Who are the stakeholders that should review this work?');

    if (!description?.toLowerCase().includes('acceptance criteria')) {
      questions.push('What are the acceptance criteria for this change?');
    }

    if (labels.length === 0) {
      questions.push(
        'What area of the system does this change affect (e.g., frontend, backend, infrastructure)?',
      );
    }

    questions.push('Are there any related tickets or prior work to reference?');

    return questions;
  }

  private generateFollowUpQuestions(
    existingQuestions: string[],
    responses: Array<{ author: string; content: string }>,
  ): string[] {
    const followUps: string[] = [];
    const allContent = responses.map((r) => r.content.toLowerCase()).join(' ');

    // If no one mentioned testing, ask about it
    if (
      !allContent.includes('test') &&
      !allContent.includes('qa') &&
      !allContent.includes('quality')
    ) {
      followUps.push(
        'Are there specific testing requirements or quality gates for this change?',
      );
    }

    // If no one mentioned rollback or risk
    if (
      !allContent.includes('rollback') &&
      !allContent.includes('risk') &&
      !allContent.includes('revert')
    ) {
      followUps.push(
        'What is the rollback plan if this change causes issues in production?',
      );
    }

    // If responses mention multiple systems, ask about integration
    const systemKeywords = [
      'api',
      'database',
      'frontend',
      'backend',
      'service',
      'queue',
      'cache',
    ];
    const mentionedSystems = systemKeywords.filter((kw) =>
      allContent.includes(kw),
    );
    if (mentionedSystems.length > 1) {
      followUps.push(
        `Multiple systems were mentioned (${mentionedSystems.join(', ')}). Are there specific integration points we should be careful about?`,
      );
    }

    return followUps;
  }

  private synthesizeSpec(
    questions: string[],
    responses: Array<{ author: string; content: string }>,
  ): string {
    const sections: string[] = [];

    sections.push('# Specification');
    sections.push('');

    sections.push('## Requirements');
    sections.push('');
    for (const response of responses) {
      sections.push(`- (${response.author}): ${response.content}`);
    }
    sections.push('');

    sections.push('## Questions Asked');
    sections.push('');
    for (const q of questions) {
      sections.push(`- ${q}`);
    }
    sections.push('');

    sections.push('## Stakeholders');
    sections.push('');
    const authors = [...new Set(responses.map((r) => r.author))];
    for (const author of authors) {
      sections.push(`- ${author}`);
    }

    return sections.join('\n');
  }
}
