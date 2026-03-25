import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { DagBuilderService, TaskNode } from './dag-builder.service';

describe('DagBuilderService', () => {
  let service: DagBuilderService;

  beforeEach(() => {
    service = new DagBuilderService();
  });

  describe('buildDag()', () => {
    it('should create correct node structure', () => {
      const tasks: TaskNode[] = [
        { id: 'A', name: 'Task A', dependsOn: [] },
        { id: 'B', name: 'Task B', dependsOn: ['A'] },
      ];

      const dag = service.buildDag(tasks);

      expect(dag.nodes.size).toBe(2);
      expect(dag.nodes.get('A')).toEqual(tasks[0]);
      expect(dag.nodes.get('B')).toEqual(tasks[1]);
      // A -> B (A's adjacency list contains B)
      expect(dag.adjacency.get('A')).toContain('B');
      expect(dag.adjacency.get('B')).toEqual([]);
    });

    it('should handle empty task list', () => {
      const dag = service.buildDag([]);

      expect(dag.nodes.size).toBe(0);
      expect(dag.adjacency.size).toBe(0);
    });

    it('should handle single task with no deps', () => {
      const tasks: TaskNode[] = [
        { id: 'solo', name: 'Solo Task', dependsOn: [] },
      ];

      const dag = service.buildDag(tasks);

      expect(dag.nodes.size).toBe(1);
      expect(dag.adjacency.get('solo')).toEqual([]);
    });

    it('should handle diamond dependency pattern (A->B, A->C, B->D, C->D)', () => {
      const tasks: TaskNode[] = [
        { id: 'A', name: 'Task A', dependsOn: [] },
        { id: 'B', name: 'Task B', dependsOn: ['A'] },
        { id: 'C', name: 'Task C', dependsOn: ['A'] },
        { id: 'D', name: 'Task D', dependsOn: ['B', 'C'] },
      ];

      const dag = service.buildDag(tasks);

      expect(dag.nodes.size).toBe(4);
      expect(dag.adjacency.get('A')).toEqual(
        expect.arrayContaining(['B', 'C']),
      );
      expect(dag.adjacency.get('B')).toContain('D');
      expect(dag.adjacency.get('C')).toContain('D');
      expect(dag.adjacency.get('D')).toEqual([]);
    });

    it('should throw on unknown dependency', () => {
      const tasks: TaskNode[] = [
        { id: 'A', name: 'Task A', dependsOn: ['nonexistent'] },
      ];

      expect(() => service.buildDag(tasks)).toThrow(BadRequestException);
      expect(() => service.buildDag(tasks)).toThrow(
        'Task "A" depends on unknown task "nonexistent"',
      );
    });

    it('should detect cycles and throw (A->B->A)', () => {
      const tasks: TaskNode[] = [
        { id: 'A', name: 'Task A', dependsOn: ['B'] },
        { id: 'B', name: 'Task B', dependsOn: ['A'] },
      ];

      expect(() => service.buildDag(tasks)).toThrow(BadRequestException);
      expect(() => service.buildDag(tasks)).toThrow('Cycle detected');
    });

    it('should detect longer cycles (A->B->C->A)', () => {
      const tasks: TaskNode[] = [
        { id: 'A', name: 'Task A', dependsOn: [] },
        { id: 'B', name: 'Task B', dependsOn: ['A'] },
        { id: 'C', name: 'Task C', dependsOn: ['B'] },
        { id: 'D', name: 'Task D', dependsOn: ['C', 'A'] },
      ];

      // This is valid (no cycle) - D depends on C and A
      const dag = service.buildDag(tasks);
      expect(dag.nodes.size).toBe(4);
    });

    it('should detect self-referencing cycle', () => {
      const tasks: TaskNode[] = [
        { id: 'A', name: 'Task A', dependsOn: ['A'] },
      ];

      expect(() => service.buildDag(tasks)).toThrow(BadRequestException);
      expect(() => service.buildDag(tasks)).toThrow('Cycle detected');
    });
  });

  describe('computeExecutionGroups()', () => {
    it('should compute execution groups (topological sort)', () => {
      const tasks: TaskNode[] = [
        { id: 'A', name: 'Task A', dependsOn: [] },
        { id: 'B', name: 'Task B', dependsOn: ['A'] },
        { id: 'C', name: 'Task C', dependsOn: ['A'] },
        { id: 'D', name: 'Task D', dependsOn: ['B', 'C'] },
      ];

      const dag = service.buildDag(tasks);
      const groups = service.computeExecutionGroups(dag);

      // Group 0: A (no deps)
      expect(groups[0]).toEqual(['A']);
      // Group 1: B, C (both depend only on A)
      expect(groups[1]).toEqual(expect.arrayContaining(['B', 'C']));
      expect(groups[1]).toHaveLength(2);
      // Group 2: D (depends on B and C)
      expect(groups[2]).toEqual(['D']);
    });

    it('should put all independent tasks in the first group', () => {
      const tasks: TaskNode[] = [
        { id: 'A', name: 'Task A', dependsOn: [] },
        { id: 'B', name: 'Task B', dependsOn: [] },
        { id: 'C', name: 'Task C', dependsOn: [] },
      ];

      const dag = service.buildDag(tasks);
      const groups = service.computeExecutionGroups(dag);

      expect(groups).toHaveLength(1);
      expect(groups[0]).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    });

    it('should handle linear dependency chain', () => {
      const tasks: TaskNode[] = [
        { id: 'A', name: 'Task A', dependsOn: [] },
        { id: 'B', name: 'Task B', dependsOn: ['A'] },
        { id: 'C', name: 'Task C', dependsOn: ['B'] },
      ];

      const dag = service.buildDag(tasks);
      const groups = service.computeExecutionGroups(dag);

      expect(groups).toHaveLength(3);
      expect(groups[0]).toEqual(['A']);
      expect(groups[1]).toEqual(['B']);
      expect(groups[2]).toEqual(['C']);
    });

    it('should return empty groups for empty dag', () => {
      const dag = service.buildDag([]);
      const groups = service.computeExecutionGroups(dag);
      expect(groups).toEqual([]);
    });
  });
});
