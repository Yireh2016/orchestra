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

@Injectable()
export class ResearchHandler implements PhaseHandler {
  private readonly logger = new Logger(ResearchHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CODING_AGENT_ADAPTER) private readonly codingAgent: CodingAgentAdapter,
  ) {}

  async start(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Starting research phase for run ${workflowRun.id}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const interviewSummary = phaseData.interview?.responses
      ?.map((r: { content: string }) => r.content)
      .join('\n') ?? '';

    const prompt = `You are researching a codebase to prepare for implementing a feature.

Requirements from stakeholder interviews:
${interviewSummary}

Please explore the codebase and produce a research.md document that includes:
1. Relevant files and their purposes
2. Current architecture patterns used
3. Dependencies and their versions
4. Potential impact areas
5. Suggested approach based on existing patterns

Output the research document in markdown format.`;

    let agentInstanceId: string | null = null;
    try {
      const agentInstance = await this.codingAgent.spawn({
        prompt,
        workingDirectory: '.',
        timeout: 300000,
      });
      agentInstanceId = agentInstance.id;
    } catch (err) {
      this.logger.warn(`Failed to spawn coding agent for research: ${(err as Error).message}`);
    }

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: {
          ...phaseData,
          research: {
            agentInstanceId,
            status: agentInstanceId ? 'running' : 'agent_unavailable',
            startedAt: new Date().toISOString(),
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
      `Research event for run ${workflowRun.id}: ${event.type}`,
    );

    if (event.type === 'agent_completed') {
      const phaseData = workflowRun.phaseData as Record<string, any>;
      const research = phaseData.research ?? {};

      research.status = 'completed';
      research.output = event.payload.output as string;
      research.completedAt = new Date().toISOString();

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: { ...phaseData, research },
        },
      });
    }

    if (event.type === 'agent_failed') {
      const phaseData = workflowRun.phaseData as Record<string, any>;
      const research = phaseData.research ?? {};

      research.status = 'failed';
      research.error = event.payload.error as string;

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: { ...phaseData, research },
        },
      });
    }

    if (event.type === 'research_complete') {
      const phaseData = workflowRun.phaseData as Record<string, any>;
      const research = phaseData.research ?? {};

      research.status = 'completed';
      research.output = event.payload.output as string ?? research.output;
      research.completedAt = new Date().toISOString();

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: { ...phaseData, research },
        },
      });

      this.logger.log(
        `Research phase completed for run ${workflowRun.id}, ready for planning`,
      );
    }
  }

  async getStatus(workflowRun: WorkflowRun): Promise<PhaseStatus> {
    const phaseData = workflowRun.phaseData as Record<string, any>;
    const research = phaseData.research ?? {};

    return {
      phase: 'research',
      progress: research.status === 'completed' ? 100 : research.status === 'running' ? 50 : 0,
      details: {
        agentInstanceId: research.agentInstanceId ?? null,
        status: research.status ?? 'not_started',
      },
    };
  }

  async complete(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Completing research phase for run ${workflowRun.id}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const research = phaseData.research ?? {};
    research.status = 'completed';

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: { ...phaseData, research },
      },
    });
  }
}
