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

/** Maximum number of log lines kept in memory per agent. */
const MAX_LOG_LINES = 500;

@Injectable()
export class AgentPoolService {
  private readonly logger = new Logger(AgentPoolService.name);
  private readonly activeAgents = new Map<string, PooledAgent>();
  private readonly agentLogs = new Map<string, string[]>();
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

  // ── Pool operations ─────────────────────────────────────────────────────

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
    this.agentLogs.set(instance.id, []);

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
    // Keep logs for a while after release (they'll be GC'd eventually)
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

  // ── Query / control methods ─────────────────────────────────────────────

  /**
   * Return all active agents with their current status.
   */
  listActive(): Array<{
    id: string;
    status: string;
    workflowRunId: string;
    taskId: string;
    startedAt: Date;
  }> {
    const result: Array<{
      id: string;
      status: string;
      workflowRunId: string;
      taskId: string;
      startedAt: Date;
    }> = [];

    for (const [, pooled] of this.activeAgents) {
      result.push({
        id: pooled.instance.id,
        status: pooled.instance.status,
        workflowRunId: pooled.workflowRunId,
        taskId: pooled.taskId,
        startedAt: pooled.instance.startedAt,
      });
    }

    return result;
  }

  /**
   * Get a single agent's full detail, or null if not found.
   */
  getAgent(
    id: string,
  ): {
    id: string;
    status: string;
    workflowRunId: string;
    taskId: string;
    startedAt: Date;
    completedAt?: Date;
    error?: string;
  } | null {
    const pooled = this.activeAgents.get(id);
    if (!pooled) return null;

    return {
      id: pooled.instance.id,
      status: pooled.instance.status,
      workflowRunId: pooled.workflowRunId,
      taskId: pooled.taskId,
      startedAt: pooled.instance.startedAt,
      completedAt: pooled.instance.completedAt,
      error: pooled.instance.error,
    };
  }

  /**
   * Stop (kill) a running agent and release it from the pool.
   */
  async stopAgent(id: string): Promise<void> {
    const agent = this.activeAgents.get(id);
    if (!agent) {
      this.logger.warn(`stopAgent: agent ${id} not found`);
      return;
    }

    this.logger.log(`Stopping agent ${id}`);

    try {
      await this.codingAgent.kill(id);
    } catch (error: any) {
      this.logger.warn(`Error killing agent ${id}: ${error.message}`);
    }

    this.activeAgents.delete(id);
  }

  // ── Log tracking ────────────────────────────────────────────────────────

  /**
   * Append log lines for an agent. Keeps at most MAX_LOG_LINES in memory.
   */
  appendLogs(agentId: string, lines: string): void {
    let logs = this.agentLogs.get(agentId);
    if (!logs) {
      logs = [];
      this.agentLogs.set(agentId, logs);
    }

    const newLines = lines.split('\n');
    logs.push(...newLines);

    // Trim to last N lines
    if (logs.length > MAX_LOG_LINES) {
      logs.splice(0, logs.length - MAX_LOG_LINES);
    }
  }

  /**
   * Retrieve stored log lines for an agent.
   */
  getAgentLogs(agentId: string): string[] {
    return this.agentLogs.get(agentId) || [];
  }
}
