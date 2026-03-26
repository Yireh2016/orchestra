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
import { CODING_AGENT_ADAPTER } from '../../adapters/interfaces/coding-agent-adapter.interface';
import type { CodingAgentAdapter } from '../../adapters/interfaces/coding-agent-adapter.interface';

@Injectable()
export class InterviewHandler implements PhaseHandler {
  private readonly logger = new Logger(InterviewHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conflictDetector: ConflictDetectorService,
    @Inject(PM_ADAPTER) private readonly pmAdapter: PMAdapter,
    @Inject(CODING_AGENT_ADAPTER) private readonly codingAgent: CodingAgentAdapter,
  ) {}

  async start(workflowRun: WorkflowRun): Promise<void> {
    this.logger.log(`Starting interview phase for run ${workflowRun.id}`);

    const ticketId = workflowRun.ticketId;

    // Fetch ticket details + existing comments
    let ticketTitle = '';
    let ticketDescription = '';
    let ticketLabels: string[] = [];
    let existingComments: Array<{ author: string; body: string }> = [];

    try {
      const ticket = await this.pmAdapter.getTicket(ticketId);
      ticketTitle = ticket.summary;
      ticketDescription = ticket.description;
      ticketLabels = ticket.labels ?? [];
    } catch (err) {
      this.logger.warn(`Failed to fetch ticket ${ticketId}: ${(err as Error).message}`);
    }

    try {
      const comments = await this.pmAdapter.getComments(ticketId);
      existingComments = comments.map(c => ({ author: c.author, body: c.body }));
    } catch (err) {
      this.logger.warn(`Failed to fetch comments for ${ticketId}: ${(err as Error).message}`);
    }

    // Use AI to analyze the ticket and decide: ask questions or go straight to spec
    const analysis = await this.analyzeTicketCompleteness(
      ticketTitle,
      ticketDescription,
      ticketLabels,
      existingComments,
    );

    if (analysis.isComplete) {
      // Ticket has enough information — go straight to spec
      this.logger.log(`Ticket ${ticketId} has sufficient information — generating spec directly`);

      const spec = analysis.spec;

      const specMessage = [
        '**Draft Specification** (generated from ticket details)',
        '',
        spec,
        '',
        '_The ticket had sufficient information to generate this spec. Please review and reply with **"approve"** to proceed, or provide feedback._',
      ].join('\n');

      try {
        await this.pmAdapter.addComment(ticketId, specMessage);
      } catch (err) {
        this.logger.warn(`Failed to post spec: ${(err as Error).message}`);
      }

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          phaseData: {
            ...(workflowRun.phaseData as Record<string, unknown>),
            interview: {
              status: 'spec_ready',
              ticketId,
              questions: [],
              responses: existingComments.map(c => ({ author: c.author, content: c.body, timestamp: new Date() })),
              spec,
              analysisResult: 'complete',
            },
          },
        },
      });
    } else {
      // Ticket needs more info — ask targeted questions
      const questions = analysis.questions;

      const commentBody = [
        `**Requirements Interview** for *${ticketTitle || ticketId}*`,
        '',
        'I\'ve reviewed the ticket and need some clarification on a few points:',
        '',
        ...questions.map((q, i) => `${i + 1}. ${q}`),
        '',
        '_Reply with your answers. Say **"done"** when you have nothing more to add._',
      ].join('\n');

      try {
        await this.pmAdapter.addComment(ticketId, commentBody);
      } catch (err) {
        this.logger.warn(`Failed to post interview questions: ${(err as Error).message}`);
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
              questionsPosted: true,
              responses: [],
              spec: '',
              analysisResult: 'needs_info',
            },
          },
        },
      });
    }
  }

  async handleEvent(workflowRun: WorkflowRun, event: PhaseEvent): Promise<void> {
    this.logger.log(`Interview event for run ${workflowRun.id}: ${event.type}`);

    // Handle explicit approval
    if (event.type === 'approve_spec' || event.type === 'interview_complete') {
      await this.markApproved(workflowRun, event.source);
      return;
    }

    // Handle new Jira comment
    if (event.type === 'ticket.commented') {
      const phaseData = workflowRun.phaseData as Record<string, any>;
      const interview = phaseData.interview ?? { questions: [], responses: [], spec: '' };

      // Extract comment text
      const rawComment = event.payload.comment;
      const commentText = typeof rawComment === 'object' && rawComment !== null
        ? (rawComment as any).body ?? ''
        : (rawComment ?? event.payload.content ?? '') as string;
      const author = typeof rawComment === 'object' && rawComment !== null
        ? (rawComment as any).author ?? event.source
        : (event.payload.author ?? event.source) as string;

      if (!commentText.trim()) return; // Skip empty comments

      // Store response
      interview.responses = interview.responses ?? [];
      interview.responses.push({ author, content: commentText, timestamp: new Date().toISOString() });

      // Check for approval keywords
      const lower = commentText.toLowerCase().trim();
      if (interview.status === 'spec_ready' && lower.match(/\b(approve|approved|lgtm|looks good)\b/)) {
        await this.markApproved(workflowRun, author);
        return;
      }

      // Check for "done" signal — synthesize spec from all info
      if (lower.match(/\b(done|ready|that'?s all|proceed|go ahead|no more questions)\b/)) {
        await this.synthesizeAndPostSpec(workflowRun, interview, phaseData);
        return;
      }

      // Check for conflicts
      const conflictResult = await this.conflictDetector.detectConflicts(
        interview.responses.map((r: any) => ({ from: r.author, content: r.content, timestamp: r.timestamp })),
      );

      if (conflictResult.hasConflict) {
        interview.status = 'paused_conflict';
        interview.conflicts = conflictResult.conflictingStatements;
        const conflictMessage = [
          '**Conflict Detected**',
          '',
          ...conflictResult.conflictingStatements.map(
            (c: any) => `- *${c.author1}*: "${c.statement1}"\n  vs *${c.author2}*: "${c.statement2}"\n  _${c.reason}_`,
          ),
          '',
          '_Please clarify before we proceed._',
        ].join('\n');

        try { await this.pmAdapter.addComment(workflowRun.ticketId, conflictMessage); } catch (err) {
          this.logger.warn(`Failed to post conflict: ${(err as Error).message}`);
        }
      } else {
        // Use AI to decide: do we have enough info now, or need more questions?
        await this.evaluateAndRespond(workflowRun, interview, phaseData);
      }

      // Persist state
      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: { phaseData: { ...phaseData, interview } as any },
      });
    }
  }

  async getStatus(workflowRun: WorkflowRun): Promise<PhaseStatus> {
    const phaseData = workflowRun.phaseData as Record<string, any>;
    const interview = phaseData.interview ?? {};

    let progress = 0;
    if (interview.status === 'approved' || interview.status === 'completed') progress = 100;
    else if (interview.status === 'spec_ready') progress = 90;
    else if (interview.responses?.length > 0) progress = 50;
    else if (interview.status === 'active') progress = 20;

    return {
      phase: 'interview',
      progress,
      details: {
        totalQuestions: interview.questions?.length ?? 0,
        responsesReceived: interview.responses?.length ?? 0,
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

    if (!interview.spec && interview.responses?.length > 0) {
      await this.synthesizeAndPostSpec(workflowRun, interview, phaseData);
    }

    interview.status = 'completed';
    interview.completedAt = new Date().toISOString();

    if (interview.spec) {
      try {
        await this.pmAdapter.addComment(workflowRun.ticketId, [
          '**Interview Complete - Final Specification**',
          '',
          interview.spec,
          '',
          '_Moving to Research phase._',
        ].join('\n'));
      } catch (err) {
        this.logger.warn(`Failed to post final spec: ${(err as Error).message}`);
      }
    }

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: { phaseData: { ...phaseData, interview } as any },
    });
  }

  // ---------------------------------------------------------------------------
  // AI-powered analysis
  // ---------------------------------------------------------------------------

  /**
   * Use AI to analyze if a ticket has enough information for a spec,
   * or generate targeted questions for missing information.
   */
  private async analyzeTicketCompleteness(
    title: string,
    description: string,
    labels: string[],
    comments: Array<{ author: string; body: string }>,
  ): Promise<{ isComplete: boolean; spec: string; questions: string[] }> {
    const existingInfo = [
      `Title: ${title}`,
      `Description: ${description}`,
      labels.length ? `Labels: ${labels.join(', ')}` : '',
      ...comments.map(c => `Comment by ${c.author}: ${c.body}`),
    ].filter(Boolean).join('\n\n');

    const prompt = `You are analyzing a project ticket to determine if it has enough information to write a technical specification.

Here is all available information about this ticket:

${existingInfo}

Analyze this carefully. A ticket has "enough information" if it clearly describes:
- What needs to be done (the change/feature/fix)
- Why it needs to be done (the motivation/problem)
- What the expected outcome looks like

It does NOT need to have every detail — the research and planning phases will figure out the technical approach. The interview phase just needs to understand the WHAT and WHY.

Respond with EXACTLY one of these two JSON formats:

If the ticket has enough information:
{"isComplete": true, "spec": "A clear specification summarizing the requirements based on the ticket information. Include: ## Summary, ## Requirements, ## Acceptance Criteria (inferred from context), ## Scope"}

If the ticket needs more information:
{"isComplete": false, "questions": ["Only ask questions about genuinely missing information. Be specific. Max 3 questions."]}

Respond with ONLY the JSON, no other text.`;

    try {
      const agent = await this.codingAgent.spawn({
        prompt,
        workingDirectory: process.cwd(),
        timeout: 60000,
      });

      const output = agent.output ?? '';

      // Parse JSON from the response
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        if (result.isComplete && result.spec) {
          return { isComplete: true, spec: result.spec, questions: [] };
        }
        if (!result.isComplete && result.questions?.length) {
          return { isComplete: false, spec: '', questions: result.questions };
        }
      }
    } catch (err) {
      this.logger.warn(`AI analysis failed, falling back to heuristic: ${(err as Error).message}`);
    }

    // Fallback: simple heuristic if AI fails
    return this.heuristicAnalysis(title, description, labels);
  }

  /**
   * After receiving a response, use AI to decide if we have enough info or need more.
   */
  private async evaluateAndRespond(
    workflowRun: WorkflowRun,
    interview: Record<string, any>,
    phaseData: Record<string, any>,
  ): Promise<void> {
    const allInfo = [
      `Ticket: ${interview.ticketId}`,
      `Questions asked: ${(interview.questions ?? []).join('; ')}`,
      `Responses:`,
      ...(interview.responses ?? []).map((r: any) => `  ${r.author}: ${r.content}`),
    ].join('\n');

    const prompt = `You are evaluating whether an interview for a coding task has gathered enough information.

Here is the conversation so far:

${allInfo}

Do we have enough information to write a technical specification? Consider:
- Is the WHAT (what needs to be done) clear?
- Is the WHY (motivation) clear?
- Is the expected outcome described?

Respond with EXACTLY one of these JSON formats:

If enough info: {"ready": true, "spec": "A clear specification. Include: ## Summary, ## Requirements, ## Acceptance Criteria, ## Scope"}
If need more info: {"ready": false, "questions": ["1-2 specific questions about what's still unclear. Don't repeat questions already asked."]}

Respond with ONLY the JSON.`;

    try {
      const agent = await this.codingAgent.spawn({
        prompt,
        workingDirectory: process.cwd(),
        timeout: 60000,
      });

      const output = agent.output ?? '';
      this.logger.log(`AI evaluation output (${output.length} chars): ${output.substring(0, 200)}...`);

      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn(`No JSON found in AI output, falling back. Raw: ${output.substring(0, 300)}`);
      }
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        this.logger.log(`AI evaluation result: ready=${result.ready}, hasSpec=${!!result.spec}, questions=${result.questions?.length ?? 0}`);

        if (result.ready && result.spec) {
          interview.spec = result.spec;
          interview.status = 'spec_ready';

          try {
            await this.pmAdapter.addComment(workflowRun.ticketId, [
              '**Draft Specification**',
              '',
              result.spec,
              '',
              '_Please review and reply with **"approve"** to proceed, or provide feedback._',
            ].join('\n'));
          } catch (err) {
            this.logger.warn(`Failed to post spec: ${(err as Error).message}`);
          }
          return;
        }

        if (!result.ready && result.questions?.length) {
          // Only post if we haven't already posted these exact questions
          const newQuestions = result.questions.filter(
            (q: string) => !(interview.questions ?? []).includes(q),
          );

          if (newQuestions.length > 0) {
            interview.questions = [...(interview.questions ?? []), ...newQuestions];

            try {
              await this.pmAdapter.addComment(workflowRun.ticketId, [
                '**Follow-up Questions**',
                '',
                ...newQuestions.map((q: string, i: number) => `${i + 1}. ${q}`),
                '',
                '_Reply with your answers, or say **"done"** if you have nothing more to add._',
              ].join('\n'));
            } catch (err) {
              this.logger.warn(`Failed to post follow-ups: ${(err as Error).message}`);
            }
          }
          return;
        }
      }
    } catch (err) {
      this.logger.warn(`AI evaluation failed: ${(err as Error).message}`);
    }

    // Fallback: if AI didn't produce a result, synthesize from what we have
    this.logger.log(`AI didn't produce actionable result — synthesizing spec from ${interview.responses?.length ?? 0} responses`);
    await this.synthesizeAndPostSpec(workflowRun, interview, phaseData);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async markApproved(workflowRun: WorkflowRun, approver: string): Promise<void> {
    const phaseData = workflowRun.phaseData as Record<string, any>;
    const interview = phaseData.interview ?? {};

    interview.status = 'approved';
    interview.approvedBy = approver;
    interview.approvedAt = new Date().toISOString();

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: { phaseData: { ...phaseData, interview } as any },
    });

    this.logger.log(`Interview approved for workflow ${workflowRun.id}`);

    try {
      await this.pmAdapter.addComment(
        workflowRun.ticketId,
        '**Interview Complete** — Specification approved. Moving to the Research phase.',
      );
    } catch (err) {
      this.logger.warn(`Failed to post approval confirmation: ${(err as Error).message}`);
    }
  }

  private async synthesizeAndPostSpec(
    workflowRun: WorkflowRun,
    interview: Record<string, any>,
    phaseData: Record<string, any>,
  ): Promise<void> {
    // Use AI to synthesize the spec from all gathered info
    const allInfo = [
      `Ticket ID: ${interview.ticketId}`,
      ...(interview.responses ?? []).map((r: any) => `${r.author}: ${r.content}`),
    ].join('\n');

    let spec = '';
    try {
      const agent = await this.codingAgent.spawn({
        prompt: `Synthesize a clear technical specification from the following interview responses. Include: ## Summary, ## Requirements, ## Acceptance Criteria, ## Scope\n\n${allInfo}`,
        workingDirectory: process.cwd(),
        timeout: 60000,
      });
      spec = agent.output ?? '';
    } catch (err) {
      this.logger.warn(`AI spec synthesis failed, using basic format: ${(err as Error).message}`);
      spec = this.basicSpecSynthesis(interview);
    }

    interview.spec = spec;
    interview.status = 'spec_ready';

    try {
      await this.pmAdapter.addComment(workflowRun.ticketId, [
        '**Draft Specification**',
        '',
        spec,
        '',
        '_Please review and reply with **"approve"** to proceed, or provide feedback._',
      ].join('\n'));
    } catch (err) {
      this.logger.warn(`Failed to post spec: ${(err as Error).message}`);
    }

    await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: { phaseData: { ...phaseData, interview } as any },
    });
  }

  private basicSpecSynthesis(interview: Record<string, any>): string {
    const responses = interview.responses ?? [];
    return [
      '# Specification',
      '',
      '## Requirements',
      ...responses.map((r: any) => `- ${r.content}`),
      '',
      '## Questions Asked',
      ...(interview.questions ?? []).map((q: string) => `- ${q}`),
    ].join('\n');
  }

  private heuristicAnalysis(
    title: string,
    description: string,
    labels: string[],
  ): { isComplete: boolean; spec: string; questions: string[] } {
    const hasDescription = description && description.length > 100;
    const hasAcceptanceCriteria = description?.toLowerCase().includes('acceptance criteria')
      || description?.toLowerCase().includes('expected');

    if (hasDescription && hasAcceptanceCriteria) {
      return {
        isComplete: true,
        spec: `# Specification\n\n## Summary\n${title}\n\n## Requirements\n${description}`,
        questions: [],
      };
    }

    const questions: string[] = [];
    if (!hasDescription) {
      questions.push('Can you provide more details about what needs to be done and why?');
    }
    if (!hasAcceptanceCriteria) {
      questions.push('What does "done" look like? What are the acceptance criteria?');
    }
    if (questions.length === 0) {
      questions.push('Are there any constraints, dependencies, or edge cases to consider?');
    }
    return { isComplete: false, spec: '', questions };
  }
}
