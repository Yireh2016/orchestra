import { Header } from "@/components/layout/header";

const stats = [
  { label: "Active Workflows", value: "12", change: "+3 today", color: "text-[var(--primary)]" },
  { label: "Tasks Running", value: "47", change: "8 queued", color: "text-emerald-400" },
  { label: "Agents Online", value: "6", change: "2 idle", color: "text-sky-400" },
  { label: "Success Rate", value: "94.2%", change: "+1.3% this week", color: "text-amber-400" },
];

const recentWorkflows = [
  { id: "WF-1042", ticket: "PROJ-318", template: "Full CI/CD Pipeline", state: "Running", phase: "Code Review", started: "12 min ago" },
  { id: "WF-1041", ticket: "PROJ-315", template: "Bug Fix Flow", state: "Completed", phase: "Deploy", started: "1 hr ago" },
  { id: "WF-1040", ticket: "PROJ-312", template: "Feature Development", state: "Running", phase: "Implementation", started: "2 hrs ago" },
  { id: "WF-1039", ticket: "PROJ-310", template: "Hotfix Pipeline", state: "Failed", phase: "Testing", started: "3 hrs ago" },
  { id: "WF-1038", ticket: "PROJ-308", template: "Full CI/CD Pipeline", state: "Completed", phase: "Deploy", started: "5 hrs ago" },
  { id: "WF-1037", ticket: "PROJ-305", template: "Feature Development", state: "Gated", phase: "Code Review", started: "6 hrs ago" },
];

function stateColor(state: string) {
  switch (state) {
    case "Running": return "bg-emerald-500/15 text-emerald-400";
    case "Completed": return "bg-sky-500/15 text-sky-400";
    case "Failed": return "bg-red-500/15 text-red-400";
    case "Gated": return "bg-amber-500/15 text-amber-400";
    default: return "bg-[var(--muted)] text-[var(--muted-foreground)]";
  }
}

export default function DashboardPage() {
  return (
    <div className="p-8">
      <Header title="Dashboard" />

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
          >
            <p className="text-sm text-[var(--muted-foreground)]">{stat.label}</p>
            <p className={`mt-2 text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{stat.change}</p>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Recent Workflows</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">ID</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Ticket</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Template</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">State</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Phase</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Started</th>
              </tr>
            </thead>
            <tbody>
              {recentWorkflows.map((wf) => (
                <tr key={wf.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-[var(--primary)]">{wf.id}</td>
                  <td className="px-4 py-3 text-[var(--foreground)]">{wf.ticket}</td>
                  <td className="px-4 py-3 text-[var(--foreground)]">{wf.template}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${stateColor(wf.state)}`}>
                      {wf.state}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{wf.phase}</td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{wf.started}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
