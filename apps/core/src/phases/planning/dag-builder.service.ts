import { Injectable, BadRequestException } from '@nestjs/common';

export interface TaskNode {
  id: string;
  name: string;
  dependsOn: string[];
}

export interface Dag {
  nodes: Map<string, TaskNode>;
  adjacency: Map<string, string[]>;
}

@Injectable()
export class DagBuilderService {
  buildDag(tasks: TaskNode[]): Dag {
    const nodes = new Map<string, TaskNode>();
    const adjacency = new Map<string, string[]>();

    for (const task of tasks) {
      nodes.set(task.id, task);
      adjacency.set(task.id, []);
    }

    for (const task of tasks) {
      for (const dep of task.dependsOn) {
        if (!nodes.has(dep)) {
          throw new BadRequestException(
            `Task "${task.id}" depends on unknown task "${dep}"`,
          );
        }
        adjacency.get(dep)!.push(task.id);
      }
    }

    const dag: Dag = { nodes, adjacency };
    this.validateNoCycles(dag);

    return dag;
  }

  computeExecutionGroups(dag: Dag): string[][] {
    const inDegree = new Map<string, number>();

    for (const [nodeId] of dag.nodes) {
      inDegree.set(nodeId, 0);
    }

    for (const [, neighbors] of dag.adjacency) {
      for (const neighbor of neighbors) {
        inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) + 1);
      }
    }

    const groups: string[][] = [];
    const remaining = new Map(inDegree);

    while (remaining.size > 0) {
      const group: string[] = [];

      for (const [nodeId, degree] of remaining) {
        if (degree === 0) {
          group.push(nodeId);
        }
      }

      if (group.length === 0) {
        throw new BadRequestException(
          'Cycle detected in task dependency graph',
        );
      }

      for (const nodeId of group) {
        remaining.delete(nodeId);
        const neighbors = dag.adjacency.get(nodeId) ?? [];
        for (const neighbor of neighbors) {
          if (remaining.has(neighbor)) {
            remaining.set(neighbor, remaining.get(neighbor)! - 1);
          }
        }
      }

      groups.push(group);
    }

    return groups;
  }

  private validateNoCycles(dag: Dag): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const neighbors = dag.adjacency.get(nodeId) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const [nodeId] of dag.nodes) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId)) {
          throw new BadRequestException(
            'Cycle detected in task dependency graph',
          );
        }
      }
    }
  }
}
