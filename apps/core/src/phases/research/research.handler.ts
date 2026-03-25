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
import { PM_ADAPTER } from '../../adapters/interfaces/pm-adapter.interface';
import type { PMAdapter } from '../../adapters/interfaces/pm-adapter.interface';

@Injectable()
export class ResearchHandler implements PhaseHandler {
  private readonly logger = new Logger(ResearchHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CODING_AGENT_ADAPTER)
    private readonly codingAgent: CodingAgentAdapter,
    @Inject(PM_ADAPTER) private readonly pmAdapter: PMAdapter,
  ) {}

  async start(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Starting research phase for run ${workflowRun.id}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const ticketId = workflowRun.ticketId;

    // Get the spec from the interview phase
    const spec =
      phaseData.interview?.spec ??
      phaseData.interview ??
      'No specification available.';

    // Determine working directory from workflow metadata if available
    const workingDirectory =
      phaseData.research?.metadata?.repoPath ??
      phaseData.repoPath ??
      '.';

    const prompt = `Research the codebase to understand how to implement the following specification.
Document what exists, how it works, where files are located, and what changes would be needed.
Focus on file paths, code patterns, dependencies, and integration points.

Specification:
${typeof spec === 'string' ? spec : JSON.stringify(spec, null, 2)}

Output a structured research document with:
1. Summary of findings
2. Relevant files and their purposes
3. Code patterns to follow
4. Dependencies and integration points
5. Risks and considerations`;

    let agentInstanceId: string | null = null;
    try {
      const agentInstance = await this.codingAgent.spawn({
        prompt,
        workingDirectory,
        timeout: 300000,
      });
      agentInstanceId = agentInstance.id;
    } catch (err) {
      this.logger.warn(
        `Failed to spawn coding agent for research: ${(err as Error).message}`,
      );
    }

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: {
          ...phaseData,
          research: {
            ...phaseData.research,
            agentInstanceId,
            status: agentInstanceId ? 'researching' : 'agent_unavailable',
            startedAt: new Date().toISOString(),
            artifacts: {},
          },
        },
      },
    });

    // Post a comment that research has started
    try {
      await this.pmAdapter.addComment(
        ticketId,
        `**Research Phase Started**\n\nAnalyzing the codebase based on the specification. Agent instance: \`${agentInstanceId ?? 'unavailable'}\``,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to post research start comment: ${(err as Error).message}`,
      );
    }
  }

  async handleEvent(
    workflowRun: WorkflowRun,
    event: PhaseEvent,
  ): Promise<void> {
    this.logger.log(
      `Research event for run ${workflowRun.id}: ${event.type}`,
    );

    if (
      event.type === 'task_completed' ||
      event.type === 'research_complete'
    ) {
      const phaseData = workflowRun.phaseData as Record<string, any>;
      const research = phaseData.research ?? {};

      // Extract the agent's output/research findings
      const output = (event.payload.output ?? event.payload.result ?? '') as string;

      research.status = 'completed';
      research.completedAt = new Date().toISOString();
      research.artifacts = {
        ...research.artifacts,
        research: output,
      };

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: { ...phaseData, research },
        },
      });

      this.logger.log(
        `Research phase completed for run ${workflowRun.id}, auto-completing`,
      );
      return;
    }

    if (event.type === 'agent_completed') {
      const phaseData = workflowRun.phaseData as Record<string, any>;
      const research = phaseData.research ?? {};

      research.status = 'completed';
      research.completedAt = new Date().toISOString();
      research.artifacts = {
        ...research.artifacts,
        research: (event.payload.output ?? '') as string,
      };

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: { ...phaseData, research },
        },
      });
      return;
    }

    if (event.type === 'agent_failed') {
      const phaseData = workflowRun.phaseData as Record<string, any>;
      const research = phaseData.research ?? {};

      research.status = 'failed';
      research.error = (event.payload.error ?? 'Unknown error') as string;
      research.completedAt = new Date().toISOString();

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: { ...phaseData, research },
        },
      });
    }
  }

  async getStatus(workflowRun: WorkflowRun): Promise<PhaseStatus> {
    const phaseData = workflowRun.phaseData as Record<string, any>;
    const research = phaseData.research ?? {};

    let progress = 0;
    if (research.status === 'completed') {
      progress = 100;
    } else if (research.status === 'researching') {
      progress = 50;
    } else if (research.status === 'failed') {
      progress = 0;
    }

    return {
      phase: 'research',
      progress,
      details: {
        agentInstanceId: research.agentInstanceId ?? null,
        status: research.status ?? 'not_started',
        hasArtifacts: !!research.artifacts?.research,
      },
    };
  }

  async complete(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Completing research phase for run ${workflowRun.id}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const research = phaseData.research ?? {};

    research.status = 'completed';
    research.completedAt = research.completedAt ?? new Date().toISOString();

    // Post a summary of research findings as a Jira comment
    const researchOutput = research.artifacts?.research;
    if (researchOutput) {
      const summary =
        researchOutput.length > 2000
          ? researchOutput.substring(0, 2000) + '\n\n_...truncated for comment length..._'
          : researchOutput;

      try {
        await this.pmAdapter.addComment(
          workflowRun.ticketId,
          `**Research Phase Complete**\n\n${summary}`,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to post research summary comment: ${(err as Error).message}`,
        );
      }
    } else {
      try {
        await this.pmAdapter.addComment(
          workflowRun.ticketId,
          '**Research Phase Complete**\n\nNo research artifacts were produced. The agent may have been unavailable.',
        );
      } catch (err) {
        this.logger.warn(
          `Failed to post research completion comment: ${(err as Error).message}`,
        );
      }
    }

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        phaseData: { ...phaseData, research },
      },
    });
  }
}
