import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';

export interface AuditLogFilters {
  workflowRunId?: string;
  action?: string;
  actor?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: AuditLogFilters) {
    const where = this.buildWhere(filters);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async count(filters: AuditLogFilters): Promise<number> {
    const where = this.buildWhere(filters);
    return this.prisma.auditLog.count({ where });
  }

  private buildWhere(filters: AuditLogFilters) {
    const where: Record<string, any> = {};

    if (filters.workflowRunId) {
      where.workflowRunId = filters.workflowRunId;
    }
    if (filters.action) {
      where.action = { contains: filters.action, mode: 'insensitive' };
    }
    if (filters.actor) {
      where.actor = { contains: filters.actor, mode: 'insensitive' };
    }
    if (filters.from || filters.to) {
      where.timestamp = {};
      if (filters.from) {
        where.timestamp.gte = filters.from;
      }
      if (filters.to) {
        where.timestamp.lte = filters.to;
      }
    }

    return where;
  }
}
