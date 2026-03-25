import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowState } from './entities/workflow.entity';

@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

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
  create(@Body() body: { templateId: string; ticketId: string }) {
    return this.workflowService.create(body);
  }

  @Patch(':id/transition')
  transition(
    @Param('id') id: string,
    @Body() body: { targetState: WorkflowState },
  ) {
    return this.workflowService.transitionState(id, body.targetState);
  }
}
