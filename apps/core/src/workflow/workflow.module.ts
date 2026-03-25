import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { TemplateService } from './template.service';
import { WorkflowController } from './workflow.controller';
import { TemplateController } from './template.controller';

@Module({
  controllers: [WorkflowController, TemplateController],
  providers: [WorkflowService, TemplateService],
  exports: [WorkflowService, TemplateService],
})
export class WorkflowModule {}
