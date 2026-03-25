import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import { PrismaService } from '../common/database/prisma.service';
import { AgentPoolService } from './agent-pool.service';

export interface TaskJobData {
  taskId: string;
  workflowRunId: string;
  prompt: string;
  workingDirectory: string;
}

@Injectable()
export class TaskQueueService implements OnModuleInit {
  private readonly logger = new Logger(TaskQueueService.name);
  private queue!: Queue<TaskJobData>;
  private worker!: Worker<TaskJobData>;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly agentPool: AgentPoolService,
  ) {}

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

    this.queue = new Queue<TaskJobData>('task-execution', { connection });

    this.worker = new Worker<TaskJobData>(
      'task-execution',
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

    this.worker.on('completed', async (job: Job<TaskJobData>) => {
      this.logger.log(`Task ${job.data.taskId} completed`);
      await this.evaluateDownstream(job.data);
    });

    this.worker.on('failed', (job: Job<TaskJobData> | undefined, error: Error) => {
      this.logger.error(
        `Task ${job?.data.taskId} failed: ${error.message}`,
      );
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

    this.logger.log(`Enqueued task ${data.taskId}`);
  }

  private async processTask(job: Job<TaskJobData>): Promise<void> {
    const { taskId, workflowRunId, prompt, workingDirectory } = job.data;

    this.logger.log(`Processing task ${taskId}`);

    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: 'RUNNING' },
    });

    const instance = await this.agentPool.acquire(workflowRunId, taskId, {
      prompt,
      workingDirectory,
      timeout: 600000,
    });

    await this.prisma.task.update({
      where: { id: taskId },
      data: { agentInstanceId: instance.id },
    });
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
