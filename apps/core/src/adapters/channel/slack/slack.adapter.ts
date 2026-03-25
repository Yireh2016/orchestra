import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdapterConfigService } from '../../adapter-config.service';
import type {
  ChannelAdapter,
  Message,
  SendMessageParams,
} from '../../interfaces/channel-adapter.interface';

@Injectable()
export class SlackAdapter implements ChannelAdapter {
  private readonly logger = new Logger(SlackAdapter.name);
  private readonly baseUrl = 'https://slack.com/api';
  private readonly envToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly adapterConfig: AdapterConfigService,
  ) {
    this.envToken = this.configService.get<string>('SLACK_BOT_TOKEN', '');
  }

  private async getToken(): Promise<string> {
    const dbConfig = await this.adapterConfig.getConfig('slack');
    if (dbConfig?.botToken) {
      return dbConfig.botToken;
    }
    return this.envToken;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async sendMessage(params: SendMessageParams): Promise<Message> {
    const headers = await this.getHeaders();
    const body: Record<string, unknown> = {
      channel: params.threadId,
      text: params.content,
    };

    if (params.attachments?.length) {
      body.attachments = params.attachments.map((a) => ({
        title: a.title,
        text: a.content,
      }));
    }

    const response = await fetch(`${this.baseUrl}/chat.postMessage`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as any;

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return {
      id: data.message.ts,
      threadId: params.threadId,
      content: params.content,
      author: data.message.bot_id ?? 'bot',
      timestamp: new Date(parseFloat(data.message.ts) * 1000),
    };
  }

  async getThread(threadId: string): Promise<Message[]> {
    const headers = await this.getHeaders();
    const [channel, ts] = threadId.includes(':')
      ? threadId.split(':')
      : [threadId, undefined];

    const url = new URL(`${this.baseUrl}/conversations.replies`);
    url.searchParams.set('channel', channel);
    if (ts) url.searchParams.set('ts', ts);

    const response = await fetch(url.toString(), { headers });

    const data = (await response.json()) as any;

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return data.messages.map((m: any) => ({
      id: m.ts,
      threadId,
      content: m.text,
      author: m.user ?? m.bot_id ?? 'unknown',
      timestamp: new Date(parseFloat(m.ts) * 1000),
    }));
  }

  async updateMessage(messageId: string, content: string): Promise<Message> {
    const headers = await this.getHeaders();
    const [channel, ts] = messageId.split(':');

    const response = await fetch(`${this.baseUrl}/chat.update`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        channel,
        ts,
        text: content,
      }),
    });

    const data = (await response.json()) as any;

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return {
      id: data.ts,
      threadId: channel,
      content,
      author: 'bot',
      timestamp: new Date(parseFloat(data.ts) * 1000),
    };
  }

  async deleteMessage(messageId: string): Promise<void> {
    const headers = await this.getHeaders();
    const [channel, ts] = messageId.split(':');

    const response = await fetch(`${this.baseUrl}/chat.delete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ channel, ts }),
    });

    const data = (await response.json()) as any;

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }
  }

  async addReaction(messageId: string, emoji: string): Promise<void> {
    const headers = await this.getHeaders();
    const [channel, ts] = messageId.split(':');

    const response = await fetch(`${this.baseUrl}/reactions.add`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        channel,
        timestamp: ts,
        name: emoji,
      }),
    });

    const data = (await response.json()) as any;

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }
  }
}
