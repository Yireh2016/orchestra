export const CODE_HOST_ADAPTER = Symbol('CODE_HOST_ADAPTER');

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  sourceBranch: string;
  targetBranch: string;
  url: string;
  author: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewComment {
  id: string;
  body: string;
  path: string;
  line: number;
  author: string;
  createdAt: Date;
}

export interface FileContent {
  path: string;
  content: string;
  sha: string;
}

export interface CodeHostAdapter {
  createPullRequest(params: {
    title: string;
    body: string;
    sourceBranch: string;
    targetBranch: string;
    repo: string;
  }): Promise<PullRequest>;
  getPullRequest(repo: string, prNumber: number): Promise<PullRequest>;
  mergePullRequest(repo: string, prNumber: number): Promise<void>;
  getReviewComments(repo: string, prNumber: number): Promise<ReviewComment[]>;
  addReviewComment(
    repo: string,
    prNumber: number,
    comment: { body: string; path: string; line: number },
  ): Promise<ReviewComment>;
  createBranch(repo: string, branchName: string, fromRef: string): Promise<void>;
  getFileContent(repo: string, path: string, ref: string): Promise<FileContent>;
  listFiles(repo: string, path: string, ref: string): Promise<string[]>;
}
