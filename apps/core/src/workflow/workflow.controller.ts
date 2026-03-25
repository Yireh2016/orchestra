import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Logger,
} from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowOrchestratorService } from './workflow-orchestrator.service';
import { WorkflowState } from './entities/workflow.entity';

@Controller('workflows')
export class WorkflowController {
  private readonly logger = new Logger(WorkflowController.name);

  constructor(
    private readonly workflowService: WorkflowService,
    private readonly orchestrator: WorkflowOrchestratorService,
  ) {}

  @Get()
  list(
    @Query('templateId') templateId?: string,
    @Query('state') state?: WorkflowState,
  ) {
    return this.workflowService.list({ templateId, state });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.workflowService.findById(id);
  }

  @Post()
  async create(@Body() body: { templateId: string; ticketId: string }) {
    const run = await this.workflowService.create(body);
    try {
      await this.orchestrator.startWorkflow(run.id);
    } catch (err) {
      this.logger.warn(`Failed to start workflow orchestration for run ${run.id}: ${(err as Error).message}`);
    }
    return run;
  }

  @Patch(':id/transition')
  transition(
    @Param('id') id: string,
    @Body() body: { targetState: WorkflowState },
  ) {
    return this.workflowService.transitionState(id, body.targetState);
  }

  @Post(':id/pause')
  async pause(
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    await this.orchestrator.pauseWorkflow(id, body.reason);
    return { status: 'paused', workflowRunId: id };
  }

  @Post(':id/resume')
  async resume(@Param('id') id: string) {
    await this.orchestrator.resumeWorkflow(id);
    return { status: 'resumed', workflowRunId: id };
  }
}
