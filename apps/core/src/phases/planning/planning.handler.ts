import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  PhaseHandler,
  PhaseEvent,
  PhaseStatus,
} from '../phase-handler.interface';
import { WorkflowRun } from '../../workflow/entities/workflow.entity';
import { PrismaService } from '../../common/database/prisma.service';
import { DagBuilderService, TaskNode } from './dag-builder.service';
import { CODING_AGENT_ADAPTER } from '../../adapters/interfaces/coding-agent-adapter.interface';
import type { CodingAgentAdapter } from '../../adapters/interfaces/coding-agent-adapter.interface';
import { PM_ADAPTER } from '../../adapters/interfaces/pm-adapter.interface';
import type { PMAdapter } from '../../adapters/interfaces/pm-adapter.interface';
import { RepoClonerService } from '../../common/repo-cloner.service';

@Injectable()
export class PlanningHandler implements PhaseHandler {
  private readonly logger = new Logger(PlanningHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dagBuilder: DagBuilderService,
    @Inject(CODING_AGENT_ADAPTER) private readonly codingAgent: CodingAgentAdapter,
    @Inject(PM_ADAPTER) private readonly pmAdapter: PMAdapter,
    private readonly repoCloner: RepoClonerService,
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
    this.logger.log(`Starting planning phase for run ${workflowRun.id}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const spec = phaseData.interview?.spec ?? '';
    const research = phaseData.research?.artifacts?.research ?? '';
    const projectContext = this.getProjectContext(workflowRun);

    // No "started" comment to Jira — reduces noise. Only post the actual plan.

    // Spawn Claude Code to generate the plan
    this.logger.log(`Spawning Claude Code for plan generation...`);

    // Build repo list for the AI to choose from
    const projectCtx = phaseData._projectContext;
    const repoList = (projectCtx?.repositories as any[] ?? [])
      .map((r: any) => `- ${r.url} (branch: ${r.defaultBranch || 'main'})`)
      .join('\n');

    const prompt = `${projectContext}Based on the following specification and research, create a detailed implementation plan.
Break the work into PR-sized tasks. For each task specify its title, description, dependencies, verification commands, and which repository it targets.

## Specification
${spec}

## Research Findings
${research || 'No research findings available.'}

## Available Repositories
${repoList || 'No repositories configured.'}

IMPORTANT: For each task, select the correct repository from the list above based on where the code changes need to happen. If a task is purely investigative (no code changes), set "repo" to null.

If the entire plan is small enough to be done in a single PR, create just one task.

CRITICAL: Every task MUST have gates that verify its acceptance criteria:
- automatedGates: commands that can be run in the repo to verify the task is done (tests, lint, build, type-check). These MUST pass before a PR is created.
- manualGates: checks that require human verification (UI testing, performance, etc.). These will be posted as a checklist on the PR for human validation.
- If the repo has a test runner, include it. If you're unsure, include "npm test" or the appropriate test command for the tech stack.
- Investigation tasks (repo: null) don't need gates.

Respond with ONLY a JSON object in this exact format:
{
  "overview": "Brief description of the plan",
  "tasks": [
    {
      "id": "task-1",
      "title": "Short task title",
      "description": "What this task does",
      "repo": "https://github.com/org/repo",
      "dependsOn": [],
      "acceptanceCriteria": ["Criteria 1", "Criteria 2"],
      "automatedGates": [
        {"name": "Unit tests pass", "command": "npm test"},
        {"name": "Lint passes", "command": "npm run lint"},
        {"name": "Build succeeds", "command": "npm run build"}
      ],
      "manualGates": [
        {"name": "Feature works in UI", "description": "Verify the feature works as expected in the browser"}
      ],
      "branch": "task-slug"
    }
  ]
}

Respond with ONLY the JSON.`;

    // Clone ALL project repos so Claude Code has the full picture
    let clonedDir: string | null = null;
    let workingDirectory = process.cwd();
    try {
      clonedDir = await this.repoCloner.cloneAllRepos(phaseData);
      if (clonedDir) {
        workingDirectory = clonedDir;
        this.logger.log(`Planning will analyze all repos in workspace ${clonedDir}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to clone repos for planning: ${(err as Error).message}`);
    }

    let plan: { overview: string; tasks: any[] } | null = null;

    try {
      const agent = await this.codingAgent.spawn({
        prompt,
        workingDirectory,
        timeout: 120000,
      });

      const output = agent.output ?? '';
      this.logger.log(`Planning agent returned ${output.length} bytes`);

      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        plan = JSON.parse(jsonMatch[0]);
        this.logger.log(`Plan parsed: ${plan!.tasks?.length ?? 0} tasks`);
      } else {
        this.logger.warn(`No JSON found in planning output: ${output.substring(0, 200)}`);
      }
    } catch (err) {
      this.logger.warn(`Planning agent failed: ${(err as Error).message}`);
    } finally {
      if (clonedDir) this.repoCloner.cleanupClone(clonedDir);
    }

    if (plan && plan.tasks?.length > 0) {
      // Build DAG
      const taskNodes: TaskNode[] = plan.tasks.map((t: any) => ({
        id: t.id,
        name: t.title,
        dependsOn: t.dependsOn ?? [],
      }));

      let dag = null;
      let executionGroups: string[][] = [];
      try {
        dag = this.dagBuilder.buildDag(taskNodes);
        executionGroups = this.dagBuilder.computeExecutionGroups(dag);
      } catch (err) {
        this.logger.warn(`DAG build failed: ${(err as Error).message}`);
      }

      // Update phaseData with plan
      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: {
            ...phaseData,
            planning: {
              status: 'awaiting_approval',
              overview: plan.overview,
              tasks: plan.tasks,
              dag,
              executionGroups,
              planPostedAt: new Date().toISOString(),
            },
          } as any,
        },
      });

      // Post plan to Jira for approval
      const planSummary = [
        '**Implementation Plan**',
        '',
        `**Overview:** ${plan.overview}`,
        '',
        `**Tasks (${plan.tasks.length}):**`,
        ...plan.tasks.map((t: any, i: number) =>
          `${i + 1}. **${t.title}** — ${t.description}${t.dependsOn?.length ? ` (depends on: ${t.dependsOn.join(', ')})` : ''}`
        ),
        '',
        `**Execution Groups:** ${executionGroups.length} groups`,
        ...executionGroups.map((g, i) => `  Group ${i + 1}: ${g.join(', ')}`),
        '',
        '_Reply with **"approve"** to start execution, or provide feedback._',
      ].join('\n');

      try {
        const planComment = await this.pmAdapter.addComment(workflowRun.ticketId, planSummary);
        // Save the plan comment ID — only accept approval comments posted AFTER this one
        const freshRun = await this.prisma.workflowRun.findUniqueOrThrow({ where: { id: workflowRun.id } });
        const freshPd = (freshRun.phaseData ?? {}) as Record<string, any>;
        if (freshPd.planning) {
          freshPd.planning.planCommentId = planComment.id;
          await this.prisma.workflowRun.update({ where: { id: workflowRun.id }, data: { phaseData: freshPd as any } });
        }
      } catch (err) {
        this.logger.warn(`Failed to post plan: ${(err as Error).message}`);
      }
    } else {
      // Plan generation failed — set awaiting_input for manual planning
      this.logger.warn('Plan generation failed or produced no tasks');
      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: {
            ...phaseData,
            planning: { status: 'failed', tasks: [], dag: null, executionGroups: [] },
          } as any,
        },
      });
    }
  }

  async handleEvent(workflowRun: WorkflowRun, event: PhaseEvent): Promise<void> {
    this.logger.log(`Planning event for run ${workflowRun.id}: ${event.type}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const planning = phaseData.planning ?? { tasks: [] };

    // Handle approval from Jira comment — only if plan is awaiting approval
    if (event.type === 'ticket.commented' && planning.status === 'awaiting_approval') {
      const rawComment = event.payload.comment;
      const commentText = typeof rawComment === 'object' && rawComment !== null
        ? (rawComment as any).body ?? ''
        : (rawComment ?? '') as string;

      // Only accept comments posted AFTER the plan comment (by Jira comment ID)
      const commentId = typeof rawComment === 'object' && rawComment !== null
        ? (rawComment as any).id ?? ''
        : '';
      const planCommentId = planning.planCommentId ?? '';

      if (planCommentId && commentId && parseInt(commentId, 10) <= parseInt(planCommentId, 10)) {
        this.logger.log(`Ignoring comment ${commentId} — posted before/same as plan comment ${planCommentId}`);
        return;
      }

      if (commentText.toLowerCase().match(/\b(approve|approved|lgtm|looks good|go ahead)\b/)) {
        planning.status = 'approved';
        planning.approvedAt = new Date().toISOString();

        await this.prisma.workflowRun.update({
          where: { id: workflowRun.id },
          data: { phaseData: { ...phaseData, planning } as any },
        });

        this.logger.log(`Plan approved for workflow ${workflowRun.id}`);

        try {
          await this.pmAdapter.addComment(
            workflowRun.ticketId,
            '**Plan Approved** — Moving to Execution phase.',
          );
        } catch (err) {
          this.logger.warn(`Failed to post approval: ${(err as Error).message}`);
        }
      }
    }

    if (event.type === 'plan_approved') {
      planning.status = 'approved';
      planning.approvedBy = event.source;
      planning.approvedAt = new Date().toISOString();

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: { phaseData: { ...phaseData, planning } as any },
      });
    }
  }

  async getStatus(workflowRun: WorkflowRun): Promise<PhaseStatus> {
    const phaseData = workflowRun.phaseData as Record<string, any>;
    const planning = phaseData.planning ?? {};
    return {
      phase: 'planning',
      progress: planning.status === 'approved' ? 100 : planning.status === 'awaiting_approval' ? 75 : 25,
      details: {
        status: planning.status ?? 'not_started',
        taskCount: planning.tasks?.length ?? 0,
        executionGroupCount: planning.executionGroups?.length ?? 0,
      },
    };
  }

  async complete(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Completing planning phase for run ${workflowRun.id}`);

    const phaseData = workflowRun.phaseData as Record<string, any>;
    const planning = phaseData.planning ?? {};
    const tasks = planning.tasks ?? [];

    // Create Task records in DB
    for (const task of tasks) {
      await this.prisma.task.create({
        data: {
          workflowRunId: workflowRun.id,
          ticketId: task.id ?? task.title,
          branch: `orchestra/${workflowRun.ticketId}/${task.branch ?? task.id}`,
          dependsOn: task.dependsOn ?? [],
          status: 'PENDING',
          gateResults: {
            automatedGates: task.automatedGates ?? task.gates ?? [],
            manualGates: task.manualGates ?? [],
          },
        },
      });
    }

    // Create child Jira tickets
    for (const task of tasks) {
      try {
        await this.pmAdapter.createTicket({
          summary: task.title,
          description: task.description,
          parentTicketId: workflowRun.ticketId,
          labels: ['orchestra-task'],
        });
      } catch (err) {
        this.logger.warn(`Failed to create Jira ticket for task "${task.title}": ${(err as Error).message}`);
      }
    }

    planning.status = 'completed';
    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: { phaseData: { ...phaseData, planning } as any },
    });
  }
}
