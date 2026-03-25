import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import { CryptoService } from '../integrations/crypto.service';

@Injectable()
export class AdapterConfigService {
  private readonly secretFields: Record<string, string[]> = {
    jira: ['apiToken'],
    github: ['token'],
    slack: ['botToken', 'signingSecret'],
    'claude-code': ['apiKey'],
    'jira-comments': ['apiToken'],
  };

  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
  ) {}

  async getConfig(
    adapterName: string,
    teamId?: string,
  ): Promise<Record<string, any> | null> {
    const integration = await this.prisma.integration.findFirst({
      where: { adapterName, ...(teamId && { teamId }) },
    });
    if (!integration) return null;

    const config = { ...(integration.config as Record<string, any>) };
    const secrets = this.secretFields[adapterName] || [];
    for (const field of secrets) {
      if (config[field]) {
        try {
          config[field] = this.crypto.decrypt(config[field]);
        } catch {
          // Field might not be encrypted (legacy data)
        }
      }
    }
    return config;
  }
}
