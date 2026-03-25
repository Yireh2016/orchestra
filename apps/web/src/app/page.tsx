"use client";

import { Header } from "@/components/layout/header";
import { useEffect, useState, useCallback } from "react";
import { getWorkflows, getTemplates, getAgents, Workflow, WorkflowTemplate, Agent } from "@/lib/api-client";
import { useRealtimeEvents } from "@/hooks/use-realtime";

function stateColor(state: string) {
  switch (state) {
    case "running": return "bg-emerald-500/15 text-emerald-400";
    case "completed": return "bg-sky-500/15 text-sky-400";
    case "failed": return "bg-red-500/15 text-red-400";
    case "gated": return "bg-amber-500/15 text-amber-400";
    case "paused": return "bg-orange-500/15 text-orange-400";
    case "cancelled": return "bg-zinc-500/15 text-zinc-400";
    default: return "bg-[var(--muted)] text-[var(--muted-foreground)]";
  }
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const WORKFLOW_EVENT_TYPES = [
  'workflow.started', 'workflow.paused', 'workflow.resumed', 'workflow.completed',
  'phase.started', 'phase.completed',
  'task.queued', 'task.started', 'task.completed', 'task.failed',
  'agent.spawned', 'agent.completed', 'agent.stopped',
];

export default function DashboardPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [agentsList, setAgentsList] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { events, connected } = useRealtimeEvents(WORKFLOW_EVENT_TYPES);

  const loadData = useCallback(async () => {
    try {
      const [wfs, tpls, ags] = await Promise.all([getWorkflows(), getTemplates(), getAgents()]);
      setWorkflows(wfs);
      setTemplates(tpls);
      setAgentsList(ags);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refetch when relevant WebSocket events arrive
  useEffect(() => {
    if (events.length > 0) {
      loadData();
    }
  }, [events.length, loadData]);

  const activeWorkflows = workflows.filter(
    (w) => w.state !== "completed" && w.state !== "failed" && w.state !== "cancelled"
  );
  const runningTasks = workflows.filter((w) => w.state === "running").length;
  const completed = workflows.filter((w) => w.state === "completed").length;
  const failed = workflows.filter((w) => w.state === "failed").length;
  const total = completed + failed;
  const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : "N/A";

  const stats = [
    { label: "Active Workflows", value: loading ? "..." : String(activeWorkflows.length), change: loading ? "" : `${workflows.length} total`, color: "text-[var(--primary)]" },
    { label: "Agents Online", value: loading ? "..." : String(agentsList.filter((a) => a.status === "running").length), change: loading ? "" : `${agentsList.length} total`, color: "text-emerald-400" },
    { label: "Templates", value: loading ? "..." : String(templates.length), change: "", color: "text-sky-400" },
    { label: "Success Rate", value: loading ? "..." : total > 0 ? `${successRate}%` : "N/A", change: loading ? "" : `${total} finished`, color: "text-amber-400" },
  ];

  const recentWorkflows = [...workflows]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  if (error) {
    return (
      <div className="p-8">
        <Header title="Dashboard" />
        <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
          <p className="font-medium">Error loading dashboard</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Header
        title="Dashboard"
        actions={
          <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <span className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'}`} />
            {connected ? 'Live' : 'Offline'}
          </div>
        }
      />

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6"
          >
            <p className="text-sm text-[var(--muted-foreground)]">{stat.label}</p>
            <p className={`mt-2 text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            {stat.change && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{stat.change}</p>}
          </div>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Recent Workflows</h2>
        {loading ? (
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">Loading...</p>
        ) : recentWorkflows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">No workflows yet. Create one from the Workflows page.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Ticket</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Template</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">State</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Started</th>
                </tr>
              </thead>
              <tbody>
                {recentWorkflows.map((wf) => (
                  <tr key={wf.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/50 transition-colors">
                    <td className="px-4 py-3">
                      <a href={`/workflows/${wf.id}`} className="font-mono text-[var(--primary)] hover:underline">
                        {wf.id.slice(0, 8)}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-[var(--foreground)]">{wf.ticketId}</td>
                    <td className="px-4 py-3 text-[var(--foreground)]">{wf.templateId}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${stateColor(wf.state)}`}>
                        {wf.state}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{timeAgo(wf.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
