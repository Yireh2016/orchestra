import { Injectable, Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { AdapterConfigService } from '../../adapter-config.service';
import type {
  CodingAgentAdapter,
  AgentInstance,
  SpawnParams,
} from '../../interfaces/coding-agent-adapter.interface';

@Injectable()
export class ClaudeCodeAdapter implements CodingAgentAdapter {
  private readonly logger = new Logger(ClaudeCodeAdapter.name);
  private readonly instances = new Map<
    string,
    { process: ChildProcess; instance: AgentInstance; output: string }
  >();

  constructor(private readonly adapterConfig: AdapterConfigService) {}

  private async getApiKey(): Promise<string | undefined> {
    const dbConfig = await this.adapterConfig.getConfig('claude-code');
    return dbConfig?.apiKey;
  }

  async spawn(params: SpawnParams): Promise<AgentInstance> {
    const id = randomUUID();
    const apiKey = await this.getApiKey();

    const instance: AgentInstance = {
      id,
      status: 'starting',
      startedAt: new Date(),
    };

    this.instances.set(id, { process: null as any, instance, output: '' });

    const env: Record<string, string | undefined> = {
      ...process.env,
      ...params.env,
    };
    if (apiKey) {
      env.ANTHROPIC_API_KEY = apiKey;
    }

    const child = spawn('claude', ['-p', params.prompt, '--output-format', 'json'], {
      cwd: params.workingDirectory,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const entry = this.instances.get(id)!;
    entry.process = child;
    entry.instance.status = 'running';

    child.stdout?.on('data', (data: Buffer) => {
      entry.output += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      this.logger.warn(`Agent ${id} stderr: ${data.toString()}`);
    });

    child.on('close', (code) => {
      if (code === 0) {
        entry.instance.status = 'completed';
        entry.instance.output = entry.output;
      } else {
        entry.instance.status = 'failed';
        entry.instance.error = `Process exited with code ${code}`;
      }
      entry.instance.completedAt = new Date();
    });

    child.on('error', (error) => {
      entry.instance.status = 'failed';
      entry.instance.error = error.message;
      entry.instance.completedAt = new Date();
    });

    if (params.timeout) {
      setTimeout(() => {
        if (entry.instance.status === 'running') {
          this.logger.warn(`Agent ${id} timed out after ${params.timeout}ms`);
          child.kill('SIGTERM');
          entry.instance.status = 'failed';
          entry.instance.error = 'Timeout exceeded';
          entry.instance.completedAt = new Date();
        }
      }, params.timeout);
    }

    return { ...instance, status: 'running' };
  }

  async getStatus(instanceId: string): Promise<AgentInstance> {
    const entry = this.instances.get(instanceId);
    if (!entry) {
      throw new Error(`Agent instance ${instanceId} not found`);
    }
    return { ...entry.instance };
  }

  async getOutput(instanceId: string): Promise<string> {
    const entry = this.instances.get(instanceId);
    if (!entry) {
      throw new Error(`Agent instance ${instanceId} not found`);
    }
    return entry.output;
  }

  async kill(instanceId: string): Promise<void> {
    const entry = this.instances.get(instanceId);
    if (!entry) {
      throw new Error(`Agent instance ${instanceId} not found`);
    }

    if (entry.instance.status === 'running') {
      entry.process.kill('SIGTERM');
      entry.instance.status = 'failed';
      entry.instance.error = 'Killed by user';
      entry.instance.completedAt = new Date();
    }
  }

  async listRunning(): Promise<AgentInstance[]> {
    const running: AgentInstance[] = [];
    for (const [, entry] of this.instances) {
      if (entry.instance.status === 'running') {
        running.push({ ...entry.instance });
      }
    }
    return running;
  }
}
