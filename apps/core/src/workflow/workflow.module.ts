import { Module, forwardRef } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { TemplateService } from './template.service';
import { WorkflowOrchestratorService } from './workflow-orchestrator.service';
import { WorkflowController } from './workflow.controller';
import { TemplateController } from './template.controller';
import { PhasesModule } from '../phases/phases.module';
import { AgentRuntimeModule } from '../agent-runtime/agent-runtime.module';

@Module({
  imports: [forwardRef(() => PhasesModule), AgentRuntimeModule],
  controllers: [WorkflowController, TemplateController],
  providers: [WorkflowService, TemplateService, WorkflowOrchestratorService],
  exports: [WorkflowService, TemplateService, WorkflowOrchestratorService],
})
export class WorkflowModule {}
