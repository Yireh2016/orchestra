import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  CODE_HOST_ADAPTER,
  CodeHostAdapter,
} from '../adapters/interfaces/code-host-adapter.interface';
import {
  CODING_AGENT_ADAPTER,
  CodingAgentAdapter,
} from '../adapters/interfaces/coding-agent-adapter.interface';

interface Repository {
  url: string;
  defaultBranch?: string;
  path?: string;
}

@Injectable()
export class RepoScannerService {
  private readonly logger = new Logger(RepoScannerService.name);

  constructor(
    @Inject(CODE_HOST_ADAPTER)
    private readonly codeHost: CodeHostAdapter,
    @Inject(CODING_AGENT_ADAPTER)
    private readonly codingAgent: CodingAgentAdapter,
  ) {}

  async scanAndGenerateContext(repositories: Repository[]): Promise<string> {
    const contextParts: string[] = [];

    for (const repo of repositories) {
      const repoSlug = this.extractRepoSlug(repo.url);
      if (!repoSlug) continue;

      const branch = repo.defaultBranch || 'main';

      // Priority 1: Check for CLAUDE.md, .claude/settings.json, agents.md
      const agentFiles = [
        'CLAUDE.md',
        '.claude/settings.json',
        'agents.md',
        '.claude/commands',
      ];
      for (const file of agentFiles) {
        try {
          const content = await this.codeHost.getFileContent(
            repoSlug,
            file,
            branch,
          );
          if (content?.content) {
            contextParts.push(
              `## ${file} (from ${repoSlug})\n${content.content}`,
            );
          }
        } catch {
          // File doesn't exist, skip
        }
      }

      // Priority 2: Check README.md
      try {
        const readme = await this.codeHost.getFileContent(
          repoSlug,
          'README.md',
          branch,
        );
        if (readme?.content) {
          contextParts.push(
            `## README.md (from ${repoSlug})\n${readme.content.substring(0, 2000)}`,
          );
        }
      } catch {
        // README doesn't exist, skip
      }

      // Priority 3: Check tech stack files
      const techFiles = [
        'package.json',
        'pyproject.toml',
        'go.mod',
        'Cargo.toml',
        'pom.xml',
      ];
      for (const file of techFiles) {
        try {
          const content = await this.codeHost.getFileContent(
            repoSlug,
            file,
            branch,
          );
          if (content?.content) {
            if (file === 'package.json') {
              try {
                const pkg = JSON.parse(content.content);
                contextParts.push(
                  `## Tech Stack (from ${repoSlug}/${file})\n- Name: ${pkg.name}\n- Dependencies: ${Object.keys(pkg.dependencies || {}).join(', ')}\n- Dev Dependencies: ${Object.keys(pkg.devDependencies || {}).slice(0, 10).join(', ')}`,
                );
              } catch {
                // Malformed package.json, skip
              }
            } else {
              contextParts.push(
                `## ${file} (from ${repoSlug})\n${content.content.substring(0, 500)}`,
              );
            }
            break; // Only need one tech file
          }
        } catch {
          // File doesn't exist, skip
        }
      }

      // Priority 4: List top-level directory structure
      try {
        const files = await this.codeHost.listFiles(repoSlug, '', branch);
        if (files?.length) {
          contextParts.push(
            `## Directory Structure (from ${repoSlug})\n${files.slice(0, 30).join('\n')}`,
          );
        }
      } catch {
        // Listing failed, skip
      }
    }

    if (contextParts.length === 0) {
      return 'No repository context could be auto-generated. Please add context manually.';
    }

    // Use AI to synthesize a clean project context from all the raw data
    try {
      const raw = contextParts.join('\n\n---\n\n');
      const agent = await this.codingAgent.spawn({
        prompt: `Analyze the following repository information and create a concise project context document. Include: tech stack, architecture overview, key directories, coding conventions, and any special instructions found in agent/claude config files. Keep it under 1000 words.\n\n${raw}`,
        workingDirectory: process.cwd(),
        timeout: 60000,
      });
      return agent.output || raw;
    } catch (err) {
      this.logger.warn(
        `AI context synthesis failed, returning raw context: ${(err as Error).message}`,
      );
      // AI synthesis failed, return raw context
      return contextParts.join('\n\n');
    }
  }

  extractRepoSlug(url: string): string | null {
    // https://github.com/owner/repo or git@github.com:owner/repo.git
    const httpsMatch = url.match(
      /github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/,
    );
    if (httpsMatch) return httpsMatch[1];
    const sshMatch = url.match(
      /github\.com:([^/]+\/[^/]+?)(?:\.git)?$/,
    );
    if (sshMatch) return sshMatch[1];
    return null;
  }
}
