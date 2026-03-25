import {
  Controller,
  Get,
  Post,
  Param,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AgentPoolService } from './agent-pool.service';

@Controller('agents')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(private readonly agentPool: AgentPoolService) {}

  /**
   * GET /agents -- list all active agents with their status.
   */
  @Get()
  async listActive() {
    const agents = this.agentPool.listActive();
    return {
      count: agents.length,
      agents,
    };
  }

  /**
   * GET /agents/:id -- get a single agent's detail.
   */
  @Get(':id')
  async getAgent(@Param('id') id: string) {
    const agent = this.agentPool.getAgent(id);
    if (!agent) {
      throw new NotFoundException(`Agent ${id} not found`);
    }
    return agent;
  }

  /**
   * GET /agents/:id/logs -- get an agent's captured output/logs.
   */
  @Get(':id/logs')
  async getAgentLogs(@Param('id') id: string) {
    const agent = this.agentPool.getAgent(id);
    if (!agent) {
      throw new NotFoundException(`Agent ${id} not found`);
    }
    const logs = this.agentPool.getAgentLogs(id);
    return {
      agentId: id,
      logs,
    };
  }

  /**
   * POST /agents/:id/stop -- forcibly stop a running agent.
   */
  @Post(':id/stop')
  async stopAgent(@Param('id') id: string) {
    const agent = this.agentPool.getAgent(id);
    if (!agent) {
      throw new NotFoundException(`Agent ${id} not found`);
    }

    this.logger.log(`Stop requested for agent ${id}`);
    await this.agentPool.stopAgent(id);

    return { stopped: true, agentId: id };
  }
}
