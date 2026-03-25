import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TemplateService } from './template.service';
import { createMockPrisma, MockPrisma } from '../test/mock-prisma';

describe('TemplateService', () => {
  let service: TemplateService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new TemplateService(prisma as any);
  });

  describe('create()', () => {
    it('should create a template with version 1 and isPublished false', async () => {
      const input = {
        name: 'Bug Fix Workflow',
        description: 'Handles bug fixes',
        phases: [{ handler: 'interview', name: 'Interview' }],
        triggerConfig: { source: 'jira' },
        teamId: 'team-1',
      };

      const expected = { id: 'tpl-1', ...input, version: 1, isPublished: false };
      prisma.workflowTemplate.create.mockResolvedValue(expected);

      const result = await service.create(input);

      expect(result).toEqual(expected);
      expect(prisma.workflowTemplate.create).toHaveBeenCalledWith({
        data: {
          name: 'Bug Fix Workflow',
          description: 'Handles bug fixes',
          phases: input.phases,
          triggerConfig: input.triggerConfig,
          version: 1,
          teamId: 'team-1',
          isPublished: false,
        },
      });
    });
  });

  describe('findById()', () => {
    it('should return a template by id', async () => {
      const template = { id: 'tpl-1', name: 'My Template' };
      prisma.workflowTemplate.findUnique.mockResolvedValue(template);

      const result = await service.findById('tpl-1');
      expect(result).toEqual(template);
    });

    it('should throw NotFoundException when template not found', async () => {
      prisma.workflowTemplate.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('list()', () => {
    it('should return all templates', async () => {
      const templates = [
        { id: 'tpl-1', name: 'Template 1' },
        { id: 'tpl-2', name: 'Template 2' },
      ];
      prisma.workflowTemplate.findMany.mockResolvedValue(templates);

      const result = await service.list();
      expect(result).toEqual(templates);
    });

    it('should filter by teamId', async () => {
      prisma.workflowTemplate.findMany.mockResolvedValue([]);
      await service.list({ teamId: 'team-1' });
      expect(prisma.workflowTemplate.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1' },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should filter by isPublished', async () => {
      prisma.workflowTemplate.findMany.mockResolvedValue([]);
      await service.list({ isPublished: true });
      expect(prisma.workflowTemplate.findMany).toHaveBeenCalledWith({
        where: { isPublished: true },
        orderBy: { updatedAt: 'desc' },
      });
    });
  });

  describe('update()', () => {
    it('should update template fields', async () => {
      const existing = { id: 'tpl-1', name: 'Old Name' };
      prisma.workflowTemplate.findUnique.mockResolvedValue(existing);

      const updated = { id: 'tpl-1', name: 'New Name' };
      prisma.workflowTemplate.update.mockResolvedValue(updated);

      const result = await service.update('tpl-1', { name: 'New Name' });
      expect(result).toEqual(updated);
      expect(prisma.workflowTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
        data: { name: 'New Name' },
      });
    });

    it('should throw NotFoundException when updating nonexistent template', async () => {
      prisma.workflowTemplate.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', { name: 'New' })).rejects.toThrow(NotFoundException);
    });

    it('should handle phases and triggerConfig in update data', async () => {
      const existing = { id: 'tpl-1', name: 'Template' };
      prisma.workflowTemplate.findUnique.mockResolvedValue(existing);
      prisma.workflowTemplate.update.mockResolvedValue(existing);

      const newPhases = [{ handler: 'execution', name: 'Execute' }];
      const newTrigger = { source: 'github' };

      await service.update('tpl-1', { phases: newPhases, triggerConfig: newTrigger });

      expect(prisma.workflowTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
        data: { phases: newPhases, triggerConfig: newTrigger },
      });
    });
  });

  describe('clone()', () => {
    it('should create a deep copy with (Copy) suffix and version 1', async () => {
      const source = {
        id: 'tpl-1',
        name: 'Original Template',
        description: 'Original description',
        phases: [{ handler: 'interview' }],
        triggerConfig: { source: 'jira' },
        version: 5,
        teamId: 'team-1',
        isPublished: true,
      };
      prisma.workflowTemplate.findUnique.mockResolvedValue(source);

      const cloned = {
        id: 'tpl-2',
        name: 'Original Template (Copy)',
        description: 'Original description',
        phases: [{ handler: 'interview' }],
        triggerConfig: { source: 'jira' },
        version: 1,
        teamId: 'team-1',
        parentTemplateId: 'tpl-1',
        isPublished: false,
      };
      prisma.workflowTemplate.create.mockResolvedValue(cloned);

      const result = await service.clone('tpl-1');

      expect(result.name).toBe('Original Template (Copy)');
      expect(result.version).toBe(1);
      expect(result.parentTemplateId).toBe('tpl-1');
      expect(result.isPublished).toBe(false);

      const createCall = prisma.workflowTemplate.create.mock.calls[0][0];
      expect(createCall.data.name).toBe('Original Template (Copy)');
      expect(createCall.data.version).toBe(1);
      expect(createCall.data.parentTemplateId).toBe('tpl-1');
      expect(createCall.data.isPublished).toBe(false);
      expect(createCall.data.id).toBeDefined();
    });

    it('should throw NotFoundException when cloning nonexistent template', async () => {
      prisma.workflowTemplate.findUnique.mockResolvedValue(null);

      await expect(service.clone('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('publish()', () => {
    it('should set isPublished to true and increment version', async () => {
      const template = { id: 'tpl-1', version: 2, isPublished: false };
      prisma.workflowTemplate.findUnique.mockResolvedValue(template);

      const published = { id: 'tpl-1', version: 3, isPublished: true };
      prisma.workflowTemplate.update.mockResolvedValue(published);

      const result = await service.publish('tpl-1');

      expect(result.isPublished).toBe(true);
      expect(result.version).toBe(3);
      expect(prisma.workflowTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
        data: { isPublished: true, version: { increment: 1 } },
      });
    });

    it('should throw NotFoundException when publishing nonexistent template', async () => {
      prisma.workflowTemplate.findUnique.mockResolvedValue(null);

      await expect(service.publish('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unpublish()', () => {
    it('should set isPublished to false', async () => {
      const template = { id: 'tpl-1', isPublished: true };
      prisma.workflowTemplate.findUnique.mockResolvedValue(template);

      const unpublished = { id: 'tpl-1', isPublished: false };
      prisma.workflowTemplate.update.mockResolvedValue(unpublished);

      const result = await service.unpublish('tpl-1');

      expect(result.isPublished).toBe(false);
      expect(prisma.workflowTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
        data: { isPublished: false },
      });
    });

    it('should throw NotFoundException when unpublishing nonexistent template', async () => {
      prisma.workflowTemplate.findUnique.mockResolvedValue(null);

      await expect(service.unpublish('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
