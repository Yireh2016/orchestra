"use client";

import { useState } from "react";

export interface DagTask {
  id: string;
  name: string;
  status: "pending" | "queued" | "running" | "completed" | "failed" | "skipped";
  dependencies: string[];
  branch?: string | null;
  executionGroup?: number | null;
}

interface DagVisualizerProps {
  tasks: DagTask[];
  executionGroups?: string[][];
}

function statusColor(status: DagTask["status"]) {
  switch (status) {
    case "completed": return "border-emerald-500 bg-emerald-500/10 text-emerald-400";
    case "running": return "border-yellow-500 bg-yellow-500/10 text-yellow-400 ring-2 ring-yellow-500/20";
    case "queued": return "border-blue-500 bg-blue-500/10 text-blue-400";
    case "failed": return "border-red-500 bg-red-500/10 text-red-400";
    case "skipped": return "border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)] opacity-60";
    case "pending":
    default: return "border-zinc-500 bg-zinc-500/5 text-[var(--muted-foreground)]";
  }
}

function statusDotColor(status: DagTask["status"]) {
  switch (status) {
    case "completed": return "bg-emerald-500";
    case "running": return "bg-yellow-500 animate-pulse";
    case "queued": return "bg-blue-500";
    case "failed": return "bg-red-500";
    case "skipped": return "bg-zinc-400";
    case "pending":
    default: return "bg-zinc-500";
  }
}

function statusIcon(status: DagTask["status"]) {
  switch (status) {
    case "completed":
      return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      );
    case "running":
      return <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-yellow-400" />;
    case "queued":
      return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "failed":
      return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    case "skipped":
      return (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061A1.125 1.125 0 013 16.811V8.69z" />
        </svg>
      );
    case "pending":
    default:
      return <div className="h-2 w-2 rounded-full bg-[var(--muted-foreground)]" />;
  }
}

export function DagVisualizer({ tasks, executionGroups }: DagVisualizerProps) {
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);

  // Build groups: either from executionGroups prop or from task.executionGroup field, or by DAG layers
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  let groups: DagTask[][] = [];

  if (executionGroups && executionGroups.length > 0) {
    // Use provided execution groups
    for (const groupIds of executionGroups) {
      const groupTasks = groupIds.map((id) => taskMap.get(id)).filter(Boolean) as DagTask[];
      if (groupTasks.length > 0) groups.push(groupTasks);
    }
  } else {
    // Organize by executionGroup field, then fall back to dependency depth
    const byGroup = new Map<number, DagTask[]>();
    let hasGroups = false;
    for (const task of tasks) {
      if (task.executionGroup != null) {
        hasGroups = true;
        const g = byGroup.get(task.executionGroup) || [];
        g.push(task);
        byGroup.set(task.executionGroup, g);
      }
    }
    if (hasGroups) {
      const sortedKeys = [...byGroup.keys()].sort((a, b) => a - b);
      groups = sortedKeys.map((k) => byGroup.get(k)!);
    } else {
      // Fall back to dependency depth layers
      function getDepth(taskId: string, visited = new Set<string>()): number {
        if (visited.has(taskId)) return 0;
        visited.add(taskId);
        const task = taskMap.get(taskId);
        if (!task || task.dependencies.length === 0) return 0;
        return 1 + Math.max(...task.dependencies.map((d) => getDepth(d, visited)));
      }
      const layers: DagTask[][] = [];
      for (const task of tasks) {
        const depth = getDepth(task.id);
        if (!layers[depth]) layers[depth] = [];
        layers[depth].push(task);
      }
      groups = layers.filter(Boolean);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 overflow-x-auto">
      <div className="flex items-start gap-6">
        {groups.map((group, groupIdx) => (
          <div key={groupIdx} className="flex items-start gap-6">
            {/* Group column */}
            <div className="flex flex-col items-center gap-3">
              <span className="mb-1 rounded-full bg-[var(--muted)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                Group {groupIdx + 1}
              </span>
              {group.map((task) => (
                <div
                  key={task.id}
                  className="relative"
                  onMouseEnter={() => setHoveredTask(task.id)}
                  onMouseLeave={() => setHoveredTask(null)}
                >
                  {/* Connector from previous group */}
                  {groupIdx > 0 && task.dependencies.length > 0 && (
                    <div className="absolute -left-6 top-1/2 -translate-y-1/2 flex items-center">
                      <div className="h-px w-4 bg-[var(--border)]" />
                      <svg className="h-2 w-2 -ml-0.5 text-[var(--border)]" viewBox="0 0 8 8" fill="currentColor">
                        <polygon points="0,0 8,4 0,8" />
                      </svg>
                    </div>
                  )}

                  {/* Task node */}
                  <div
                    className={`flex flex-col gap-1 rounded-lg border-2 px-4 py-2.5 text-sm min-w-[160px] cursor-pointer transition-all hover:shadow-md ${statusColor(task.status)}`}
                  >
                    <div className="flex items-center gap-2">
                      {statusIcon(task.status)}
                      <span className="font-medium whitespace-nowrap">{task.name}</span>
                    </div>
                    {task.branch && (
                      <span className="text-[10px] font-mono opacity-70 truncate max-w-[180px]">
                        {task.branch}
                      </span>
                    )}
                  </div>

                  {/* Tooltip */}
                  {hoveredTask === task.id && (
                    <div className="absolute -top-24 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-xl text-xs whitespace-nowrap">
                      <p className="font-semibold text-[var(--foreground)]">{task.name}</p>
                      <p className="text-[var(--muted-foreground)]">Status: <span className="capitalize">{task.status}</span></p>
                      {task.branch && <p className="font-mono text-[var(--muted-foreground)]">{task.branch}</p>}
                      {task.dependencies.length > 0 && (
                        <p className="text-[var(--muted-foreground)]">
                          Deps: {task.dependencies.map((d) => taskMap.get(d)?.name || d).join(", ")}
                        </p>
                      )}
                      <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 h-2 w-2 rotate-45 border-b border-r border-[var(--border)] bg-[var(--card)]" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Visual separator between groups */}
            {groupIdx < groups.length - 1 && (
              <div className="flex items-center self-stretch">
                <div className="h-full w-px bg-[var(--border)] opacity-40" style={{ minHeight: "40px" }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap items-center gap-5 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted-foreground)]">
        {(
          [
            ["pending", "Pending"],
            ["queued", "Queued"],
            ["running", "Running"],
            ["completed", "Passed"],
            ["failed", "Failed"],
            ["skipped", "Skipped"],
          ] as const
        ).map(([status, label]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`h-2.5 w-2.5 rounded-full ${statusDotColor(status)}`} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
