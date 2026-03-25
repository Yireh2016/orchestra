"use client";

import { Header } from "@/components/layout/header";
import { PhaseTimeline } from "@/components/workflow/phase-timeline";
import { use, useEffect, useState } from "react";
import { getWorkflow, pauseWorkflow, resumeWorkflow, transitionWorkflow, Workflow } from "@/lib/api-client";

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

interface PhaseData {
  id: string;
  name: string;
  status: "completed" | "current" | "pending" | "skipped";
}

export default function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadWorkflow = async () => {
    try {
      const wf = await getWorkflow(id);
      setWorkflow(wf);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workflow");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  // Build phase timeline from workflow context if available
  const phases: PhaseData[] = (() => {
    if (!workflow) return [];
    const ctx = workflow.context as Record<string, unknown> | undefined;
    if (ctx && Array.isArray(ctx.phases)) {
      return (ctx.phases as Array<{ id: string; name: string; status: string }>).map((p) => ({
        id: p.id,
        name: p.name,
        status: (p.status === "completed" ? "completed" : p.status === "running" ? "current" : p.status === "skipped" ? "skipped" : "pending") as PhaseData["status"],
      }));
    }
    // Fallback: show workflow state as a single phase
    return [];
  })();

  if (error) {
    return (
      <div className="p-8">
        <Header
          title={`Workflow ${id}`}
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Workflows", href: "/workflows" },
            { label: id },
          ]}
        />
        <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
          <p className="font-medium">Error loading workflow</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (loading || !workflow) {
    return (
      <div className="p-8">
        <Header
          title={`Workflow ${id}`}
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Workflows", href: "/workflows" },
            { label: id },
          ]}
        />
        <p className="mt-8 text-sm text-[var(--muted-foreground)]">Loading workflow...</p>
      </div>
    );
  }

  const canPause = workflow.state === "running";
  const canResume = workflow.state === "paused";
  const canCancel = workflow.state !== "completed" && workflow.state !== "failed" && workflow.state !== "cancelled";

  return (
    <div className="p-8">
      <Header
        title={`Workflow ${id.slice(0, 8)}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Workflows", href: "/workflows" },
          { label: id.slice(0, 8) },
        ]}
        actions={
          <div className="flex gap-2">
            {canPause && (
              <button
                onClick={handlePause}
                disabled={actionLoading}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
              >
                Pause
              </button>
            )}
            {canResume && (
              <button
                onClick={handleResume}
                disabled={actionLoading}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
              >
                Resume
              </button>
            )}
            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="rounded-lg bg-[var(--destructive)] px-4 py-2 text-sm font-medium text-[var(--destructive-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Cancel
              </button>
            )}
          </div>
        }
      />

      {/* Workflow Meta */}
      <div className="mt-6 flex flex-wrap gap-6 text-sm">
        <div>
          <span className="text-[var(--muted-foreground)]">ID: </span>
          <span className="font-mono font-medium text-[var(--foreground)]">{workflow.id}</span>
        </div>
        <div>
          <span className="text-[var(--muted-foreground)]">Ticket: </span>
          <span className="font-medium text-[var(--foreground)]">{workflow.ticketId}</span>
        </div>
        <div>
          <span className="text-[var(--muted-foreground)]">Template: </span>
          <span className="font-medium text-[var(--foreground)]">{workflow.templateId}</span>
        </div>
        <div>
          <span className="text-[var(--muted-foreground)]">State: </span>
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${stateColor(workflow.state)}`}>
            {workflow.state}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-6 text-sm">
        <div>
          <span className="text-[var(--muted-foreground)]">Created: </span>
          <span className="text-[var(--foreground)]">{new Date(workflow.createdAt).toLocaleString()}</span>
        </div>
        <div>
          <span className="text-[var(--muted-foreground)]">Updated: </span>
          <span className="text-[var(--foreground)]">{new Date(workflow.updatedAt).toLocaleString()}</span>
        </div>
        {workflow.currentPhaseId && (
          <div>
            <span className="text-[var(--muted-foreground)]">Current Phase: </span>
            <span className="text-[var(--foreground)]">{workflow.currentPhaseId}</span>
          </div>
        )}
      </div>

      {/* Phase Timeline */}
      {phases.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Phase Progress</h2>
          <PhaseTimeline phases={phases} />
        </div>
      )}

      {/* Context Data */}
      {workflow.context && Object.keys(workflow.context).length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Workflow Context</h2>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <pre className="overflow-x-auto text-xs text-[var(--muted-foreground)]">
              {JSON.stringify(workflow.context, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
