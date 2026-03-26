"use client";

import { Header } from "@/components/layout/header";
import { PhaseTimeline, type Phase } from "@/components/workflow/phase-timeline";
import { DagVisualizer, type DagTask } from "@/components/workflow/dag-visualizer";
import { GateStatus, type Gate } from "@/components/workflow/gate-status";
import { use, useCallback, useEffect, useRef, useState } from "react";
import {
  getWorkflow,
  getWorkflowTasks,
  getTemplate,
  getAuditLogs,
  pauseWorkflow,
  resumeWorkflow,
  rerunWorkflow,
  transitionWorkflow,
  type Workflow,
  type Task,
  type WorkflowTemplate,
  type AuditLog,
} from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stateColor(state: string) {
  switch (state) {
    case "running": return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "completed": return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "failed": return "bg-red-500/15 text-red-300 border-red-500/30";
    case "gated": return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "paused": return "bg-orange-500/15 text-orange-300 border-orange-500/30";
    case "cancelled": return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    case "pending": return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
    default: return "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]";
  }
}

function actionColor(action: string) {
  if (action.includes("fail") || action.includes("error")) return "bg-red-500/15 text-red-400";
  if (action.includes("complet") || action.includes("pass") || action.includes("approv")) return "bg-emerald-500/15 text-emerald-400";
  if (action.includes("start") || action.includes("run") || action.includes("execut")) return "bg-blue-500/15 text-blue-400";
  if (action.includes("pause") || action.includes("gate") || action.includes("wait")) return "bg-amber-500/15 text-amber-400";
  if (action.includes("cancel") || action.includes("skip")) return "bg-zinc-500/15 text-zinc-400";
  return "bg-[var(--muted)] text-[var(--muted-foreground)]";
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ---------------------------------------------------------------------------
// Phase data type helpers
// ---------------------------------------------------------------------------

interface PhaseDataMap {
  interview?: {
    status?: string;
    startedAt?: string;
    completedAt?: string;
    spec?: string;
    questions?: Array<{ question: string; answer?: string }>;
    responses?: Record<string, string>;
  };
  research?: {
    status?: string;
    startedAt?: string;
    completedAt?: string;
    artifacts?: { research?: string };
    findings?: string[];
    progress?: number;
  };
  planning?: {
    status?: string;
    startedAt?: string;
    completedAt?: string;
    tasks?: unknown[];
    dag?: Record<string, unknown>;
    executionGroups?: string[][];
    approvalStatus?: string;
  };
  execution?: {
    status?: string;
    startedAt?: string;
    completedAt?: string;
    tasksCompleted?: number;
    tasksTotal?: number;
    currentAgent?: string;
  };
  review?: {
    status?: string;
    startedAt?: string;
    completedAt?: string;
    prs?: Array<{ url?: string; title?: string; status?: string }>;
    mergeProgress?: number;
  };
  [key: string]: unknown;
}

// Map workflow tasks to DagTask format
function mapTaskToDag(task: Task): DagTask {
  const statusMap: Record<string, DagTask["status"]> = {
    pending: "pending",
    running: "running",
    completed: "completed",
    failed: "failed",
    skipped: "skipped",
  };
  return {
    id: task.id,
    name: task.name,
    status: statusMap[task.status] ?? "pending",
    dependencies: task.dependencies,
    branch: (task.result as Record<string, unknown>)?.branch as string | undefined ?? null,
    executionGroup: (task.result as Record<string, unknown>)?.executionGroup as number | undefined ?? null,
  };
}

// Build phases from template + phaseData
function buildPhases(
  template: WorkflowTemplate | null,
  phaseData: PhaseDataMap,
  currentPhaseId: string | null,
): Phase[] {
  if (!template) return [];

  const sortedPhases = [...template.phases].sort((a, b) => a.order - b.order);

  return sortedPhases.map((tp) => {
    const pd = phaseData[tp.id] as { status?: string; startedAt?: string; completedAt?: string } | undefined;
    let status: Phase["status"] = "pending";

    if (pd?.status === "completed" || pd?.status === "approved") {
      status = "completed";
    } else if (pd?.status === "skipped") {
      status = "skipped";
    } else if (tp.id === currentPhaseId || pd?.status === "executing" || pd?.status === "reviewing" || pd?.status === "running" || pd?.status === "in_progress") {
      status = "current";
    }

    return {
      id: tp.id,
      name: tp.name,
      status,
      startedAt: pd?.startedAt ?? null,
      completedAt: pd?.completedAt ?? null,
    };
  });
}

// Extract gates from tasks
function extractGates(tasks: Task[]): Gate[] {
  const gates: Gate[] = [];
  for (const task of tasks) {
    const result = task.result as Record<string, unknown> | undefined;
    if (result?.gateRuns && Array.isArray(result.gateRuns)) {
      for (const gr of result.gateRuns as Array<Record<string, unknown>>) {
        gates.push({
          id: `${task.id}-${gr.gateId ?? gates.length}`,
          name: `${task.name} - ${(gr.gateName as string) ?? "Gate"}`,
          status: gr.passed ? "passed" : gr.status === "pending" ? "pending" : "failed",
          output: (gr.output as string) ?? null,
          retries: (gr.retries as number) ?? 0,
          timestamp: (gr.timestamp as string) ?? null,
        });
      }
    }
  }
  return gates;
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const activityRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    try {
      const wf = await getWorkflow(id);
      setWorkflow(wf);

      // Load template, tasks, audit logs in parallel
      const [tmpl, wfTasks, logs] = await Promise.allSettled([
        getTemplate(wf.templateId).catch(() => null),
        getWorkflowTasks(id).catch(() => []),
        getAuditLogs({ workflowRunId: id, limit: 50 }).catch(() => ({ data: [], total: 0, page: 1, limit: 50 })),
      ]);

      if (tmpl.status === "fulfilled" && tmpl.value) setTemplate(tmpl.value);
      if (wfTasks.status === "fulfilled") setTasks(wfTasks.value as Task[]);
      if (logs.status === "fulfilled") {
        const result = logs.value as { data: AuditLog[] };
        setAuditLogs(result?.data ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workflow");
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Initial load + auto-refresh every 10s
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10_000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Auto-scroll activity feed
  useEffect(() => {
    if (activityRef.current) {
      activityRef.current.scrollTop = activityRef.current.scrollHeight;
    }
  }, [auditLogs]);

  // Action handlers
  const handlePause = async () => {
    setActionLoading(true);
    try {
      const updated = await pauseWorkflow(id, "Paused from UI");
      setWorkflow(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to pause workflow");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    try {
      const updated = await resumeWorkflow(id);
      setWorkflow(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to resume workflow");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this workflow?")) return;
    setActionLoading(true);
    try {
      const updated = await transitionWorkflow(id, "cancelled");
      setWorkflow(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to cancel workflow");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRerun = async () => {
    if (!confirm("This will resume the workflow from where it left off. Continue?")) return;
    setActionLoading(true);
    try {
      await rerunWorkflow(id);
      await loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to rerun workflow");
    } finally {
      setActionLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Error / Loading states
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div className="p-8">
        <Header
          title={`Workflow ${id.slice(0, 8)}`}
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Workflows", href: "/workflows" },
            { label: id.slice(0, 8) },
          ]}
        />
        <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
          <p className="font-medium">Error loading workflow</p>
          <p className="mt-1 text-sm">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); loadData(); }}
            className="mt-3 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/30 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading || !workflow) {
    return (
      <div className="p-8">
        <Header
          title={`Workflow ${id.slice(0, 8)}`}
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Workflows", href: "/workflows" },
            { label: id.slice(0, 8) },
          ]}
        />
        <div className="mt-8 flex items-center gap-3 text-sm text-[var(--muted-foreground)]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--muted-foreground)] border-t-transparent" />
          Loading workflow...
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const phaseData = (workflow.context?.phaseData ?? workflow.context ?? {}) as PhaseDataMap;
  const phases = buildPhases(template, phaseData, workflow.currentPhaseId);
  const dagTasks = tasks.map(mapTaskToDag);
  const gates = extractGates(tasks);
  const executionGroups = (phaseData.planning as PhaseDataMap["planning"])?.executionGroups;

  const canPause = workflow.state === "running";
  const canResume = workflow.state === "paused";
  const canRerun = workflow.state !== "completed";
  const canCancel = !["completed", "failed", "cancelled"].includes(workflow.state);

  const isExecutingOrReviewing =
    workflow.currentPhaseId === "execution" ||
    workflow.currentPhaseId === "review" ||
    workflow.state === "running";

  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const totalTasks = tasks.length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* ----------------------------------------------------------------- */}
      {/* HEADER SECTION                                                     */}
      {/* ----------------------------------------------------------------- */}
      <Header
        title={`Workflow ${id.slice(0, 8)}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Workflows", href: "/workflows" },
          { label: id.slice(0, 8) },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {canPause && (
              <button
                onClick={handlePause}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                </svg>
                Pause
              </button>
            )}
            {canResume && (
              <button
                onClick={handleResume}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
                Resume
              </button>
            )}
            {canRerun && (
              <button
                onClick={handleRerun}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                Rerun
              </button>
            )}
            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/15 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </button>
            )}
          </div>
        }
      />

      {/* Meta bar */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {/* IDs */}
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Workflow ID</span>
              <p className="font-mono text-sm font-medium text-[var(--foreground)]">{workflow.id}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Ticket</span>
              <p className="text-sm font-semibold text-[var(--foreground)]">{workflow.ticketId}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Template</span>
              <p className="text-sm">
                <a
                  href={`/templates/${workflow.templateId}`}
                  className="font-medium text-[var(--primary)] hover:underline"
                >
                  {template?.name ?? workflow.templateId}
                </a>
              </p>
            </div>
          </div>

          {/* State badge - large */}
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold capitalize ${stateColor(workflow.state)}`}
          >
            {workflow.state === "running" && (
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
            {workflow.state}
          </div>
        </div>

        {/* Timestamps */}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--muted-foreground)]">
          <span>Started {new Date(workflow.createdAt).toLocaleString()} ({relativeTime(workflow.createdAt)})</span>
          <span>Updated {new Date(workflow.updatedAt).toLocaleString()} ({relativeTime(workflow.updatedAt)})</span>
          {workflow.currentPhaseId && (
            <span>Current phase: <strong className="text-[var(--foreground)]">{workflow.currentPhaseId}</strong></span>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* PHASE TIMELINE                                                     */}
      {/* ----------------------------------------------------------------- */}
      {phases.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Phase Progress</h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <PhaseTimeline phases={phases} />
          </div>
        </section>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TWO-COLUMN: TASK GRAPH + GATE RESULTS                              */}
      {/* ----------------------------------------------------------------- */}
      {isExecutingOrReviewing && (dagTasks.length > 0 || gates.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Task Graph */}
          {dagTasks.length > 0 && (
            <section className={gates.length === 0 ? "lg:col-span-2" : ""}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[var(--foreground)]">Task Graph</h2>
                {totalTasks > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 rounded-full bg-[var(--muted)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${(completedTasks / totalTasks) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {completedTasks}/{totalTasks}
                    </span>
                  </div>
                )}
              </div>
              <DagVisualizer tasks={dagTasks} executionGroups={executionGroups} />
            </section>
          )}

          {/* Gate Results */}
          {gates.length > 0 && (
            <section className={dagTasks.length === 0 ? "lg:col-span-2" : ""}>
              <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Gate Results</h2>
              <GateStatus gates={gates} />
            </section>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* PHASE DETAILS PANEL                                                */}
      {/* ----------------------------------------------------------------- */}
      {workflow.currentPhaseId && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">
            Phase Details: <span className="capitalize">{workflow.currentPhaseId}</span>
          </h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <PhaseDetailsPanel
              phaseId={workflow.currentPhaseId}
              phaseData={phaseData}
              tasks={tasks}
            />
          </div>
        </section>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* ACTIVITY FEED                                                      */}
      {/* ----------------------------------------------------------------- */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Activity Feed</h2>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          {auditLogs.length === 0 ? (
            <div className="p-6 text-sm text-[var(--muted-foreground)] italic text-center">
              No activity recorded yet.
            </div>
          ) : (
            <div
              ref={activityRef}
              className="max-h-80 overflow-y-auto divide-y divide-[var(--border)]"
            >
              {auditLogs
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                .map((log) => (
                <div key={log.id} className="flex items-start gap-3 px-5 py-3 hover:bg-[var(--muted)]/30 transition-colors">
                  <span className="shrink-0 mt-0.5 text-[10px] font-mono text-[var(--muted-foreground)] w-20">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${actionColor(log.action)}`}>
                    {log.action}
                  </span>
                  <span className="text-xs text-[var(--foreground)] break-words min-w-0">
                    {typeof log.details === "string"
                      ? log.details
                      : log.details?.message ?? JSON.stringify(log.details)}
                  </span>
                  <span className="shrink-0 ml-auto text-[10px] text-[var(--muted-foreground)]">
                    {log.actor}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase Details Panel sub-component
// ---------------------------------------------------------------------------

function PhaseDetailsPanel({
  phaseId,
  phaseData,
  tasks,
}: {
  phaseId: string;
  phaseData: PhaseDataMap;
  tasks: Task[];
}) {
  const data = phaseData[phaseId] as Record<string, unknown> | undefined;

  if (!data) {
    return (
      <p className="text-sm text-[var(--muted-foreground)] italic">
        No data available for this phase yet.
      </p>
    );
  }

  switch (phaseId) {
    case "interview": {
      const d = data as NonNullable<PhaseDataMap["interview"]>;
      return (
        <div className="space-y-4">
          <StatusRow label="Status" value={d.status} />
          {d.questions && d.questions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
                Questions &amp; Responses
              </h4>
              <div className="space-y-2">
                {d.questions.map((q, i) => (
                  <div key={i} className="rounded-lg bg-[var(--muted)]/40 p-3">
                    <p className="text-xs font-medium text-[var(--foreground)]">{q.question}</p>
                    {q.answer ? (
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{q.answer}</p>
                    ) : (
                      <p className="mt-1 text-xs text-amber-400 italic">Awaiting response</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {d.responses && Object.keys(d.responses).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
                Responses
              </h4>
              <div className="space-y-1">
                {Object.entries(d.responses).map(([key, val]) => (
                  <div key={key} className="flex gap-2 text-xs">
                    <span className="font-medium text-[var(--foreground)]">{key}:</span>
                    <span className="text-[var(--muted-foreground)]">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {d.spec && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">Spec</h4>
              <pre className="overflow-x-auto rounded-lg bg-zinc-900 px-4 py-3 font-mono text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
                {d.spec}
              </pre>
            </div>
          )}
        </div>
      );
    }

    case "research": {
      const d = data as NonNullable<PhaseDataMap["research"]>;
      return (
        <div className="space-y-4">
          <StatusRow label="Status" value={d.status} />
          {d.progress != null && (
            <div>
              <span className="text-xs text-[var(--muted-foreground)]">Progress</span>
              <div className="mt-1 h-2 w-full rounded-full bg-[var(--muted)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${Math.min(100, d.progress)}%` }}
                />
              </div>
            </div>
          )}
          {d.findings && d.findings.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">Findings</h4>
              <ul className="list-disc list-inside space-y-1 text-xs text-[var(--foreground)]">
                {d.findings.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
          {d.artifacts?.research && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">Research Summary</h4>
              <pre className="overflow-x-auto rounded-lg bg-zinc-900 px-4 py-3 font-mono text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                {d.artifacts.research}
              </pre>
            </div>
          )}
        </div>
      );
    }

    case "planning": {
      const d = data as NonNullable<PhaseDataMap["planning"]>;
      const taskCount = d.tasks?.length ?? 0;
      const groupCount = d.executionGroups?.length ?? 0;
      return (
        <div className="space-y-4">
          <StatusRow label="Status" value={d.status} />
          <div className="flex flex-wrap gap-4">
            <MetricCard label="Tasks" value={taskCount} />
            <MetricCard label="Execution Groups" value={groupCount} />
            <MetricCard label="Approval" value={d.approvalStatus ?? d.status ?? "pending"} />
          </div>
        </div>
      );
    }

    case "execution": {
      const d = data as NonNullable<PhaseDataMap["execution"]>;
      const completed = d.tasksCompleted ?? tasks.filter((t) => t.status === "completed").length;
      const total = d.tasksTotal ?? tasks.length;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      return (
        <div className="space-y-4">
          <StatusRow label="Status" value={d.status} />
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-1">
              <span>Task Progress</span>
              <span>{completed}/{total} ({pct}%)</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-[var(--muted)] overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          {d.currentAgent && (
            <div className="text-xs text-[var(--muted-foreground)]">
              Active agent: <span className="font-medium text-[var(--foreground)]">{d.currentAgent}</span>
            </div>
          )}
        </div>
      );
    }

    case "review": {
      const d = data as NonNullable<PhaseDataMap["review"]>;
      return (
        <div className="space-y-4">
          <StatusRow label="Status" value={d.status} />
          {d.prs && d.prs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">Pull Requests</h4>
              <div className="space-y-2">
                {d.prs.map((pr, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-[var(--muted)]/40 px-3 py-2">
                    <span className="text-xs font-medium text-[var(--foreground)]">
                      {pr.url ? (
                        <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:underline">
                          {pr.title ?? pr.url}
                        </a>
                      ) : (
                        pr.title ?? `PR #${i + 1}`
                      )}
                    </span>
                    {pr.status && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        pr.status === "merged" ? "bg-purple-500/15 text-purple-400" :
                        pr.status === "approved" ? "bg-emerald-500/15 text-emerald-400" :
                        pr.status === "changes_requested" ? "bg-amber-500/15 text-amber-400" :
                        "bg-[var(--muted)] text-[var(--muted-foreground)]"
                      }`}>
                        {pr.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {d.mergeProgress != null && (
            <div>
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-1">
                <span>Merge Progress</span>
                <span>{d.mergeProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[var(--muted)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all"
                  style={{ width: `${d.mergeProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      );
    }

    default: {
      // Generic: display raw data
      return (
        <pre className="overflow-x-auto rounded-lg bg-zinc-900 px-4 py-3 font-mono text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Micro components used in PhaseDetailsPanel
// ---------------------------------------------------------------------------

function StatusRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-[var(--muted-foreground)]">{label}:</span>
      <span className="inline-flex rounded-full bg-[var(--muted)] px-2.5 py-0.5 font-medium capitalize text-[var(--foreground)]">
        {value}
      </span>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{label}</p>
      <p className="text-lg font-bold text-[var(--foreground)] capitalize">{value}</p>
    </div>
  );
}
