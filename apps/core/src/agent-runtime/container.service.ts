import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { AdapterConfigService } from '../adapters/adapter-config.service';

export interface RunTaskParams {
  taskId: string;
  workflowRunId: string;
  repoUrl: string;
  branch: string;
  baseBranch?: string;
  workingDirectory?: string;
  taskDefinition: {
    title: string;
    description: string;
    acceptanceCriteria?: string[];
    gates?: { name: string; command: string }[];
  };
  callbackUrl: string;
  timeout?: number;
}

export interface TaskRunResult {
  success: boolean;
  output: string;
  exitCode: number;
}

@Injectable()
export class ContainerService {
  private readonly logger = new Logger(ContainerService.name);
  private readonly mode: 'process' | 'docker' | 'k8s';
  private readonly namespace: string;
  private readonly image: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly adapterConfig: AdapterConfigService,
  ) {
    this.mode = this.configService.get<string>(
      'AGENT_RUNTIME_MODE',
      'process',
    ) as 'process' | 'docker' | 'k8s';
    this.namespace = this.configService.get<string>(
      'K8S_NAMESPACE',
      'orchestra',
    );
    this.image = this.configService.get<string>(
      'AGENT_CONTAINER_IMAGE',
      'orchestra/coding-agent:latest',
    );
    this.logger.log(`Agent runtime mode: ${this.mode}`);
  }

  async runTask(params: RunTaskParams): Promise<TaskRunResult> {
    this.logger.log(
      `Running task ${params.taskId} in ${this.mode} mode`,
    );

    switch (this.mode) {
      case 'process':
        return this.runAsProcess(params);
      case 'docker':
        return this.runAsDocker(params);
      case 'k8s':
        return this.runAsK8sJob(params);
      default:
        throw new Error(`Unknown runtime mode: ${this.mode}`);
    }
  }

  /**
   * Process mode: Run Claude Code CLI directly as a child process.
   * Fastest for local development -- no container overhead.
   */
  private async runAsProcess(params: RunTaskParams): Promise<TaskRunResult> {
    const apiKey = await this.resolveApiKey();
    const prompt = this.buildPrompt(params);
    const timeout = params.timeout || 600_000;

    // Find claude binary path
    const claudeBin = process.env.CLAUDE_BIN || 'claude';
    this.logger.log(
      `[process] Spawning claude CLI for task ${params.taskId} (binary: ${claudeBin}, timeout: ${timeout}ms)`,
    );

    const startTime = Date.now();

    return new Promise<TaskRunResult>((resolve) => {
      // Set up a timeout warning at 80% of the limit
      const warningTimeout = setTimeout(() => {
        this.logger.warn(
          `[process] Task ${params.taskId} has been running for ${Math.round(timeout * 0.8 / 1000)}s — approaching ${timeout / 1000}s timeout`,
        );
      }, timeout * 0.8);

      const child = execFile(
        claudeBin,
        ['-p', prompt, '--output-format', 'json'],
        {
          cwd: params.workingDirectory || process.cwd(),
          env: { ...process.env, ANTHROPIC_API_KEY: apiKey },
          maxBuffer: 10 * 1024 * 1024, // 10 MB
          timeout,
        },
        (error, stdout, stderr) => {
          clearTimeout(warningTimeout);
          const elapsed = Date.now() - startTime;

          if (error) {
            const exitCode = typeof (error as any).code === 'number'
              ? (error as any).code
              : 1;
            const signal = (error as any).signal || 'none';
            this.logger.warn(
              `[process] Task ${params.taskId} failed after ${elapsed}ms — exitCode: ${exitCode}, signal: ${signal}, stderr length: ${(stderr || '').length}`,
            );
            if (stderr) {
              this.logger.warn(
                `[process] Task ${params.taskId} stderr (first 500 chars): ${stderr.slice(0, 500)}`,
              );
            }
            resolve({
              success: false,
              output: stderr || error.message,
              exitCode,
            });
          } else {
            this.logger.log(
              `[process] Task ${params.taskId} completed successfully in ${elapsed}ms — stdout: ${(stdout || '').length} bytes, stderr: ${(stderr || '').length} bytes`,
            );
            resolve({ success: true, output: stdout, exitCode: 0 });
          }
        },
      );

      this.logger.log(
        `[process] Task ${params.taskId} process started (pid: ${child.pid})`,
      );
    });
  }

  /**
   * Docker mode: Spin up an agent container locally.
   * Uses the same container image as production K8s jobs.
   */
  private async runAsDocker(params: RunTaskParams): Promise<TaskRunResult> {
    const apiKey = await this.resolveApiKey();
    const containerName = `orchestra-agent-${params.taskId.slice(0, 8)}`;
    const timeout = params.timeout || 600_000;

    const envArgs = [
      '-e', `REPO_URL=${params.repoUrl}`,
      '-e', `BRANCH=${params.branch}`,
      '-e', `TASK_DEFINITION=${JSON.stringify(params.taskDefinition)}`,
      '-e', `CALLBACK_URL=${params.callbackUrl}`,
      '-e', `API_KEY=${apiKey}`,
      '-e', `BASE_BRANCH=${params.baseBranch || 'main'}`,
    ];

    this.logger.log(
      `[docker] Starting container ${containerName} (image: ${this.image})`,
    );

    return new Promise<TaskRunResult>((resolve) => {
      execFile(
        'docker',
        ['run', '--rm', '--name', containerName, ...envArgs, this.image],
        { timeout, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            this.logger.warn(
              `[docker] Container ${containerName} failed: ${error.message}`,
            );
            resolve({
              success: false,
              output: stderr || error.message,
              exitCode: 1,
            });
          } else {
            this.logger.log(
              `[docker] Container ${containerName} completed successfully`,
            );
            resolve({ success: true, output: stdout, exitCode: 0 });
          }
        },
      );
    });
  }

  /**
   * K8s mode: Create a Kubernetes Job for production execution.
   * The actual result comes back asynchronously via the callback URL.
   */
  private async runAsK8sJob(params: RunTaskParams): Promise<TaskRunResult> {
    const apiKey = await this.resolveApiKey();
    const jobName = `orchestra-agent-${params.taskId.slice(0, 8)}`;
    const activeDeadlineSeconds = params.timeout
      ? Math.floor(params.timeout / 1000)
      : 3600;

    const k8sApiUrl = this.configService.get<string>(
      'K8S_API_URL',
      'https://kubernetes.default.svc',
    );
    const k8sToken = this.configService.get<string>('K8S_TOKEN', '');

    const jobManifest = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name: jobName,
        namespace: this.namespace,
        labels: {
          app: 'orchestra',
          component: 'coding-agent',
          taskId: params.taskId,
          workflowRunId: params.workflowRunId,
        },
      },
      spec: {
        backoffLimit: 0,
        activeDeadlineSeconds,
        template: {
          spec: {
            restartPolicy: 'Never',
            containers: [
              {
                name: 'agent',
                image: this.image,
                env: [
                  { name: 'REPO_URL', value: params.repoUrl },
                  { name: 'BRANCH', value: params.branch },
                  {
                    name: 'TASK_DEFINITION',
                    value: JSON.stringify(params.taskDefinition),
                  },
                  { name: 'CALLBACK_URL', value: params.callbackUrl },
                  { name: 'API_KEY', value: apiKey },
                  {
                    name: 'BASE_BRANCH',
                    value: params.baseBranch || 'main',
                  },
                ],
                resources: {
                  requests: { cpu: '500m', memory: '1Gi' },
                  limits: { cpu: '2', memory: '4Gi' },
                },
              },
            ],
          },
        },
      },
    };

    this.logger.log(
      `[k8s] Creating Job ${jobName} in namespace ${this.namespace}`,
    );

    try {
      const response = await fetch(
        `${k8sApiUrl}/apis/batch/v1/namespaces/${this.namespace}/jobs`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${k8sToken}`,
          },
          body: JSON.stringify(jobManifest),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`K8s API ${response.status}: ${body}`);
      }

      this.logger.log(`[k8s] Job ${jobName} created successfully`);

      // K8s jobs report back via callback -- return a pending result
      return {
        success: true,
        output: `K8s Job ${jobName} created. Result will arrive via callback.`,
        exitCode: 0,
      };
    } catch (error: any) {
      this.logger.error(
        `[k8s] Failed to create Job ${jobName}: ${error.message}`,
      );
      return {
        success: false,
        output: error.message,
        exitCode: 1,
      };
    }
  }

  /**
   * Build a prompt string from the task parameters for process mode.
   */
  private buildPrompt(params: RunTaskParams): string {
    const task = params.taskDefinition;
    return `You are executing a coding task. Here are the details:

Title: ${task.title}
Description: ${task.description}

Acceptance Criteria:
${task.acceptanceCriteria?.map((c: string) => `- ${c}`).join('\n') || 'None specified'}

Instructions:
1. Implement the changes described above
2. Make sure all existing tests still pass
3. Write new tests if needed
4. Keep changes minimal and focused

Working directory: ${params.workingDirectory || '.'}
Branch: ${params.branch}`;
  }

  /**
   * Resolve the Anthropic API key from adapter config or env.
   */
  private async resolveApiKey(): Promise<string> {
    try {
      const config = await this.adapterConfig.getConfig('claude-code');
      if (config?.apiKey) return config.apiKey;
    } catch {
      // Fall through to env
    }
    return process.env.ANTHROPIC_API_KEY || '';
  }
}
