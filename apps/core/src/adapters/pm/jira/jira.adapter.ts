import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdapterConfigService } from '../../adapter-config.service';
import type {
  PMAdapter,
  Ticket,
  TicketComment,
  TicketTransition,
  CreateTicketParams,
} from '../../interfaces/pm-adapter.interface';

@Injectable()
export class JiraAdapter implements PMAdapter {
  private readonly logger = new Logger(JiraAdapter.name);
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
    const dbConfig = await this.adapterConfig.getConfig('jira');
    if (dbConfig?.baseUrl && dbConfig?.email && dbConfig?.apiToken) {
      return {
        baseUrl: dbConfig.baseUrl,
        email: dbConfig.email,
        apiToken: dbConfig.apiToken,
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

  async getTicket(ticketId: string): Promise<Ticket> {
    const { baseUrl, email, apiToken } = await this.getConnectionConfig();
    const headers = this.buildHeaders(email, apiToken);

    const response = await fetch(
      `${baseUrl}/rest/api/3/issue/${ticketId}`,
      { headers },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch Jira issue ${ticketId}: ${response.statusText}`);
    }

    const data = (await response.json()) as any;

    return {
      id: data.id,
      key: data.key,
      summary: data.fields.summary,
      description: this.extractTextFromAdf(data.fields.description),
      status: data.fields.status.name,
      assignee: data.fields.assignee?.displayName ?? null,
      labels: data.fields.labels ?? [],
      priority: data.fields.priority?.name ?? 'Medium',
      createdAt: new Date(data.fields.created),
      updatedAt: new Date(data.fields.updated),
    };
  }

  async updateTicket(
    ticketId: string,
    update: Partial<Pick<Ticket, 'summary' | 'description' | 'assignee' | 'labels'>>,
  ): Promise<Ticket> {
    const { baseUrl, email, apiToken } = await this.getConnectionConfig();
    const headers = this.buildHeaders(email, apiToken);

    const fields: Record<string, unknown> = {};

    if (update.summary) fields.summary = update.summary;
    if (update.description) {
      fields.description = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: update.description }],
          },
        ],
      };
    }
    if (update.labels) fields.labels = update.labels;

    await fetch(`${baseUrl}/rest/api/3/issue/${ticketId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ fields }),
    });

    return this.getTicket(ticketId);
  }

  async getComments(ticketId: string): Promise<TicketComment[]> {
    const { baseUrl, email, apiToken } = await this.getConnectionConfig();
    const headers = this.buildHeaders(email, apiToken);

    const response = await fetch(
      `${baseUrl}/rest/api/3/issue/${ticketId}/comment`,
      { headers },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch comments for ${ticketId}`);
    }

    const data = (await response.json()) as any;

    return data.comments.map((c: any) => ({
      id: c.id,
      author: c.author.displayName,
      body: this.extractTextFromAdf(c.body),
      createdAt: new Date(c.created),
    }));
  }

  async addComment(ticketId: string, body: string): Promise<TicketComment> {
    const { baseUrl, email, apiToken } = await this.getConnectionConfig();
    const headers = this.buildHeaders(email, apiToken);

    const response = await fetch(
      `${baseUrl}/rest/api/3/issue/${ticketId}/comment`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: body }],
              },
            ],
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to add comment to ${ticketId}`);
    }

    const data = (await response.json()) as any;

