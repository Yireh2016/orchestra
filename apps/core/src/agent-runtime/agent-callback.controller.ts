import { Controller, Post, Body, Logger } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import { TaskQueueService } from './task-queue.service';
import { AgentCallbackDto } from './dto/agent-callback.dto';

/**
 * Callback endpoint for agent containers (Docker / K8s) to report
 * task execution results back to the orchestrator.
 */
@Controller('agent-callback')
export class AgentCallbackController {
  private readonly logger = new Logger(AgentCallbackController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskQueue: TaskQueueService,
  ) {}

  @Post()
  async handleCallback(@Body() body: AgentCallbackDto) {
    this.logger.log(
      `Received callback for task ${body.taskId} — status: ${body.status}`,
    );

    const dbStatus = body.status === 'success' ? 'PASSED' : 'FAILED';

    // Update the task record in the database
    try {
      await this.prisma.task.update({
        where: { id: body.taskId },
        data: {
          status: dbStatus,
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to update task ${body.taskId}: ${error.message}`,
      );
    }

    // Create an audit log entry
    try {
      await this.prisma.auditLog.create({
        data: {
          action: 'AGENT_CALLBACK',
          actor: 'agent',
          details: {
            taskId: body.taskId,
            workflowRunId: body.workflowRunId,
            status: body.status,
            message: body.message,
            branch: body.branch,
            agentType: body.agentType,
            timestamp: body.timestamp || new Date().toISOString(),
          },
        },
      });
    } catch (error: any) {
      // Audit logging is non-critical; warn but don't fail
      this.logger.warn(
        `Failed to write audit log for task ${body.taskId}: ${error.message}`,
      );
    }

    // Notify the task queue so orchestration can advance
    try {
      await this.taskQueue.handleAgentCallback({
        taskId: body.taskId,
        workflowRunId: body.workflowRunId,
        status: dbStatus as 'PASSED' | 'FAILED',
        output: body.output,
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to handle task completion for ${body.taskId}: ${error.message}`,
      );
    }

    return { received: true };
  }
}
