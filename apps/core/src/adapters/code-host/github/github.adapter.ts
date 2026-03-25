import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CodeHostAdapter,
  PullRequest,
  ReviewComment,
  FileContent,
} from '../../interfaces/code-host-adapter.interface';

@Injectable()
export class GitHubAdapter implements CodeHostAdapter {
  private readonly logger = new Logger(GitHubAdapter.name);
  private readonly baseUrl = 'https://api.github.com';
  private readonly token: string;

  constructor(private readonly configService: ConfigService) {
    this.token = this.configService.get<string>('GITHUB_TOKEN', '');
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  async createPullRequest(params: {
    title: string;
    body: string;
    sourceBranch: string;
    targetBranch: string;
    repo: string;
  }): Promise<PullRequest> {
    const response = await fetch(
      `${this.baseUrl}/repos/${params.repo}/pulls`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          title: params.title,
          body: params.body,
          head: params.sourceBranch,
          base: params.targetBranch,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to create PR: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    return this.mapPullRequest(data);
  }

  async getPullRequest(repo: string, prNumber: number): Promise<PullRequest> {
    const response = await fetch(
      `${this.baseUrl}/repos/${repo}/pulls/${prNumber}`,
      { headers: this.headers },
    );

    if (!response.ok) {
      throw new Error(`Failed to get PR #${prNumber}: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    return this.mapPullRequest(data);
  }

  async mergePullRequest(repo: string, prNumber: number): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/repos/${repo}/pulls/${prNumber}/merge`,
      {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify({ merge_method: 'squash' }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to merge PR #${prNumber}: ${response.statusText}`);
    }
  }

  async getReviewComments(
    repo: string,
    prNumber: number,
  ): Promise<ReviewComment[]> {
    const response = await fetch(
      `${this.baseUrl}/repos/${repo}/pulls/${prNumber}/comments`,
      { headers: this.headers },
    );

    if (!response.ok) {
      throw new Error(`Failed to get review comments: ${response.statusText}`);
    }

    const data = (await response.json()) as any[];

    return data.map((c) => ({
      id: String(c.id),
      body: c.body,
      path: c.path,
      line: c.line ?? c.original_line ?? 0,
      author: c.user.login,
      createdAt: new Date(c.created_at),
    }));
  }

  async addReviewComment(
    repo: string,
    prNumber: number,
    comment: { body: string; path: string; line: number },
  ): Promise<ReviewComment> {
    const pr = await this.getPullRequest(repo, prNumber);

    const response = await fetch(
      `${this.baseUrl}/repos/${repo}/pulls/${prNumber}/comments`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          body: comment.body,
          commit_id: '', // Would need the latest commit SHA
          path: comment.path,
          line: comment.line,
          side: 'RIGHT',
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to add review comment: ${response.statusText}`);
    }

    const data = (await response.json()) as any;

    return {
      id: String(data.id),
      body: data.body,
      path: data.path,
      line: data.line ?? 0,
      author: data.user.login,
      createdAt: new Date(data.created_at),
    };
  }

  async createBranch(
    repo: string,
    branchName: string,
    fromRef: string,
  ): Promise<void> {
    const refResponse = await fetch(
      `${this.baseUrl}/repos/${repo}/git/ref/heads/${fromRef}`,
      { headers: this.headers },
    );

    if (!refResponse.ok) {
      throw new Error(`Failed to get ref ${fromRef}: ${refResponse.statusText}`);
    }

    const refData = (await refResponse.json()) as any;
    const sha = refData.object.sha;

    const response = await fetch(
      `${this.baseUrl}/repos/${repo}/git/refs`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to create branch ${branchName}: ${response.statusText}`);
    }
  }

  async getFileContent(
    repo: string,
    path: string,
    ref: string,
  ): Promise<FileContent> {
    const response = await fetch(
      `${this.baseUrl}/repos/${repo}/contents/${path}?ref=${ref}`,
      { headers: this.headers },
    );

    if (!response.ok) {
      throw new Error(`Failed to get file ${path}: ${response.statusText}`);
    }

    const data = (await response.json()) as any;

    return {
      path: data.path,
      content: Buffer.from(data.content, 'base64').toString('utf-8'),
      sha: data.sha,
    };
  }

  async listFiles(
    repo: string,
    path: string,
    ref: string,
  ): Promise<string[]> {
    const response = await fetch(
      `${this.baseUrl}/repos/${repo}/contents/${path}?ref=${ref}`,
      { headers: this.headers },
    );

    if (!response.ok) {
      throw new Error(`Failed to list files: ${response.statusText}`);
    }

    const data = (await response.json()) as any[];
    return data.map((f) => f.path);
  }

  private mapPullRequest(data: any): PullRequest {
    return {
      id: String(data.id),
      number: data.number,
      title: data.title,
      body: data.body ?? '',
      state: data.merged
        ? 'merged'
        : (data.state as 'open' | 'closed'),
      sourceBranch: data.head.ref,
      targetBranch: data.base.ref,
      url: data.html_url,
      author: data.user.login,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }
}
