import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdapterConfigService } from '../../adapter-config.service';
import type {
  ChannelAdapter,
  Message,
  SendMessageParams,
} from '../../interfaces/channel-adapter.interface';

@Injectable()
export class JiraCommentsAdapter implements ChannelAdapter {
  private readonly logger = new Logger(JiraCommentsAdapter.name);
  private readonly envBaseUrl: string;
  private readonly envEmail: string;
  private readonly envApiToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly adapterConfig: AdapterConfigService,
  ) {
    this.envBaseUrl = this.configService.get<string>('JIRA_BASE_URL', '');
    this.envEmail = this.configService.get<string>('JIRA_EMAIL', '');
    this.envApiToken = this.configService.get<string>('JIRA_API_TOKEN', '');
  }

  private async getConnectionConfig(): Promise<{
    baseUrl: string;
    email: string;
    apiToken: string;
  }> {
    const dbConfig = await this.adapterConfig.getConfig('jira-comments');
    if (dbConfig?.baseUrl && dbConfig?.email && dbConfig?.apiToken) {
      return {
        baseUrl: dbConfig.baseUrl,
        email: dbConfig.email,
        apiToken: dbConfig.apiToken,
      };
    }
    // Fall back to jira config if no jira-comments specific config
    const jiraConfig = await this.adapterConfig.getConfig('jira');
    if (jiraConfig?.baseUrl && jiraConfig?.email && jiraConfig?.apiToken) {
      return {
        baseUrl: jiraConfig.baseUrl,
        email: jiraConfig.email,
        apiToken: jiraConfig.apiToken,
      };
    }
    return {
      baseUrl: this.envBaseUrl,
      email: this.envEmail,
      apiToken: this.envApiToken,
    };
  }

  private buildHeaders(email: string, apiToken: string): Record<string, string> {
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    return {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async sendMessage(params: SendMessageParams): Promise<Message> {
    const { baseUrl, email, apiToken } = await this.getConnectionConfig();
    const headers = this.buildHeaders(email, apiToken);
    const issueId = params.threadId;

    const body = {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: params.content }],
          },
        ],
      },
    };

    const response = await fetch(
      `${baseUrl}/rest/api/3/issue/${issueId}/comment`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to add Jira comment: ${response.statusText}`);
    }

    const data = (await response.json()) as any;

    return {
      id: data.id,
      threadId: issueId,
      content: params.content,
      author: data.author?.displayName ?? 'Orchestra',
      timestamp: new Date(data.created),
    };
  }

  async getThread(threadId: string): Promise<Message[]> {
    const { baseUrl, email, apiToken } = await this.getConnectionConfig();
    const headers = this.buildHeaders(email, apiToken);
    const issueId = threadId;

    const response = await fetch(
      `${baseUrl}/rest/api/3/issue/${issueId}/comment`,
      { headers },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch Jira comments: ${response.statusText}`);
    }

    const data = (await response.json()) as any;

    return data.comments.map((c: any) => ({
      id: c.id,
      threadId: issueId,
      content:
        c.body?.content
          ?.map((block: any) =>
            block.content?.map((t: any) => t.text).join(''),
          )
          .join('\n') ?? '',
      author: c.author?.displayName ?? 'unknown',
      timestamp: new Date(c.created),
    }));
  }

  async updateMessage(messageId: string, content: string): Promise<Message> {
    const { baseUrl, email, apiToken } = await this.getConnectionConfig();
    const headers = this.buildHeaders(email, apiToken);
    const [issueId, commentId] = messageId.split(':');

    const response = await fetch(
      `${baseUrl}/rest/api/3/issue/${issueId}/comment/${commentId}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: content }],
              },
            ],
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to update Jira comment: ${response.statusText}`);
    }

    const data = (await response.json()) as any;

    return {
      id: data.id,
      threadId: issueId,
      content,
      author: data.author?.displayName ?? 'Orchestra',
      timestamp: new Date(data.updated),
    };
  }

  async deleteMessage(messageId: string): Promise<void> {
    const { baseUrl, email, apiToken } = await this.getConnectionConfig();
    const headers = this.buildHeaders(email, apiToken);
    const [issueId, commentId] = messageId.split(':');

    const response = await fetch(
      `${baseUrl}/rest/api/3/issue/${issueId}/comment/${commentId}`,
      {
        method: 'DELETE',
        headers,
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to delete Jira comment: ${response.statusText}`);
    }
  }

  async addReaction(_messageId: string, _emoji: string): Promise<void> {
    this.logger.warn('Jira comments do not support reactions');
  }
}
