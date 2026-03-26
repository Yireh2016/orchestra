import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AdapterConfigService } from '../adapters/adapter-config.service';

@Injectable()
export class RepoClonerService {
  private readonly logger = new Logger(RepoClonerService.name);

  constructor(private readonly adapterConfig: AdapterConfigService) {}

  /**
   * Clone a repo into a temp directory and return the path.
   * Caller is responsible for cleanup via cleanupClone().
   */
  async cloneRepo(
    repoUrl: string,
    branch?: string,
  ): Promise<string> {
    const id = Math.random().toString(36).slice(2, 10);
    const tmpDir = path.join(os.tmpdir(), `orchestra-clone-${id}`);

    this.logger.log(`Cloning ${repoUrl} (branch: ${branch ?? 'default'}) into ${tmpDir}`);

    const ghConfig = await this.adapterConfig.getConfig('github');
    const token = ghConfig?.token || process.env.GITHUB_TOKEN || '';

    let cloneUrl = repoUrl;
    if (token && cloneUrl.startsWith('https://')) {
      cloneUrl = cloneUrl.replace('https://', `https://x-access-token:${token}@`);
    }

    const args = ['clone', '--depth', '50'];
    if (branch) {
      args.push('--branch', branch);
    }
    args.push(cloneUrl, tmpDir);

    await this.exec('git', args);

    this.logger.log(`Clone complete: ${tmpDir}`);
    return tmpDir;
  }

  /**
   * Get the primary repo URL from project context in phaseData.
   */
  getPrimaryRepoUrl(phaseData: Record<string, any>): { url: string; branch: string } | null {
    const ctx = phaseData._projectContext;
    if (!ctx?.repositories) return null;
    const repos = ctx.repositories as any[];
    if (repos.length === 0) return null;
    const primary = repos.find((r: any) => r.primary) ?? repos[0];
    return { url: primary.url, branch: primary.defaultBranch || 'main' };
  }

  cleanupClone(tmpDir: string): void {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      this.logger.warn(`Failed to cleanup ${tmpDir}`);
    }
  }

  private async exec(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(command, args, { maxBuffer: 50 * 1024 * 1024, timeout: 120000 }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
