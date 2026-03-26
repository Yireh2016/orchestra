"use client";

import { Header } from "@/components/layout/header";
import { useState, useEffect } from "react";
import {
  getWorkflows,
  getTemplates,
  getProjects,
  createWorkflow,
  Workflow,
  WorkflowTemplate,
  Project,
} from "@/lib/api-client";

const states = ["All", "pending", "running", "paused", "gated", "completed", "failed", "cancelled"];

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

export default function WorkflowsPage() {
  const [filter, setFilter] = useState("All");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newTicketId, setNewTicketId] = useState("");
  const [newTemplateId, setNewTemplateId] = useState("");
  const [newProjectId, setNewProjectId] = useState("");
  const [creating, setCreating] = useState(false);

  const loadData = async () => {
    try {
      const [wfs, tpls, projs] = await Promise.all([getWorkflows(), getTemplates(), getProjects()]);
      setWorkflows(wfs);
      setTemplates(tpls);
      setProjects(projs);
      if (tpls.length > 0 && !newTemplateId) {
        setNewTemplateId(tpls[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workflows");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!newTemplateId || !newTicketId.trim()) return;
    setCreating(true);
    try {
      const payload: { templateId: string; ticketId: string; context?: Record<string, unknown> } = {
        templateId: newTemplateId,
        ticketId: newTicketId.trim(),
      };
      if (newProjectId) {
        payload.context = { projectId: newProjectId };
      }
      await createWorkflow(payload);
      setShowModal(false);
      setNewTicketId("");
      setNewProjectId("");
      setLoading(true);
      await loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create workflow");
    } finally {
      setCreating(false);
    }
  };

  const filtered = filter === "All" ? workflows : workflows.filter((w) => w.state === filter);
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (error) {
    return (
      <div className="p-8">
        <Header
          title="Workflows"
          breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Workflows" }]}
        />
        <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
          <p className="font-medium">Error loading workflows</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Header
        title="Workflows"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Workflows" }]}
        actions={
          <button
            onClick={() => setShowModal(true)}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
          >
            New Workflow
          </button>
        }
      />

      {/* New Workflow Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--foreground)]">Create New Workflow</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Project</label>
                {projects.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    No projects found.{" "}
                    <a href="/projects" className="text-[var(--primary)] hover:underline">Create a project first</a>
                  </p>
                ) : (
                  <select
                    value={newProjectId}
                    onChange={(e) => setNewProjectId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  >
                    <option value="">Select a project (optional)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Template</label>
                <select
                  value={newTemplateId}
                  onChange={(e) => setNewTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Ticket ID</label>
                <input
                  type="text"
                  value={newTicketId}
                  onChange={(e) => setNewTicketId(e.target.value)}
                  placeholder="e.g., PROJ-123"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newTicketId.trim()}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <label className="text-sm text-[var(--muted-foreground)]">Filter by state:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        >
          {states.map((s) => (
            <option key={s} value={s}>{s === "All" ? "All" : s}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">Loading workflows...</p>
      ) : sorted.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">
          {filter === "All" ? "No workflows found. Create one to get started." : `No workflows with state "${filter}".`}
        </p>
      ) : (
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
              {sorted.map((wf) => (
                <tr key={wf.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/50 transition-colors">
                  <td className="px-4 py-3">
                    <a href={`/workflows/${wf.id}`} className="font-mono text-[var(--primary)] hover:underline">
                      {wf.ticketId}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-[var(--foreground)]">{wf.templateId}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${stateColor(wf.state)}`}>
                      {wf.state}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{new Date(wf.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{timeAgo(wf.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
