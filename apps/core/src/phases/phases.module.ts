import { Module, forwardRef } from '@nestjs/common';
import { InterviewHandler } from './interview/interview.handler';
import { ConflictDetectorService } from './interview/conflict-detector.service';
import { ResearchHandler } from './research/research.handler';
import { PlanningHandler } from './planning/planning.handler';
import { DagBuilderService } from './planning/dag-builder.service';
import { ExecutionHandler } from './execution/execution.handler';
import { GateRunnerService } from './execution/gate-runner.service';
import { ReviewHandler } from './review/review.handler';
import { AdaptersModule } from '../adapters/adapters.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { AgentRuntimeModule } from '../agent-runtime/agent-runtime.module';

@Module({
  imports: [AdaptersModule, forwardRef(() => WorkflowModule), AgentRuntimeModule],
  providers: [
    InterviewHandler,
    ConflictDetectorService,
    ResearchHandler,
    PlanningHandler,
    DagBuilderService,
    ExecutionHandler,
    GateRunnerService,
    ReviewHandler,
  ],
  exports: [
    InterviewHandler,
    ResearchHandler,
    PlanningHandler,
    ExecutionHandler,
    ReviewHandler,
  ],
})
export class PhasesModule {}
