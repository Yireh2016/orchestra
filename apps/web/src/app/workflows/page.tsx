"use client";

import { Header } from "@/components/layout/header";
import { useState } from "react";

const states = ["All", "Running", "Completed", "Failed", "Gated", "Paused", "Cancelled"];

const workflows = [
  { id: "WF-1042", ticket: "PROJ-318", template: "Full CI/CD Pipeline", state: "Running", started: "2025-03-25 09:12", updated: "2 min ago" },
  { id: "WF-1041", ticket: "PROJ-315", template: "Bug Fix Flow", state: "Completed", started: "2025-03-25 08:30", updated: "45 min ago" },
  { id: "WF-1040", ticket: "PROJ-312", template: "Feature Development", state: "Running", started: "2025-03-25 07:15", updated: "5 min ago" },
  { id: "WF-1039", ticket: "PROJ-310", template: "Hotfix Pipeline", state: "Failed", started: "2025-03-25 06:45", updated: "1 hr ago" },
  { id: "WF-1038", ticket: "PROJ-308", template: "Full CI/CD Pipeline", state: "Completed", started: "2025-03-24 22:10", updated: "8 hrs ago" },
  { id: "WF-1037", ticket: "PROJ-305", template: "Feature Development", state: "Gated", started: "2025-03-24 21:00", updated: "3 hrs ago" },
  { id: "WF-1036", ticket: "PROJ-302", template: "Bug Fix Flow", state: "Paused", started: "2025-03-24 18:30", updated: "12 hrs ago" },
  { id: "WF-1035", ticket: "PROJ-299", template: "Full CI/CD Pipeline", state: "Cancelled", started: "2025-03-24 16:00", updated: "14 hrs ago" },
];

function stateColor(state: string) {
  switch (state) {
    case "Running": return "bg-emerald-500/15 text-emerald-400";
    case "Completed": return "bg-sky-500/15 text-sky-400";
    case "Failed": return "bg-red-500/15 text-red-400";
    case "Gated": return "bg-amber-500/15 text-amber-400";
    case "Paused": return "bg-orange-500/15 text-orange-400";
    case "Cancelled": return "bg-zinc-500/15 text-zinc-400";
    default: return "bg-[var(--muted)] text-[var(--muted-foreground)]";
  }
}

export default function WorkflowsPage() {
  const [filter, setFilter] = useState("All");

  const filtered = filter === "All" ? workflows : workflows.filter((w) => w.state === filter);

  return (
    <div className="p-8">
      <Header
        title="Workflows"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Workflows" }]}
        actions={
          <a
            href="/workflows/templates"
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
          >
            New Workflow
          </a>
        }
      />

      <div className="mt-6 flex items-center gap-3">
        <label className="text-sm text-[var(--muted-foreground)]">Filter by state:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        >
          {states.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Ticket</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Template</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">State</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Started</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((wf) => (
              <tr key={wf.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/50 transition-colors">
                <td className="px-4 py-3">
                  <a href={`/workflows/${wf.id}`} className="font-mono text-[var(--primary)] hover:underline">
                    {wf.ticket}
                  </a>
                </td>
                <td className="px-4 py-3 text-[var(--foreground)]">{wf.template}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${stateColor(wf.state)}`}>
                    {wf.state}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--muted-foreground)]">{wf.started}</td>
                <td className="px-4 py-3 text-[var(--muted-foreground)]">{wf.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
