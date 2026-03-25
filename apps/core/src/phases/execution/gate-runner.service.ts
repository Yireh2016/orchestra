import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CODING_AGENT_ADAPTER } from '../../adapters/interfaces/coding-agent-adapter.interface';
import type { CodingAgentAdapter } from '../../adapters/interfaces/coding-agent-adapter.interface';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GateResult {
  gate: string;
  passed: boolean;
  attempts: number;
  error?: string;
  output?: string;
  duration: number;
}

@Injectable()
export class GateRunnerService {
  private readonly logger = new Logger(GateRunnerService.name);
  private readonly maxRetries = 3;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CODING_AGENT_ADAPTER) private readonly codingAgent: CodingAgentAdapter,
  ) {}

  async runGates(taskId: string): Promise<GateResult[]> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        workflowRun: {
          include: { template: true },
        },
      },
    });

    if (!task) {
      this.logger.warn(`Task ${taskId} not found`);
      return [];
    }

    // Collect gates from template phases and task-level gateResults
    const phases = (task.workflowRun.template.phases as any[]) ?? [];
    const executionPhase = phases.find(
      (p: { type: string }) => p.type === 'execution',
    );
    const templateGates: Array<{
      type: string;
      name?: string;
      command: string;
      maxRetries?: number;
      required: boolean;
    }> = executionPhase?.gates ?? [];

    // Also pick up task-specific gates stored in gateResults during planning
    const taskGateConfig = task.gateResults as any;
    const taskGates: Array<{ name: string; command: string }> =
      taskGateConfig?.gates ?? [];

    // Merge: template gates first, then task-specific gates
    const allGates = [
      ...templateGates.map((g) => ({
        name: g.name ?? g.type,
        command: g.command,
        maxRetries: g.maxRetries,
        required: g.required ?? true,
      })),
      ...taskGates.map((g) => ({
        name: g.name,
        command: g.command,
        maxRetries: undefined as number | undefined,
        required: true,
      })),
    ];

    if (allGates.length === 0) {
      this.logger.log(`No gates configured for task ${taskId}, auto-passing`);
      return [];
    }

    const results: GateResult[] = [];

    for (const gate of allGates) {
      const result = await this.runGateWithSelfHeal(
        gate,
        task.branch,
        taskId,
      );
      results.push(result);

      if (!result.passed && gate.required) {
        this.logger.warn(
          `Required gate "${gate.name}" failed for task ${taskId} after ${result.attempts} attempts`,
        );
        break;
      }
    }

    return results;
  }

  /**
   * Runs a gate command with up to maxRetries attempts.
   * On failure, spawns a CodingAgent with the error output to attempt self-healing
   * before retrying the gate.
   */
  private async runGateWithSelfHeal(
    gate: {
      name: string;
      command: string;
      maxRetries?: number;
      required: boolean;
    },
    branch: string,
    taskId: string,
  ): Promise<GateResult> {
    const maxAttempts = gate.maxRetries ?? this.maxRetries;
    let lastError = '';
    let lastOutput = '';
    const overallStart = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startTime = Date.now();

      try {
        this.logger.log(
          `Running gate "${gate.name}" attempt ${attempt}/${maxAttempts} for task ${taskId}`,
        );

        const { stdout, stderr } = await execAsync(gate.command, {
          timeout: 120000,
          env: {
            ...process.env,
            BRANCH: branch,
            TASK_ID: taskId,
          },
        });

        lastOutput = stdout;

        if (stderr) {
          this.logger.log(`Gate "${gate.name}" stderr: ${stderr.slice(0, 500)}`);
        }

        return {
          gate: gate.name,
          passed: true,
          attempts: attempt,
          output: stdout,
          duration: Date.now() - startTime,
        };
      } catch (error: any) {
        lastError = error.message ?? String(error);
        lastOutput = error.stdout ?? '';
        const stderr = error.stderr ?? '';

        this.logger.warn(
          `Gate "${gate.name}" failed attempt ${attempt}/${maxAttempts}: ${lastError.slice(0, 300)}`,
        );

        // If we have retries remaining, attempt self-healing via CodingAgent
        if (attempt < maxAttempts) {
          try {
            this.logger.log(
              `Spawning self-heal agent for gate "${gate.name}" attempt ${attempt}`,
            );

            const healPrompt = `A quality gate failed. Please fix the issues and try again.

Gate: ${gate.name}
Command: ${gate.command}
Branch: ${branch}

Stdout:
${(lastOutput || '').slice(0, 2000)}

Stderr:
${(stderr || '').slice(0, 2000)}

Error:
${lastError.slice(0, 1000)}

Fix the issues in the code so the gate command passes.`;

            const healInstance = await this.codingAgent.spawn({
              prompt: healPrompt,
              workingDirectory: '.',
              timeout: 300000,
              env: { BRANCH: branch },
            });

            // Wait for self-heal agent to finish
            try {
              await this.codingAgent.getOutput(healInstance.id);
            } catch (outputErr) {
              this.logger.warn(
                `Failed to get self-heal agent output: ${(outputErr as Error).message}`,
              );
            }
          } catch (healErr) {
            this.logger.warn(
              `Self-heal agent failed for gate "${gate.name}": ${(healErr as Error).message}`,
            );
          }
        }
      }
    }

    return {
      gate: gate.name,
      passed: false,
      attempts: maxAttempts,
      error: lastError,
      output: lastOutput,
      duration: Date.now() - overallStart,
    };
  }
}
