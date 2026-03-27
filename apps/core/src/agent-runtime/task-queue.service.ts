import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import { PrismaService } from '../common/database/prisma.service';
import { AgentPoolService } from './agent-pool.service';
import { ContainerService, type RunTaskParams } from './container.service';
import { EventBusService } from '../events/event-bus.service';

export const TASK_QUEUE_NAME = 'orchestra-task-execution';

export interface TaskJobData {
  taskId: string;
  workflowRunId: string;
  prompt: string;
  workingDirectory: string;
  repoUrl?: string;
  branch?: string;
  baseBranch?: string;
  taskDefinition?: {
    title: string;
    description: string;
    acceptanceCriteria?: string[];
    gates?: { name: string; command: string }[];
  };
  automatedGates?: { name: string; command: string }[];
  timeout?: number;
}

export type TaskCompletedCallback = (data: {
  taskId: string;
  workflowRunId: string;
  status: 'PASSED' | 'FAILED';
  branchPushed?: boolean;
}) => Promise<void>;

@Injectable()
export class TaskQueueService implements OnModuleInit {
  private readonly logger = new Logger(TaskQueueService.name);
  private queue!: Queue<TaskJobData>;
  private worker!: Worker<TaskJobData>;
  private onTaskCompletedCallback?: TaskCompletedCallback;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly agentPool: AgentPoolService,
    private readonly containerService: ContainerService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Register a callback that will be invoked when a task completes or fails.
   * The orchestrator can use this to advance phase logic.
   */
  setOnTaskCompleted(callback: TaskCompletedCallback): void {
    this.onTaskCompletedCallback = callback;
  }

  async onModuleInit() {
    const redisUrl = this.configService.get<string>(
      'redis.url',
      'redis://localhost:6379',
    );
    const url = new URL(redisUrl);

    const connection = {
      host: url.hostname,
      port: parseInt(url.port || '6379', 10),
    };

    this.queue = new Queue<TaskJobData>(TASK_QUEUE_NAME, { connection });

    this.worker = new Worker<TaskJobData>(
      TASK_QUEUE_NAME,
      async (job: Job<TaskJobData>) => {
        await this.processTask(job);
      },
      {
        connection,
        concurrency: this.configService.get<number>(
          'AGENT_MAX_CONCURRENCY',
          5,
        ),
      },
    );

    this.worker.on('failed', async (job: Job<TaskJobData> | undefined, error: Error) => {
      this.logger.error(
        `Task ${job?.data.taskId} worker error: ${error.message}`,
      );
      if (job) {
        await this.markTaskStatus(job.data.taskId, 'FAILED');
        await this.notifyCompletion(job.data, 'FAILED');
      }
    });
  }

  async enqueue(data: TaskJobData): Promise<void> {
    await this.prisma.task.update({
      where: { id: data.taskId },
      data: { status: 'QUEUED' },
    });

    await this.queue.add('execute-task', data, {
      jobId: data.taskId,
      attempts: 1,
    });

    this.eventBus.emit({
      type: 'task.queued',
      workflowRunId: data.workflowRunId,
      taskId: data.taskId,
      payload: {},
    });

    this.logger.log(`Enqueued task ${data.taskId}`);
  }

  /**
   * Called by AgentCallbackController when a Docker/K8s container reports back.
   */
  async handleAgentCallback(data: {
    taskId: string;
    workflowRunId: string;
    status: 'PASSED' | 'FAILED';
    output?: string;
  }): Promise<void> {
    this.logger.log(
      `Agent callback received for task ${data.taskId}: ${data.status}`,
    );

    if (data.output) {
      this.agentPool.appendLogs(data.taskId, data.output);
    }

    await this.evaluateDownstream({
      taskId: data.taskId,
      workflowRunId: data.workflowRunId,
      prompt: '',
      workingDirectory: '',
    });

    await this.notifyCompletion(
      { taskId: data.taskId, workflowRunId: data.workflowRunId, prompt: '', workingDirectory: '' },
      data.status,
    );
  }

  // ── Internal processing ─────────────────────────────────────────────────

