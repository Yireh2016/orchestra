import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
  branchPushed?: boolean;
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
   * Clones the repo, runs Claude Code, commits and pushes changes.
   */
  private async runAsProcess(params: RunTaskParams): Promise<TaskRunResult> {
    const apiKey = await this.resolveApiKey();
    const timeout = params.timeout || 600_000;
    const taskId = params.taskId;

    // 1. Create a temp working directory
    const tmpDir = path.join(os.tmpdir(), `orchestra-${taskId}`);

    this.logger.log(`[process] Task ${taskId}: creating workspace at ${tmpDir}`);

    try {
      // 2. Clone the repo (shallow clone for speed)
      if (params.repoUrl) {
        this.logger.log(`[process] Task ${taskId}: cloning ${params.repoUrl}...`);

        // Get GitHub token for authenticated clone
        const ghConfig = await this.adapterConfig.getConfig('github');
        const token = ghConfig?.token || process.env.GITHUB_TOKEN || '';

        // Build authenticated URL
        let cloneUrl = params.repoUrl;
        if (token && cloneUrl.startsWith('https://')) {
          cloneUrl = cloneUrl.replace('https://', `https://x-access-token:${token}@`);
        }

        await this.exec('git', ['clone', '--depth', '50', cloneUrl, tmpDir]);

        // 3. Create and checkout branch
        const baseBranch = params.baseBranch || 'main';
        this.logger.log(`[process] Task ${taskId}: creating branch ${params.branch} from ${baseBranch}`);

        await this.exec('git', ['checkout', baseBranch], { cwd: tmpDir });
        await this.exec('git', ['checkout', '-b', params.branch], { cwd: tmpDir });
      } else {
        // No repo URL — use current directory (for testing)
        fs.mkdirSync(tmpDir, { recursive: true });
        this.logger.warn(`[process] Task ${taskId}: no repo URL, using empty workspace`);
      }

      // 4. Build the prompt for Claude Code
      const prompt = this.buildPrompt(params);

      // 5. Run Claude Code in the cloned repo directory
      // Use --dangerously-skip-permissions so it can edit files without asking
      const claudeBin = process.env.CLAUDE_BIN
        || ['/Users/jainermunoz/.local/bin/claude', `${process.env.HOME}/.local/bin/claude`, '/usr/local/bin/claude']
          .find(p => { try { fs.accessSync(p); return true; } catch { return false; } })
        || 'claude';

      this.logger.log(`[process] Task ${taskId}: running Claude Code in ${tmpDir} (timeout: ${timeout}ms)`);

      const startTime = Date.now();
      const claudeResult = await this.execWithTimeout(
        claudeBin,
        ['-p', prompt, '--output-format', 'json', '--dangerously-skip-permissions'],
        {
          cwd: tmpDir,
          env: { ...process.env, ANTHROPIC_API_KEY: apiKey },
          maxBuffer: 50 * 1024 * 1024,
        },
        timeout,
      );

      const elapsed = Date.now() - startTime;
      this.logger.log(`[process] Task ${taskId}: Claude Code finished in ${elapsed}ms (exit: ${claudeResult.exitCode})`);

      // Parse output — extract actual result from JSON wrapper
      let output = claudeResult.stdout;
      try {
        const parsed = JSON.parse(output);
        if (parsed.type === 'result' && parsed.result !== undefined) {
          output = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result);
        }
      } catch { /* not JSON-wrapped */ }

      // 6. Check if any files were changed
      let branchPushed = false;
      if (params.repoUrl) {
        const diffResult = await this.exec('git', ['status', '--porcelain'], { cwd: tmpDir });
        const hasChanges = diffResult.stdout.trim().length > 0;

        if (hasChanges) {
          this.logger.log(`[process] Task ${taskId}: changes detected, committing...`);

          await this.exec('git', ['config', 'user.email', 'orchestra@bot.dev'], { cwd: tmpDir });
          await this.exec('git', ['config', 'user.name', 'Orchestra Bot'], { cwd: tmpDir });

          await this.exec('git', ['add', '-A'], { cwd: tmpDir });
          await this.exec('git', ['commit', '-m', `[Orchestra] ${params.taskDefinition.title}\n\nAutomated by Orchestra workflow.`], { cwd: tmpDir });

          this.logger.log(`[process] Task ${taskId}: pushing branch ${params.branch}...`);
          await this.exec('git', ['push', 'origin', params.branch], { cwd: tmpDir });

          branchPushed = true;
          this.logger.log(`[process] Task ${taskId}: branch pushed successfully`);
        } else {
          this.logger.log(`[process] Task ${taskId}: no file changes — no PR needed`);
        }
      }

      // 7. Cleanup temp directory
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch { /* ignore cleanup errors */ }

      return { success: claudeResult.exitCode === 0, output, exitCode: claudeResult.exitCode, branchPushed };

    } catch (err) {
      this.logger.error(`[process] Task ${taskId} failed: ${(err as Error).message}`);
      // Cleanup on error
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      return { success: false, output: (err as Error).message, exitCode: 1 };
    }
  }

  // Helper to execute a command and return stdout/stderr
  private async exec(
    command: string,
    args: string[],
    options?: { cwd?: string; env?: Record<string, string | undefined> },
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      execFile(command, args, {
        cwd: options?.cwd,
        env: options?.env as any,
        maxBuffer: 50 * 1024 * 1024,
        timeout: 120000, // 2 min per git command
      }, (error, stdout, stderr) => {
        if (error) {
          this.logger.warn(`Command failed: ${command} ${args.join(' ')} — ${error.message}`);
          reject(error);
        } else {
          resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
        }
      });
    });
  }

  // Helper to execute with timeout
  private async execWithTimeout(
    command: string,
    args: string[],
    options: { cwd?: string; env?: any; maxBuffer?: number },
    timeout: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const child = execFile(command, args, { ...options, timeout }, (error, stdout, stderr) => {
        if (error && !stdout) {
          resolve({ stdout: '', stderr: stderr ?? error.message, exitCode: (error as any).code ?? 1 });
        } else {
          resolve({ stdout: stdout ?? '', stderr: stderr ?? '', exitCode: error ? 1 : 0 });
        }
      });
      this.logger.log(`[process] PID ${child.pid} started for: ${command} ${args.slice(0, 2).join(' ')}...`);
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
    return `You are a coding agent working on a task. You have full access to the repository cloned in your working directory.

TASK: ${task.title}
DESCRIPTION: ${task.description}

${task.acceptanceCriteria?.length ? `ACCEPTANCE CRITERIA:\n${task.acceptanceCriteria.map(c => `- ${c}`).join('\n')}` : ''}

INSTRUCTIONS:
1. Read the relevant files to understand the current code
2. Make the necessary changes to implement this task
3. Ensure your changes are minimal and focused
4. Follow existing code patterns and conventions

BRANCH: ${params.branch}

Do NOT commit or push — the system handles that automatically.
Just make the code changes needed.`;
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
