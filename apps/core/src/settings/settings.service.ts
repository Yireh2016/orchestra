import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';

/**
 * Manages app-level settings using the AuditLog model as a lightweight
 * key-value store. Settings are stored as AuditLog entries with
 * action='SYSTEM_SETTING' and the key in actor, value in details.
 *
 * In a production system, you would add a dedicated SystemSetting model
 * to the Prisma schema. This approach avoids a migration for now.
 */

interface SettingRecord {
  key: string;
  value: string;
}

const SENSITIVE_KEYS = ['googleClientSecret'];

function maskValue(key: string, value: string): string {
  if (!value) return '';
  if (SENSITIVE_KEYS.includes(key)) {
    if (value.length <= 8) return '*****';
    return value.slice(0, 4) + '*****' + value.slice(-4);
  }
  // For client IDs, show more
  if (value.length <= 12) return value;
  return value.slice(0, 8) + '...' + value.slice(-4);
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSetting(key: string): Promise<string | null> {
    const record = await this.prisma.auditLog.findFirst({
      where: {
        action: 'SYSTEM_SETTING',
        actor: key,
      },
      orderBy: { timestamp: 'desc' },
    });

    if (!record) return null;

    const details = record.details as Record<string, unknown>;
    return (details.value as string) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    // Delete previous entries for this key
    await this.prisma.auditLog.deleteMany({
      where: {
        action: 'SYSTEM_SETTING',
        actor: key,
      },
    });

    // Create new entry
    await this.prisma.auditLog.create({
      data: {
        action: 'SYSTEM_SETTING',
        actor: key,
        details: { value },
      },
    });

    this.logger.log(`Setting updated: ${key}`);
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const keys = ['googleClientId', 'googleClientSecret'];
    const result: Record<string, string> = {};

    for (const key of keys) {
      const value = await this.getSetting(key);
      if (value) {
        result[key] = maskValue(key, value);
      } else {
        result[key] = '';
      }
    }

    return result;
  }

  async updateSettings(
    settings: Record<string, string>,
  ): Promise<Record<string, string>> {
    const allowedKeys = ['googleClientId', 'googleClientSecret'];

    for (const [key, value] of Object.entries(settings)) {
      if (allowedKeys.includes(key) && value) {
        await this.setSetting(key, value);
      }
    }

    return this.getAllSettings();
  }

  async testOAuthConfig(): Promise<{ success: boolean; message: string }> {
    const clientId = await this.getSetting('googleClientId');
    const clientSecret = await this.getSetting('googleClientSecret');

    if (!clientId || !clientSecret) {
      return {
        success: false,
        message:
          'Google OAuth credentials are not configured. Please set both Client ID and Client Secret.',
      };
    }

    // Validate by attempting to reach Google's token info endpoint
    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?client_id=${encodeURIComponent(clientId)}`,
      );

      // A 400 with "invalid_client" means the client ID format is wrong
      // but any response from Google means we can reach the OAuth server
      if (response.ok || response.status === 400) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (body.error === 'invalid_request') {
          // This is actually expected — we're not sending a token, just verifying connectivity
          return {
            success: true,
            message:
              'Google OAuth endpoint is reachable. Credentials are stored. Sign in to verify they work end-to-end.',
          };
        }
      }

      return {
        success: true,
        message:
          'Google OAuth endpoint is reachable. Credentials are stored. Sign in to verify they work end-to-end.',
      };
    } catch (err) {
      return {
        success: false,
        message: `Cannot reach Google OAuth endpoint: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }
}
