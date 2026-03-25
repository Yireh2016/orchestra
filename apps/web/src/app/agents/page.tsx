import { Header } from "@/components/layout/header";

const agents = [
  { name: "Claude Code (Primary)", type: "LLM Agent", status: "online", activeTasks: 3, maxConcurrent: 5, cpu: 42, memory: 68 },
  { name: "Claude Code (Secondary)", type: "LLM Agent", status: "online", activeTasks: 2, maxConcurrent: 5, cpu: 31, memory: 55 },
  { name: "Cursor Agent #1", type: "IDE Agent", status: "online", activeTasks: 1, maxConcurrent: 3, cpu: 58, memory: 72 },
  { name: "Cursor Agent #2", type: "IDE Agent", status: "idle", activeTasks: 0, maxConcurrent: 3, cpu: 5, memory: 20 },
  { name: "ESLint Bot", type: "Linter", status: "online", activeTasks: 2, maxConcurrent: 10, cpu: 15, memory: 30 },
  { name: "Test Runner", type: "Test Agent", status: "online", activeTasks: 1, maxConcurrent: 8, cpu: 78, memory: 85 },
  { name: "Deploy Agent", type: "Deploy", status: "offline", activeTasks: 0, maxConcurrent: 2, cpu: 0, memory: 0 },
];

function statusColor(status: string) {
  switch (status) {
    case "online": return "bg-emerald-500";
    case "idle": return "bg-amber-500";
    case "offline": return "bg-zinc-500";
    default: return "bg-zinc-500";
  }
}

function usageColor(pct: number) {
  if (pct >= 80) return "bg-red-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-emerald-500";
}

export default function AgentsPage() {
  return (
    <div className="p-8">
      <Header
        title="Agents"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Agents" }]}
        actions={
          <button className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
            Register Agent
          </button>
        }
      />

      <div className="mt-8 overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Name</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Type</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Status</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Active Tasks</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Max Concurrent</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">CPU</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Memory</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.name} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--foreground)]">{agent.name}</td>
                <td className="px-4 py-3 text-[var(--muted-foreground)]">{agent.type}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${statusColor(agent.status)}`} />
                    <span className="capitalize text-[var(--foreground)]">{agent.status}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--foreground)]">{agent.activeTasks}</td>
                <td className="px-4 py-3 text-[var(--muted-foreground)]">{agent.maxConcurrent}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--muted)]">
                      <div className={`h-full rounded-full ${usageColor(agent.cpu)}`} style={{ width: `${agent.cpu}%` }} />
                    </div>
                    <span className="text-xs text-[var(--muted-foreground)]">{agent.cpu}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--muted)]">
                      <div className={`h-full rounded-full ${usageColor(agent.memory)}`} style={{ width: `${agent.memory}%` }} />
                    </div>
                    <span className="text-xs text-[var(--muted-foreground)]">{agent.memory}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
