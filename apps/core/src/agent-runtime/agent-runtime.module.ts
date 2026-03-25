import { Module } from '@nestjs/common';
import { AgentPoolService } from './agent-pool.service';
import { TaskQueueService } from './task-queue.service';
import { ContainerService } from './container.service';
import { AdaptersModule } from '../adapters/adapters.module';
import { AgentCallbackController } from './agent-callback.controller';
import { AgentController } from './agent.controller';

@Module({
  imports: [AdaptersModule],
  controllers: [AgentCallbackController, AgentController],
  providers: [AgentPoolService, TaskQueueService, ContainerService],
  exports: [AgentPoolService, TaskQueueService, ContainerService],
})
export class AgentRuntimeModule {}
