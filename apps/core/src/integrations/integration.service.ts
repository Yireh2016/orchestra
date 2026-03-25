import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import { CryptoService } from './crypto.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import type { Integration } from '@prisma/client';

@Injectable()
export class IntegrationService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
  ) {}

  private readonly secretFields: Record<string, string[]> = {
    jira: ['apiToken'],
    github: ['token'],
    slack: ['botToken', 'signingSecret'],
    'claude-code': ['apiKey'],
    'jira-comments': ['apiToken'],
  };

  async create(data: CreateIntegrationDto): Promise<Integration> {
    const config = { ...data.config };
    const secrets = this.secretFields[data.adapterName] || [];
    for (const field of secrets) {
      if (config[field]) {
        config[field] = this.crypto.encrypt(config[field] as string);
      }
    }
    const integration = await this.prisma.integration.create({
      data: {
        type: data.type,
        adapterName: data.adapterName,
        config: config as any,
        teamId: data.teamId,
      },
    });
    return this.maskSecrets(integration);
  }

  async findAll(teamId?: string): Promise<Integration[]> {
    const integrations = await this.prisma.integration.findMany({
      where: teamId ? { teamId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return integrations.map((i) => this.maskSecrets(i));
  }

  async findOne(id: string): Promise<Integration> {
    const integration = await this.prisma.integration.findUniqueOrThrow({
      where: { id },
    });
    return this.maskSecrets(integration);
  }

  async findOneDecrypted(id: string): Promise<Integration> {
    const integration = await this.prisma.integration.findUniqueOrThrow({
      where: { id },
    });
    return this.decryptSecrets(integration);
  }

  async update(id: string, data: UpdateIntegrationDto): Promise<Integration> {
    const existing = await this.prisma.integration.findUniqueOrThrow({
      where: { id },
    });
    const existingConfig = existing.config as Record<string, any>;
    const newConfig = { ...existingConfig, ...(data.config || {}) };

    const secrets = this.secretFields[existing.adapterName] || [];
    for (const field of secrets) {
      if (newConfig[field] && newConfig[field] !== '*****') {
        newConfig[field] = this.crypto.encrypt(newConfig[field] as string);
      } else if (newConfig[field] === '*****') {
        newConfig[field] = existingConfig[field];
      }
    }

    const updated = await this.prisma.integration.update({
      where: { id },
      data: {
        config: newConfig as any,
        ...(data.adapterName && { adapterName: data.adapterName }),
      },
    });
    return this.maskSecrets(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.integration.delete({ where: { id } });
  }

  async testConnection(
    id: string,
  ): Promise<{ success: boolean; message: string }> {
    const integration = this.decryptSecrets(
      await this.prisma.integration.findUniqueOrThrow({ where: { id } }),
    );
    const config = integration.config as Record<string, any>;

    try {
      switch (integration.adapterName) {
        case 'jira': {
          const jiraResp = await fetch(
            `${config.baseUrl}/rest/api/3/myself`,
            {
              headers: {
                Authorization: `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`,
                Accept: 'application/json',
              },
            },
          );
          if (!jiraResp.ok)
            throw new Error(`Jira returned ${jiraResp.status}`);
          const jiraUser = (await jiraResp.json()) as any;
          return {
            success: true,
            message: `Connected as ${jiraUser.displayName}`,
          };
        }

        case 'github': {
          const ghResp = await fetch('https://api.github.com/user', {
            headers: {
              Authorization: `Bearer ${config.token}`,
              Accept: 'application/vnd.github+json',
            },
          });
          if (!ghResp.ok)
            throw new Error(`GitHub returned ${ghResp.status}`);
          const ghUser = (await ghResp.json()) as any;
          return {
            success: true,
            message: `Connected as ${ghUser.login}`,
          };
        }

        case 'slack': {
          const slackResp = await fetch('https://slack.com/api/auth.test', {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.botToken}` },
          });
          const slackData = (await slackResp.json()) as any;
          if (!slackData.ok) throw new Error(slackData.error);
          return {
            success: true,
            message: `Connected as ${slackData.bot_id} in ${slackData.team}`,
          };
        }

        case 'claude-code': {
          const claudeResp = await fetch(
            'https://api.anthropic.com/v1/messages',
            {
              method: 'POST',
              headers: {
                'x-api-key': config.apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'ping' }],
              }),
            },
          );
          if (!claudeResp.ok && claudeResp.status === 401)
            throw new Error('Invalid API key');
          return { success: true, message: 'API key is valid' };
        }

        default:
          return {
            success: false,
            message: `No test available for ${integration.adapterName}`,
          };
      }
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  private maskSecrets(integration: Integration): Integration {
    const config = { ...(integration.config as Record<string, any>) };
    const secrets = this.secretFields[integration.adapterName] || [];
    for (const field of secrets) {
      if (config[field]) {
        config[field] = '*****';
      }
    }
    return { ...integration, config };
  }

  private decryptSecrets(integration: Integration): Integration {
    const config = { ...(integration.config as Record<string, any>) };
    const secrets = this.secretFields[integration.adapterName] || [];
    for (const field of secrets) {
      if (config[field] && config[field] !== '*****') {
        try {
          config[field] = this.crypto.decrypt(config[field]);
        } catch {
          // Field might not be encrypted (legacy data)
        }
      }
    }
    return { ...integration, config };
  }
}
