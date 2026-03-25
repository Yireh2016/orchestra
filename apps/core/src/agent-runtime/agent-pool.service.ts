import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { CODING_AGENT_ADAPTER } from '../adapters/interfaces/coding-agent-adapter.interface';
import type {
  CodingAgentAdapter,
  AgentInstance,
  SpawnParams,
} from '../adapters/interfaces/coding-agent-adapter.interface';

interface PooledAgent {
  instance: AgentInstance;
  workflowRunId: string;
  taskId: string;
}

@Injectable()
export class AgentPoolService {
  private readonly logger = new Logger(AgentPoolService.name);
  private readonly activeAgents = new Map<string, PooledAgent>();
  private readonly maxConcurrency: number;

  constructor(
    @Inject(CODING_AGENT_ADAPTER)
    private readonly codingAgent: CodingAgentAdapter,
    private readonly configService: ConfigService,
  ) {
    this.maxConcurrency = this.configService.get<number>(
      'AGENT_MAX_CONCURRENCY',
      5,
    );
  }

  get activeCount(): number {
    return this.activeAgents.size;
  }

  get availableSlots(): number {
    return Math.max(0, this.maxConcurrency - this.activeAgents.size);
  }

  async acquire(
    workflowRunId: string,
    taskId: string,
    params: SpawnParams,
  ): Promise<AgentInstance> {
    if (this.activeAgents.size >= this.maxConcurrency) {
      throw new Error(
        `Agent pool at capacity (${this.maxConcurrency}). Cannot spawn new agent.`,
      );
    }

    this.logger.log(
      `Spawning agent for workflow ${workflowRunId}, task ${taskId}`,
    );

    const instance = await this.codingAgent.spawn(params);

    this.activeAgents.set(instance.id, {
      instance,
      workflowRunId,
      taskId,
    });

    return instance;
  }

  async release(instanceId: string): Promise<void> {
    const agent = this.activeAgents.get(instanceId);
    if (!agent) {
      this.logger.warn(`Agent ${instanceId} not found in pool`);
      return;
    }

    const status = await this.codingAgent.getStatus(instanceId);

    if (status.status === 'running') {
      await this.codingAgent.kill(instanceId);
    }

    this.activeAgents.delete(instanceId);
    this.logger.log(`Released agent ${instanceId}`);
  }

  async getAgentsByWorkflow(workflowRunId: string): Promise<PooledAgent[]> {
    const agents: PooledAgent[] = [];
    for (const [, agent] of this.activeAgents) {
      if (agent.workflowRunId === workflowRunId) {
        agents.push(agent);
      }
    }
    return agents;
  }

  async releaseAllForWorkflow(workflowRunId: string): Promise<void> {
    const agents = await this.getAgentsByWorkflow(workflowRunId);
    for (const agent of agents) {
      await this.release(agent.instance.id);
    }
  }
}
