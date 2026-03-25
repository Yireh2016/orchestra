import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntegrationService } from './integration.service';
import { createMockPrisma, MockPrisma } from '../test/mock-prisma';

describe('IntegrationService', () => {
  let service: IntegrationService;
  let prisma: MockPrisma;
  let crypto: { encrypt: ReturnType<typeof vi.fn>; decrypt: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = createMockPrisma();
    crypto = {
      encrypt: vi.fn((val: string) => `encrypted:${val}`),
      decrypt: vi.fn((val: string) => val.replace('encrypted:', '')),
    };
    service = new IntegrationService(prisma as any, crypto as any);
  });

  const makeIntegration = (
    adapterName: string,
    config: Record<string, any>,
    overrides: Record<string, any> = {},
  ) => ({
    id: 'int-1',
    type: 'CODE_HOST' as const,
    adapterName,
    config,
    teamId: 'team-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('create()', () => {
    it('should encrypt secret fields for github integration', async () => {
      const input = {
        type: 'CODE_HOST' as const,
        adapterName: 'github',
        config: { owner: 'acme', token: 'ghp_secret123' },
        teamId: 'team-1',
      };

      const created = makeIntegration('github', {
        owner: 'acme',
        token: 'encrypted:ghp_secret123',
      });
      prisma.integration.create.mockResolvedValue(created);

      const result = await service.create(input);

      expect(crypto.encrypt).toHaveBeenCalledWith('ghp_secret123');
      expect(prisma.integration.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          config: expect.objectContaining({
            token: 'encrypted:ghp_secret123',
          }),
        }),
      });
      // Result should have secrets masked
      expect((result.config as any).token).toBe('*****');
    });

    it('should encrypt multiple secret fields for slack integration', async () => {
      const input = {
        type: 'CHANNEL' as const,
        adapterName: 'slack',
        config: { channelId: 'C123', botToken: 'xoxb-secret', signingSecret: 'sign-secret' },
        teamId: 'team-1',
      };

      const created = makeIntegration('slack', {
        channelId: 'C123',
        botToken: 'encrypted:xoxb-secret',
        signingSecret: 'encrypted:sign-secret',
      });
      prisma.integration.create.mockResolvedValue(created);

      await service.create(input);

      expect(crypto.encrypt).toHaveBeenCalledWith('xoxb-secret');
      expect(crypto.encrypt).toHaveBeenCalledWith('sign-secret');
    });

    it('should not encrypt fields for unknown adapter types', async () => {
      const input = {
        type: 'PM' as const,
        adapterName: 'unknown-adapter',
        config: { key: 'value', secret: 'plain' },
        teamId: 'team-1',
      };

      const created = makeIntegration('unknown-adapter', { key: 'value', secret: 'plain' });
      prisma.integration.create.mockResolvedValue(created);

      await service.create(input);
      expect(crypto.encrypt).not.toHaveBeenCalled();
    });
  });

  describe('findAll()', () => {
    it('should return integrations with secrets masked', async () => {
      const integrations = [
        makeIntegration('github', { owner: 'acme', token: 'encrypted:ghp_secret' }),
      ];
      prisma.integration.findMany.mockResolvedValue(integrations);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect((result[0].config as any).token).toBe('*****');
      expect((result[0].config as any).owner).toBe('acme');
    });

    it('should filter by teamId when provided', async () => {
      prisma.integration.findMany.mockResolvedValue([]);
      await service.findAll('team-1');
      expect(prisma.integration.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should query all integrations when no teamId provided', async () => {
      prisma.integration.findMany.mockResolvedValue([]);
      await service.findAll();
      expect(prisma.integration.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne()', () => {
    it('should return integration with secrets masked', async () => {
      const integration = makeIntegration('github', { owner: 'acme', token: 'encrypted:secret' });
      prisma.integration.findUniqueOrThrow.mockResolvedValue(integration);

      const result = await service.findOne('int-1');
      expect((result.config as any).token).toBe('*****');
      expect((result.config as any).owner).toBe('acme');
    });
  });

  describe('findOneDecrypted()', () => {
    it('should return integration with decrypted secrets', async () => {
      const integration = makeIntegration('github', { owner: 'acme', token: 'encrypted:ghp_secret' });
      prisma.integration.findUniqueOrThrow.mockResolvedValue(integration);

      const result = await service.findOneDecrypted('int-1');

      expect(crypto.decrypt).toHaveBeenCalledWith('encrypted:ghp_secret');
      expect((result.config as any).token).toBe('ghp_secret');
      expect((result.config as any).owner).toBe('acme');
    });

    it('should not decrypt fields that are already masked as *****', async () => {
      const integration = makeIntegration('github', { owner: 'acme', token: '*****' });
      prisma.integration.findUniqueOrThrow.mockResolvedValue(integration);

      await service.findOneDecrypted('int-1');
      expect(crypto.decrypt).not.toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('should preserve existing secrets when ***** is sent', async () => {
      const existing = makeIntegration('github', {
        owner: 'acme',
        token: 'encrypted:original-secret',
      });
      prisma.integration.findUniqueOrThrow.mockResolvedValue(existing);

      const updated = makeIntegration('github', {
        owner: 'acme-new',
        token: 'encrypted:original-secret',
      });
      prisma.integration.update.mockResolvedValue(updated);

      await service.update('int-1', {
        config: { owner: 'acme-new', token: '*****' },
      });

      expect(prisma.integration.update).toHaveBeenCalledWith({
        where: { id: 'int-1' },
        data: {
          config: expect.objectContaining({
            token: 'encrypted:original-secret',
            owner: 'acme-new',
          }),
        },
      });
      expect(crypto.encrypt).not.toHaveBeenCalledWith('*****');
    });

    it('should encrypt new secret values', async () => {
      const existing = makeIntegration('github', {
        owner: 'acme',
        token: 'encrypted:old-secret',
      });
      prisma.integration.findUniqueOrThrow.mockResolvedValue(existing);

      const updated = makeIntegration('github', {
        owner: 'acme',
        token: 'encrypted:new-secret',
      });
      prisma.integration.update.mockResolvedValue(updated);

      await service.update('int-1', { config: { token: 'new-secret' } });
      expect(crypto.encrypt).toHaveBeenCalledWith('new-secret');
    });

    it('should update adapterName if provided', async () => {
      const existing = makeIntegration('github', { owner: 'acme' });
      prisma.integration.findUniqueOrThrow.mockResolvedValue(existing);
      prisma.integration.update.mockResolvedValue(existing);

      await service.update('int-1', { adapterName: 'new-adapter' });

      expect(prisma.integration.update).toHaveBeenCalledWith({
        where: { id: 'int-1' },
        data: expect.objectContaining({ adapterName: 'new-adapter' }),
      });
    });
  });

  describe('delete()', () => {
    it('should remove the integration', async () => {
      prisma.integration.delete.mockResolvedValue(undefined);
      await service.delete('int-1');
      expect(prisma.integration.delete).toHaveBeenCalledWith({ where: { id: 'int-1' } });
    });
  });

  describe('testConnection()', () => {
    it('should return success for a successful jira connection', async () => {
      const integration = makeIntegration('jira', {
        baseUrl: 'https://acme.atlassian.net',
        email: 'user@acme.com',
        apiToken: 'encrypted:jira-token',
      });
      prisma.integration.findUniqueOrThrow.mockResolvedValue(integration);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ displayName: 'John Doe' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await service.testConnection('int-1');
      expect(result.success).toBe(true);
      expect(result.message).toContain('John Doe');

      vi.unstubAllGlobals();
    });

    it('should return failure when connection test fails', async () => {
      const integration = makeIntegration('jira', {
        baseUrl: 'https://bad-url.example.com',
        email: 'user@acme.com',
        apiToken: 'encrypted:jira-token',
      });
      prisma.integration.findUniqueOrThrow.mockResolvedValue(integration);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await service.testConnection('int-1');
      expect(result.success).toBe(false);
      expect(result.message).toContain('401');

      vi.unstubAllGlobals();
    });

    it('should return failure for unsupported adapter types', async () => {
      const integration = makeIntegration('unknown-adapter', {});
      prisma.integration.findUniqueOrThrow.mockResolvedValue(integration);

      const result = await service.testConnection('int-1');
      expect(result.success).toBe(false);
      expect(result.message).toContain('No test available');
    });
  });
});