  private async processTask(job: Job<TaskJobData>): Promise<void> {
    const { taskId, workflowRunId, prompt, workingDirectory } = job.data;
    const startTime = Date.now();

    this.logger.log(
      `Processing task ${taskId} for workflow ${workflowRunId} (repo: ${job.data.repoUrl || 'none'}, branch: ${job.data.branch || 'main'})`,
    );

    await this.markTaskStatus(taskId, 'RUNNING');

    this.eventBus.emit({
      type: 'task.started',
      workflowRunId,
      taskId,
      payload: {},
    });

    // Build RunTaskParams for the container service
    const callbackBaseUrl = this.configService.get<string>(
      'CALLBACK_BASE_URL',
      'http://localhost:3000',
    );

    const runParams: RunTaskParams = {
      taskId,
      workflowRunId,
      repoUrl: job.data.repoUrl || '',
      branch: job.data.branch || 'main',
      baseBranch: job.data.baseBranch || 'main',
      workingDirectory: workingDirectory || process.cwd(),
      taskDefinition: job.data.taskDefinition || {
        title: `Task ${taskId}`,
        description: prompt,
      },
      automatedGates: job.data.automatedGates,
      callbackUrl: `${callbackBaseUrl}/agent-callback`,
      timeout: job.data.timeout || 600_000,
    };

    // Watchdog timer — log if task processing takes longer than 2 minutes
    const watchdog = setTimeout(() => {
      this.logger.warn(
        `Task ${taskId} (workflow ${workflowRunId}) has been processing for over 2 minutes — possible stuck task`,
      );
    }, 2 * 60 * 1000);

    let result;
    try {
      result = await this.containerService.runTask(runParams);
      this.logger.log(
        `ContainerService.runTask completed for task ${taskId}: success=${result.success}, exitCode=${result.exitCode}, output length=${(result.output || '').length}`,
      );
    } catch (error: any) {
      clearTimeout(watchdog);
      const elapsed = Date.now() - startTime;
      this.logger.error(
        `Task ${taskId} (workflow ${workflowRunId}) execution error after ${elapsed}ms: ${error.message}`,
      );
      await this.markTaskStatus(taskId, 'FAILED');
      await this.notifyCompletion(job.data, 'FAILED');
      throw error; // Let BullMQ mark the job as failed
    }

    clearTimeout(watchdog);

    // Store the output in the agent pool logs
    if (result.output) {
      this.agentPool.appendLogs(taskId, result.output);
    }

    if (!result.success) {
      const elapsed = Date.now() - startTime;
      this.logger.warn(
        `Task ${taskId} (workflow ${workflowRunId}) failed after ${elapsed}ms — exit code ${result.exitCode}, output length: ${(result.output || '').length}`,
      );

      // Store gate results if available
      if (result.gateResults?.length) {
        await this.prisma.task.update({
          where: { id: taskId },
          data: { gateResults: { results: result.gateResults, allGatesPassed: false } as any },
        });
      }

      await this.markTaskStatus(taskId, 'FAILED');
      await this.notifyCompletion(job.data, 'FAILED');
      return;
    }

    // Store gate results if available
    if (result.gateResults?.length) {
      await this.prisma.task.update({
        where: { id: taskId },
        data: { gateResults: { results: result.gateResults, allGatesPassed: result.allGatesPassed } as any },
      });
    }

    // Task succeeded — gates already ran and passed inside ContainerService
    const elapsed = Date.now() - startTime;
    this.logger.log(`Task ${taskId} completed successfully in ${elapsed}ms (branchPushed: ${result.branchPushed ?? false}, gatesPassed: ${result.allGatesPassed ?? 'n/a'})`);
    await this.markTaskStatus(taskId, 'PASSED');
    await this.evaluateDownstream(job.data);
    await this.notifyCompletion(job.data, 'PASSED', result.branchPushed);
  }

  /**
   * Run gate commands sequentially; return true if all pass.
   */
  private async runGates(
    taskId: string,
    gates: { name: string; command: string }[],
    workingDirectory: string,
  ): Promise<boolean> {
    const { execFile } = require('child_process');

    for (const gate of gates) {
      this.logger.log(
        `Running gate "${gate.name}" for task ${taskId}: ${gate.command}`,
      );

      const passed = await new Promise<boolean>((resolve) => {
        execFile(
          '/bin/bash',
          ['-c', gate.command],
          {
            cwd: workingDirectory || process.cwd(),
            timeout: 120_000,
            maxBuffer: 5 * 1024 * 1024,
          },
          (error: any) => {
            if (error) {
              this.logger.warn(
                `Gate "${gate.name}" failed for task ${taskId}: ${error.message}`,
              );
              this.eventBus.emit({
                type: 'gate.failed',
                taskId,
                payload: { gateName: gate.name },
              });
              resolve(false);
            } else {
              this.logger.log(`Gate "${gate.name}" passed for task ${taskId}`);
              this.eventBus.emit({
                type: 'gate.passed',
                taskId,
                payload: { gateName: gate.name },
              });
              resolve(true);
            }
          },
        );
      });

      if (!passed) return false;
    }

    return true;
  }

  private async markTaskStatus(
    taskId: string,
    status: 'PENDING' | 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'AWAITING_MANUAL_GATES',
  ): Promise<void> {
    try {
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status },
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to update task ${taskId} status to ${status}: ${error.message}`,
      );
    }
  }

  private async notifyCompletion(
    data: TaskJobData,
    status: 'PASSED' | 'FAILED',
    branchPushed?: boolean,
  ): Promise<void> {
    this.eventBus.emit({
      type: status === 'PASSED' ? 'task.completed' : 'task.failed',
      workflowRunId: data.workflowRunId,
      taskId: data.taskId,
      payload: { status, branchPushed },
    });

    if (this.onTaskCompletedCallback) {
      try {
        await this.onTaskCompletedCallback({
          taskId: data.taskId,
          workflowRunId: data.workflowRunId,
          status,
          branchPushed,
        });
      } catch (error: any) {
        this.logger.error(
          `Task completion callback error for ${data.taskId}: ${error.message}`,
        );
      }
    }
  }

  private async evaluateDownstream(data: TaskJobData): Promise<void> {
    const { taskId, workflowRunId } = data;

    const downstream = await this.prisma.task.findMany({
      where: {
        workflowRunId,
        dependsOn: { has: taskId },
        status: 'PENDING',
      },
    });

    for (const task of downstream) {
      const allDepsMet = await this.areAllDependenciesMet(task.dependsOn);

      if (allDepsMet) {
        this.logger.log(
          `Dependencies met for task ${task.id}, enqueuing`,
        );
        await this.enqueue({
          taskId: task.id,
          workflowRunId,
          prompt: `Execute task ${task.ticketId} on branch ${task.branch}`,
          workingDirectory: '.',
        });
      }
    }
  }

  private async areAllDependenciesMet(dependsOn: string[]): Promise<boolean> {
    for (const depId of dependsOn) {
      const dep = await this.prisma.task.findUnique({
        where: { id: depId },
      });
      if (!dep || dep.status !== 'PASSED') {
        return false;
      }
    }
    return true;
  }
}