    return {
      id: data.id,
      author: data.author.displayName,
      body,
      createdAt: new Date(data.created),
    };
  }

  async getTransitions(ticketId: string): Promise<TicketTransition[]> {
    const { baseUrl, email, apiToken } = await this.getConnectionConfig();
    const headers = this.buildHeaders(email, apiToken);

    const response = await fetch(
      `${baseUrl}/rest/api/3/issue/${ticketId}/transitions`,
      { headers },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch transitions for ${ticketId}`);
    }

    const data = (await response.json()) as any;

    return data.transitions.map((t: any) => ({
      id: t.id,
      name: t.name,
      to: t.to.name,
    }));
  }

  async transitionTicket(
    ticketId: string,
    transitionId: string,
  ): Promise<void> {
    const { baseUrl, email, apiToken } = await this.getConnectionConfig();
    const headers = this.buildHeaders(email, apiToken);

    const response = await fetch(
      `${baseUrl}/rest/api/3/issue/${ticketId}/transitions`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          transition: { id: transitionId },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to transition ${ticketId}`);
    }
  }

  async searchTickets(query: string): Promise<Ticket[]> {
    const { baseUrl, email, apiToken } = await this.getConnectionConfig();
    const headers = this.buildHeaders(email, apiToken);

    const response = await fetch(
      `${baseUrl}/rest/api/3/search`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jql: query,
          maxResults: 50,
          fields: [
            'summary',
            'description',
            'status',
            'assignee',
            'labels',
            'priority',
            'created',
            'updated',
          ],
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Jira search failed: ${response.statusText}`);
    }

    const data = (await response.json()) as any;

    return data.issues.map((issue: any) => ({
      id: issue.id,
      key: issue.key,
      summary: issue.fields.summary,
      description: this.extractTextFromAdf(issue.fields.description),
      status: issue.fields.status.name,
      assignee: issue.fields.assignee?.displayName ?? null,
      labels: issue.fields.labels ?? [],
      priority: issue.fields.priority?.name ?? 'Medium',
      createdAt: new Date(issue.fields.created),
      updatedAt: new Date(issue.fields.updated),
    }));
  }

  async createTicket(params: CreateTicketParams): Promise<Ticket> {
    const config = await this.getConnectionConfig();
    const baseUrl = config.baseUrl;
    const headers = {
      'Authorization': `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    const body: any = {
      fields: {
        summary: params.summary,
        description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: params.description }] }] },
        project: { key: params.parentTicketId?.split('-')[0] || 'PROJ' },
        issuetype: { name: 'Task' },
      },
    };
    if (params.labels?.length) body.fields.labels = params.labels;
    if (params.priority) body.fields.priority = { name: params.priority };
    if (params.parentTicketId) body.fields.parent = { key: params.parentTicketId };

    const response = await fetch(`${baseUrl}/rest/api/3/issue`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Jira createTicket failed: ${response.status}`);
    const data = (await response.json()) as any;
    return this.getTicket(data.key);
  }

  async linkTickets(parentId: string, childId: string, linkType?: string): Promise<void> {
    const config = await this.getConnectionConfig();
    const baseUrl = config.baseUrl;
    const headers = {
      'Authorization': `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    const response = await fetch(`${baseUrl}/rest/api/3/issueLink`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: { name: linkType || 'Blocks' },
        inwardIssue: { key: parentId },
        outwardIssue: { key: childId },
      }),
    });
    if (!response.ok) throw new Error(`Jira linkTickets failed: ${response.status}`);
  }

  /**
   * Recursively extract plain text from Atlassian Document Format (ADF).
   * Handles paragraphs, headings, lists, code blocks, mentions, links, etc.
   */
  private extractTextFromAdf(adf: any): string {
    if (!adf || !adf.content) return '';

    const extractNode = (node: any): string => {
      if (!node) return '';

      // Text node
      if (node.type === 'text') return node.text ?? '';

      // Mention node (@user)
      if (node.type === 'mention') return node.attrs?.text ?? `@${node.attrs?.id ?? 'user'}`;

      // Emoji
      if (node.type === 'emoji') return node.attrs?.shortName ?? '';

      // Hard break
      if (node.type === 'hardBreak') return '\n';

      // Inline card (link)
      if (node.type === 'inlineCard') return node.attrs?.url ?? '';

      // Block nodes with children
      if (node.content && Array.isArray(node.content)) {
        const childText = node.content.map(extractNode).join('');

        switch (node.type) {
          case 'paragraph': return childText + '\n';
          case 'heading': return childText + '\n';
          case 'bulletList':
          case 'orderedList': return childText;
          case 'listItem': return '- ' + childText;
          case 'codeBlock': return '```\n' + childText + '\n```\n';
          case 'blockquote': return '> ' + childText;
          case 'table':
          case 'tableRow':
          case 'tableCell':
          case 'tableHeader': return childText + ' | ';
          default: return childText;
        }
      }

      return '';
    };

    return adf.content.map(extractNode).join('').trim();
  }
}
