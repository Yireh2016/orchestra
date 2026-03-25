import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import { WorkflowState, VALID_TRANSITIONS } from './entities/workflow.entity';

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    templateId: string;
    ticketId: string;
  }) {
    const template = await this.prisma.workflowTemplate.findUnique({
      where: { id: data.templateId },
    });

    if (!template) {
      throw new NotFoundException(
        `Template ${data.templateId} not found`,
      );
    }

    return this.prisma.workflowRun.create({
      data: {
        templateId: data.templateId,
        templateVersion: template.version,
        ticketId: data.ticketId,
        state: WorkflowState.TRIGGERED,
        phaseData: {},
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
