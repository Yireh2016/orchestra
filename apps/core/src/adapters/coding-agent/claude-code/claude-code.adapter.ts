import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
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
  private readonly instances = new Map<string, AgentInstance>();

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
      status: 'running',
      startedAt: new Date(),
    };
    this.instances.set(id, instance);

    const env: Record<string, string | undefined> = {
      ...process.env,
      ...params.env,
    };
    if (apiKey) {
      env.ANTHROPIC_API_KEY = apiKey;
    }

    // Find claude binary — use CLAUDE_BIN env var, or search common locations
    const claudeBin = process.env.CLAUDE_BIN
      || ['/Users/jainermunoz/.local/bin/claude', '/usr/local/bin/claude', `${process.env.HOME}/.local/bin/claude`]
        .find(p => { try { require('fs').accessSync(p); return true; } catch { return false; } })
      || 'claude';

    this.logger.log(`Spawning Claude Code agent ${id} (bin: ${claudeBin}, timeout: ${params.timeout ?? 300000}ms)`);

    try {
      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile(
          claudeBin,
          ['-p', params.prompt, '--output-format', 'json'],
          {
            cwd: params.workingDirectory,
            env,
            maxBuffer: 50 * 1024 * 1024, // 50MB
            timeout: params.timeout ?? 300000, // 5 min default
          },
          (error, stdout, stderr) => {
            if (stderr) {
              // Filter out the stdin warning — it's expected with execFile
              const realStderr = stderr.split('\n').filter(l => !l.includes('no stdin data received')).join('\n').trim();
              if (realStderr) this.logger.warn(`Agent ${id} stderr: ${realStderr}`);
            }
            if (error && !stdout) {
              reject(error);
            } else {
              resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
            }
          },
        );
      });

      // Extract the actual AI response from Claude Code's JSON wrapper
      let output = result.stdout;
      try {
        const parsed = JSON.parse(output);
        if (parsed.type === 'result' && parsed.result !== undefined) {
          output = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result);
        }
      } catch {
        // Not JSON-wrapped, use as-is
      }

      instance.status = 'completed';
      instance.output = output;
      instance.completedAt = new Date();
      this.logger.log(`Agent ${id} completed (${output.length} bytes)`);
    } catch (err) {
      instance.status = 'failed';
      instance.error = (err as Error).message;
      instance.completedAt = new Date();
      this.logger.warn(`Agent ${id} failed: ${(err as Error).message}`);
    }

    return { ...instance };
  }

  async getStatus(instanceId: string): Promise<AgentInstance> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`Agent instance ${instanceId} not found`);
    return { ...instance };
  }

  async getOutput(instanceId: string): Promise<string> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`Agent instance ${instanceId} not found`);
    return instance.output ?? '';
  }

  async kill(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new Error(`Agent instance ${instanceId} not found`);
    // execFile processes can't be easily killed by reference,
    // but the timeout will handle stuck processes
    instance.status = 'failed';
    instance.error = 'Killed by user';
    instance.completedAt = new Date();
  }

  async listRunning(): Promise<AgentInstance[]> {
    return [...this.instances.values()].filter(i => i.status === 'running');
  }
}
