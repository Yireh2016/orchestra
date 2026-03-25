import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ChannelAdapter,
  Message,
  SendMessageParams,
} from '../../interfaces/channel-adapter.interface';

@Injectable()
export class JiraCommentsAdapter implements ChannelAdapter {
  private readonly logger = new Logger(JiraCommentsAdapter.name);
  private readonly baseUrl: string;
  private readonly email: string;
  private readonly apiToken: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('JIRA_BASE_URL', '');
    this.email = this.configService.get<string>('JIRA_EMAIL', '');
    this.apiToken = this.configService.get<string>('JIRA_API_TOKEN', '');
  }

  private get headers(): Record<string, string> {
    const auth = Buffer.from(`${this.email}:${this.apiToken}`).toString(
      'base64',
    );
    return {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async sendMessage(params: SendMessageParams): Promise<Message> {
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
      `${this.baseUrl}/rest/api/3/issue/${issueId}/comment`,
      {
        method: 'POST',
        headers: this.headers,
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
    const issueId = threadId;

    const response = await fetch(
      `${this.baseUrl}/rest/api/3/issue/${issueId}/comment`,
      { headers: this.headers },
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
    const [issueId, commentId] = messageId.split(':');

    const response = await fetch(
      `${this.baseUrl}/rest/api/3/issue/${issueId}/comment/${commentId}`,
      {
        method: 'PUT',
        headers: this.headers,
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
    const [issueId, commentId] = messageId.split(':');

    const response = await fetch(
      `${this.baseUrl}/rest/api/3/issue/${issueId}/comment/${commentId}`,
      {
        method: 'DELETE',
        headers: this.headers,
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
