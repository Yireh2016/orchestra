import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import { randomUUID } from 'crypto';

@Injectable()
export class TemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    name: string;
    description: string;
    phases: unknown[];
    triggerConfig: Record<string, unknown>;
    teamId: string;
  }) {
    return this.prisma.workflowTemplate.create({
      data: {
        name: data.name,
        description: data.description,
        phases: data.phases as any,
        triggerConfig: data.triggerConfig as any,
        version: 1,
        teamId: data.teamId,
        isPublished: false,
      },
    });
  }

  async findById(id: string) {
    const template = await this.prisma.workflowTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    return template;
  }

  async list(filters?: { teamId?: string; isPublished?: boolean }) {
    return this.prisma.workflowTemplate.findMany({
      where: {
        ...(filters?.teamId && { teamId: filters.teamId }),
        ...(filters?.isPublished !== undefined && {
          isPublished: filters.isPublished,
        }),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      phases: unknown[];
      triggerConfig: Record<string, unknown>;
    }>,
  ) {
    await this.findById(id);

    return this.prisma.workflowTemplate.update({
      where: { id },
      data: {
        ...data,
        ...(data.phases && { phases: data.phases as any }),
        ...(data.triggerConfig && {
          triggerConfig: data.triggerConfig as any,
        }),
      },
    });
  }

  async clone(id: string) {
    const source = await this.findById(id);

    return this.prisma.workflowTemplate.create({
      data: {
        id: randomUUID(),
        name: `${source.name} (Copy)`,
        description: source.description,
        phases: source.phases as any,
        triggerConfig: source.triggerConfig as any,
        version: 1,
        teamId: source.teamId,
        parentTemplateId: source.id,
        isPublished: false,
      },
    });
  }

  async publish(id: string) {
    await this.findById(id);

    return this.prisma.workflowTemplate.update({
      where: { id },
      data: {
        isPublished: true,
        version: { increment: 1 },
      },
    });
  }

  async unpublish(id: string) {
    await this.findById(id);

    return this.prisma.workflowTemplate.update({
      where: { id },
      data: { isPublished: false },
    });
  }
}
