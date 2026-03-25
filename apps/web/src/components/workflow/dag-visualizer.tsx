interface Task {
  id: string;
  name: string;
  status: "completed" | "running" | "pending" | "failed";
  dependencies: string[];
}

interface DagVisualizerProps {
  tasks: Task[];
}

function statusColor(status: Task["status"]) {
  switch (status) {
    case "completed": return "border-emerald-500 bg-emerald-500/10 text-emerald-400";
    case "running": return "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] ring-2 ring-[var(--primary)]/20";
    case "failed": return "border-red-500 bg-red-500/10 text-red-400";
    case "pending": return "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]";
  }
}

function statusIcon(status: Task["status"]) {
  switch (status) {
    case "completed":
      return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      );
    case "running":
      return <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--primary)]" />;
    case "failed":
      return (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    case "pending":
      return <div className="h-2 w-2 rounded-full bg-[var(--muted-foreground)]" />;
  }
}

export function DagVisualizer({ tasks }: DagVisualizerProps) {
  // Organize tasks into layers by dependency depth
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  function getDepth(taskId: string, visited = new Set<string>()): number {
    if (visited.has(taskId)) return 0;
    visited.add(taskId);
    const task = taskMap.get(taskId);
    if (!task || task.dependencies.length === 0) return 0;
    return 1 + Math.max(...task.dependencies.map((d) => getDepth(d, visited)));
  }

  const layers: Task[][] = [];
  for (const task of tasks) {
    const depth = getDepth(task.id);
    if (!layers[depth]) layers[depth] = [];
    layers[depth].push(task);
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 overflow-x-auto">
      <div className="flex items-start gap-8">
        {layers.map((layer, layerIdx) => (
          <div key={layerIdx} className="flex flex-col items-center gap-4">
            {layer.map((task) => (
              <div key={task.id} className="flex items-center">
                {/* Connector from previous layer */}
                {layerIdx > 0 && (
                  <div className="flex flex-col items-center justify-center mr-4">
                    {task.dependencies.map((depId) => (
                      <div key={depId} className="flex items-center">
                        <div className="h-px w-8 bg-[var(--border)]" />
                        <svg className="h-2 w-2 -ml-1 text-[var(--border)]" viewBox="0 0 8 8" fill="currentColor">
                          <polygon points="0,0 8,4 0,8" />
                        </svg>
                      </div>
                    ))}
                    {task.dependencies.length === 0 && <div className="w-12" />}
                  </div>
                )}

                {/* Task node */}
                <div
                  className={`flex items-center gap-2.5 rounded-lg border-2 px-4 py-2.5 text-sm min-w-[140px] ${statusColor(task.status)}`}
                >
                  {statusIcon(task.status)}
                  <span className="font-medium whitespace-nowrap">{task.name}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 flex items-center gap-6 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted-foreground)]">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[var(--primary)] animate-pulse" />
          <span>Running</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
          <span>Failed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[var(--muted-foreground)]" />
          <span>Pending</span>
        </div>
      </div>
    </div>
  );
}
