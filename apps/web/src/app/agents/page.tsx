"use client";

import { Header } from "@/components/layout/header";
import { useEffect, useState, useRef, useCallback } from "react";
import { getAgents, getAgentLogs, stopAgent, Agent } from "@/lib/api-client";
import { useRealtimeEvents } from "@/hooks/use-realtime";

const MAX_AGENT_SLOTS = 10;

function statusBadge(status: string) {
  switch (status) {
    case "running":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "idle":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    case "failed":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function statusDot(status: string) {
  switch (status) {
    case "running":
      return "bg-emerald-500";
    case "idle":
      return "bg-zinc-500";
    case "failed":
      return "bg-red-500";
    default:
      return "bg-zinc-500";
  }
}

function formatDuration(startedAt: string | null | undefined): string {
  if (!startedAt) return "--";
  const diff = Date.now() - new Date(startedAt).getTime();
  if (diff < 0) return "--";
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function truncateId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

const AGENT_EVENT_TYPES = ['agent.spawned', 'agent.completed', 'agent.stopped'];

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logAgentId, setLogAgentId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [stopping, setStopping] = useState<Set<string>>(new Set());
  const logEndRef = useRef<HTMLDivElement>(null);
  const { events: agentEvents, connected } = useRealtimeEvents(AGENT_EVENT_TYPES);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await getAgents();
      setAgents(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Refetch when agent WebSocket events arrive
  useEffect(() => {
    if (agentEvents.length > 0) {
      fetchAgents();
    }
  }, [agentEvents.length, fetchAgents]);

  // Auto-refresh logs every 3 seconds while log viewer is open
  useEffect(() => {
    if (!logAgentId) {
      setLogs([]);
      return;
    }

    let cancelled = false;

    async function fetchLogs() {
      if (!logAgentId) return;
      setLogsLoading(true);
      try {
        const data = await getAgentLogs(logAgentId);
        if (!cancelled) {
          setLogs(data.logs);
        }
      } catch {
        if (!cancelled) {
          setLogs(["Error fetching logs."]);
        }
      } finally {
        if (!cancelled) setLogsLoading(false);
      }
    }

    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [logAgentId]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function handleStop(agentId: string) {
    if (!confirm(`Are you sure you want to stop agent ${truncateId(agentId)}?`)) return;
    setStopping((prev) => new Set(prev).add(agentId));
    try {
      await stopAgent(agentId);
      await fetchAgents();
    } catch {
      alert("Failed to stop agent.");
    } finally {
      setStopping((prev) => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    }
  }

  const runningCount = agents.filter((a) => a.status === "running").length;
  const totalActive = agents.length;
  const availableSlots = Math.max(0, MAX_AGENT_SLOTS - totalActive);

  if (error && agents.length === 0) {
    return (
      <div className="p-8">
        <Header
          title="Agents"
          breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Agents" }]}
        />
        <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
          <p className="font-medium">Error loading agents</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Header
        title="Agents"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Agents" }]}
        actions={
          <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <span className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'}`} />
            {connected ? 'Live' : 'Offline'}
          </div>
        }
      />

      {/* Summary Stats */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Total Active</p>
          <p className="mt-2 text-3xl font-bold text-[var(--primary)]">
            {loading ? "..." : totalActive}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Running</p>
          <p className="mt-2 text-3xl font-bold text-emerald-400">
            {loading ? "..." : runningCount}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--muted-foreground)]">Available Slots</p>
          <p className="mt-2 text-3xl font-bold text-sky-400">
            {loading ? "..." : availableSlots}
          </p>
        </div>
      </div>

      {/* Agent Table */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Active Agents</h2>

        {loading ? (
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">Loading agents...</p>
        ) : agents.length === 0 ? (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-10 text-center">
            <p className="text-lg font-medium text-[var(--foreground)]">No active agents</p>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Agents are spawned automatically when workflows run tasks.
              Create a workflow to get started.
            </p>
            <a
              href="/workflows"
              className="mt-4 inline-block rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
            >
              Go to Workflows
            </a>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">ID</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Workflow</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Task</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Started</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Duration</th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <tr
                      key={agent.id}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-[var(--foreground)]" title={agent.id}>
                          {truncateId(agent.id)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge(agent.status)}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${statusDot(agent.status)}`} />
                          {agent.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {agent.workflowRunId ? (
                          <a
                            href={`/workflows/${agent.workflowRunId}`}
                            className="font-mono text-[var(--primary)] hover:underline"
                          >
                            {truncateId(agent.workflowRunId)}
                          </a>
                        ) : (
                          <span className="text-[var(--muted-foreground)]">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {agent.taskId ? (
                          <span className="font-mono text-[var(--foreground)]">
                            {truncateId(agent.taskId)}
                          </span>
                        ) : (
                          <span className="text-[var(--muted-foreground)]">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">
                        {agent.startedAt
                          ? new Date(agent.startedAt).toLocaleTimeString()
                          : "--"}
                      </td>
                      <td className="px-4 py-3 text-[var(--foreground)]">
                        {formatDuration(agent.startedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setLogAgentId(agent.id)}
                            className="rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                          >
                            View Logs
                          </button>
                          {agent.status === "running" && (
                            <button
                              onClick={() => handleStop(agent.id)}
                              disabled={stopping.has(agent.id)}
                              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                            >
                              {stopping.has(agent.id) ? "Stopping..." : "Stop"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Log Viewer Modal */}
      {logAgentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="relative mx-4 flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  Agent Logs
                </h3>
                <p className="mt-0.5 font-mono text-xs text-[var(--muted-foreground)]">
                  {logAgentId}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {logsLoading && (
                  <span className="text-xs text-[var(--muted-foreground)]">Refreshing...</span>
                )}
                <button
                  onClick={() => setLogAgentId(null)}
                  className="rounded-md border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Terminal-style log output */}
            <div
              className="flex-1 overflow-y-auto bg-[#0d1117] p-4"
              style={{ minHeight: "300px", maxHeight: "60vh" }}
            >
              {logs.length === 0 ? (
                <p className="font-mono text-sm text-zinc-500">No logs available.</p>
              ) : (
                <pre className="font-mono text-sm leading-relaxed text-emerald-400 whitespace-pre-wrap break-words">
                  {logs.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </pre>
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
