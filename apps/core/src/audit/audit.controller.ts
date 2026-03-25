import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async findAll(
    @Query('workflowRunId') workflowRunId?: string,
    @Query('action') action?: string,
    @Query('actor') actor?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.auditService.findAll({
      workflowRunId,
      action,
      actor,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ?? 1,
      limit: limit ?? 20,
    });
  }
}
