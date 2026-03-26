import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import { WorkflowState, VALID_TRANSITIONS } from './entities/workflow.entity';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    templateId: string;
    ticketId: string;
    projectId?: string;
  }) {
    const template = await this.prisma.workflowTemplate.findUnique({
      where: { id: data.templateId },
    });

    if (!template) {
      throw new NotFoundException(
        `Template ${data.templateId} not found`,
      );
    }

    // If no projectId provided, try to auto-detect from ticket key prefix
    let projectId = data.projectId;
    if (!projectId && data.ticketId) {
      const keyMatch = data.ticketId.match(/^([A-Z][A-Z0-9_-]+)-\d+/);
      if (keyMatch) {
        const pmKey = keyMatch[1];
        const project = await this.prisma.project.findFirst({
          where: { pmProjectKey: pmKey },
        });
        if (project) {
          projectId = project.id;
          this.logger.log(
            `Auto-linked workflow to project "${project.name}" via PM key "${pmKey}"`,
          );
        }
      }
    }

    return this.prisma.workflowRun.create({
      data: {
        templateId: data.templateId,
        templateVersion: template.version,
        ticketId: data.ticketId,
        state: WorkflowState.TRIGGERED,
        phaseData: {},
        ...(projectId && { projectId }),
      },
    });
  }

  async findById(id: string) {
    const run = await this.prisma.workflowRun.findUnique({
      where: { id },
    });

    if (!run) {
      throw new NotFoundException(`WorkflowRun ${id} not found`);
    }

    return run;
  }

  async list(filters?: { templateId?: string; state?: WorkflowState }) {
    return this.prisma.workflowRun.findMany({
      where: {
        ...(filters?.templateId && { templateId: filters.templateId }),
        ...(filters?.state && { state: filters.state }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTasksByWorkflowId(workflowRunId: string) {
    return this.prisma.task.findMany({
      where: { workflowRunId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async transitionState(id: string, targetState: WorkflowState) {
    const run = await this.findById(id);
    const currentState = run.state as WorkflowState;

    const allowed = VALID_TRANSITIONS[currentState];
    if (!allowed || !allowed.includes(targetState)) {
      throw new BadRequestException(
        `Invalid transition from ${currentState} to ${targetState}`,
      );
    }

    return this.prisma.workflowRun.update({
      where: { id },
      data: {
        state: targetState,
      },
    });
  }
}
