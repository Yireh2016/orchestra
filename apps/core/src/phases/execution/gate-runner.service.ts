import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
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

  constructor(private readonly prisma: PrismaService) {}

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

    const phases = (task.workflowRun.template.phases as any[]) ?? [];
    const executionPhase = phases.find(
      (p: { type: string }) => p.type === 'execution',
    );
    const gates = executionPhase?.gates ?? [];

    const results: GateResult[] = [];

    for (const gate of gates) {
      const result = await this.runGateWithRetry(gate, task.branch);
      results.push(result);

      if (!result.passed && gate.required) {
        this.logger.warn(
          `Required gate "${gate.type}" failed for task ${taskId}`,
        );
        break;
      }
    }

    return results;
  }

  private async runGateWithRetry(
    gate: { type: string; command: string; maxRetries?: number; required: boolean },
    branch: string,
  ): Promise<GateResult> {
    const maxAttempts = gate.maxRetries ?? this.maxRetries;
    let lastError = '';
    let lastOutput = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startTime = Date.now();

      try {
        this.logger.log(
          `Running gate "${gate.type}" attempt ${attempt}/${maxAttempts}`,
        );

        const { stdout, stderr } = await execAsync(gate.command, {
          timeout: 120000,
          env: {
            ...process.env,
            BRANCH: branch,
          },
        });

        lastOutput = stdout;

        return {
          gate: gate.type,
          passed: true,
          attempts: attempt,
          output: stdout,
          duration: Date.now() - startTime,
        };
      } catch (error: any) {
        lastError = error.message ?? String(error);
        lastOutput = error.stdout ?? '';
        this.logger.warn(
          `Gate "${gate.type}" failed attempt ${attempt}: ${lastError}`,
        );
      }
    }

    return {
      gate: gate.type,
      passed: false,
      attempts: maxAttempts,
      error: lastError,
      output: lastOutput,
      duration: 0,
    };
  }
}
