import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AdapterConfigService } from '../adapters/adapter-config.service';

interface RepoInfo {
  url: string;
  defaultBranch?: string;
  primary?: boolean;
}

@Injectable()
export class RepoClonerService {
  private readonly logger = new Logger(RepoClonerService.name);

  constructor(private readonly adapterConfig: AdapterConfigService) {}

  /**
   * Clone ALL project repos into a single workspace directory.
   * Each repo gets its own subdirectory named after the repo.
   *
   * Returns the workspace root path. Structure:
   *   /tmp/orchestra-workspace-xxx/
   *   ├── roadmunk/
   *   ├── roadmapping/
   *   └── rm-helm-charts/
   */
  async cloneAllRepos(phaseData: Record<string, any>): Promise<string | null> {
    const ctx = phaseData._projectContext;
    if (!ctx?.repositories) return null;
    const repos = ctx.repositories as RepoInfo[];
    if (repos.length === 0) return null;

    const id = Math.random().toString(36).slice(2, 10);
    const workspaceDir = path.join(os.tmpdir(), `orchestra-workspace-${id}`);
    fs.mkdirSync(workspaceDir, { recursive: true });

    const ghConfig = await this.adapterConfig.getConfig('github');
    const token = ghConfig?.token || process.env.GITHUB_TOKEN || '';

    this.logger.log(`Creating workspace at ${workspaceDir} with ${repos.length} repos`);

    for (const repo of repos) {
      const repoName = this.extractRepoName(repo.url);
      const targetDir = path.join(workspaceDir, repoName);

      try {
        let cloneUrl = repo.url;
        if (token && cloneUrl.startsWith('https://')) {
          cloneUrl = cloneUrl.replace('https://', `https://x-access-token:${token}@`);
        }

        const args = ['clone', '--depth', '50'];
        if (repo.defaultBranch) {
          args.push('--branch', repo.defaultBranch);
        }
        args.push(cloneUrl, targetDir);

        this.logger.log(`Cloning ${repo.url} (branch: ${repo.defaultBranch ?? 'default'}) → ${repoName}/`);
        await this.exec('git', args);
      } catch (err) {
        this.logger.warn(`Failed to clone ${repo.url}: ${(err as Error).message} — skipping`);
      }
    }

    // List what was cloned
    const cloned = fs.readdirSync(workspaceDir).filter(f =>
      fs.statSync(path.join(workspaceDir, f)).isDirectory(),
    );
    this.logger.log(`Workspace ready: ${cloned.length}/${repos.length} repos cloned [${cloned.join(', ')}]`);

    return workspaceDir;
  }

  /**
   * Clone a single repo into a temp directory.
   */
  async cloneRepo(repoUrl: string, branch?: string): Promise<string> {
    const id = Math.random().toString(36).slice(2, 10);
    const tmpDir = path.join(os.tmpdir(), `orchestra-clone-${id}`);

    const ghConfig = await this.adapterConfig.getConfig('github');
    const token = ghConfig?.token || process.env.GITHUB_TOKEN || '';

    let cloneUrl = repoUrl;
    if (token && cloneUrl.startsWith('https://')) {
      cloneUrl = cloneUrl.replace('https://', `https://x-access-token:${token}@`);
    }

    const args = ['clone', '--depth', '50'];
    if (branch) args.push('--branch', branch);
    args.push(cloneUrl, tmpDir);

    this.logger.log(`Cloning ${repoUrl} (branch: ${branch ?? 'default'}) into ${tmpDir}`);
    await this.exec('git', args);
    return tmpDir;
  }

  /**
   * Get the primary repo URL from project context.
   */
  getPrimaryRepoUrl(phaseData: Record<string, any>): { url: string; branch: string } | null {
    const ctx = phaseData._projectContext;
    if (!ctx?.repositories) return null;
    const repos = ctx.repositories as RepoInfo[];
    if (repos.length === 0) return null;
    const primary = repos.find(r => r.primary) ?? repos[0];
    return { url: primary.url, branch: primary.defaultBranch || 'main' };
  }

  /**
   * Fetch a specific remote branch into a cloned repo and check it out.
   */
  async fetchBranch(repoDir: string, branch: string): Promise<void> {
    try {
      await this.exec('git', ['fetch', 'origin', `${branch}:${branch}`], repoDir);
      await this.exec('git', ['checkout', branch], repoDir);
      this.logger.log(`Checked out branch ${branch} in ${repoDir}`);
    } catch (err) {
      this.logger.warn(`Failed to fetch/checkout branch ${branch}: ${(err as Error).message}`);
    }
  }

  cleanupClone(tmpDir: string): void {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      this.logger.log(`Cleaned up ${tmpDir}`);
    } catch {
      this.logger.warn(`Failed to cleanup ${tmpDir}`);
    }
  }

  /**
   * Extract repo name from URL: https://github.com/org/repo-name → repo-name
   */
  private extractRepoName(url: string): string {
    const match = url.match(/\/([^/]+?)(?:\.git)?$/);
    return match ? match[1] : url.replace(/[^a-zA-Z0-9-]/g, '_');
  }

  private async exec(command: string, args: string[], cwd?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(command, args, { cwd, maxBuffer: 50 * 1024 * 1024, timeout: 180000 }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
