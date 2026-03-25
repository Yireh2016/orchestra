import { Module } from '@nestjs/common';
import { AgentPoolService } from './agent-pool.service';
import { TaskQueueService } from './task-queue.service';
import { ContainerService } from './container.service';

@Module({
  providers: [AgentPoolService, TaskQueueService, ContainerService],
  exports: [AgentPoolService, TaskQueueService, ContainerService],
})
export class AgentRuntimeModule {}
