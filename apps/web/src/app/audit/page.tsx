"use client";

import { Header } from "@/components/layout/header";
import { getAuditLogs, type AuditLog, type PaginatedResponse } from "@/lib/api-client";
import { useCallback, useEffect, useState } from "react";

const actionTypes = [
  "All",
  "workflow.started",
  "phase.started",
  "phase.completed",
  "task.queued",
  "task.completed",
  "task.failed",
  "gate.passed",
  "gate.failed",
  "workflow.completed",
  "workflow.failed",
  "config.changed",
];

const actorTypes = ["All", "orchestrator", "agent", "user", "system"];

const pageSizes = [20, 50, 100];

function actionBadgeClasses(action: string): string {
  if (action.includes("failed"))
    return "bg-red-500/15 text-red-400 border border-red-500/25";
  if (action.includes("completed") || action.includes("passed"))
    return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25";
  if (action.includes("started") || action.includes("queued"))
    return "bg-sky-500/15 text-sky-400 border border-sky-500/25";
  if (action.includes("warning") || action.includes("config"))
    return "bg-amber-500/15 text-amber-400 border border-amber-500/25";
  return "bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]";
}

function actorIcon(actor: string): string {
  const lower = actor.toLowerCase();
  if (lower === "orchestrator" || lower.startsWith("orchestrator")) return "\u2699";
  if (lower === "system" || lower.startsWith("system")) return "\u26A1";
  if (lower.startsWith("agent") || lower === "agent") return "\u2728";
  if (lower.startsWith("user") || lower === "user") return "\u25CF";
  return "\u25CB";
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return ts;
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "\u2026";
}

function detailsSummary(details: Record<string, any>): string {
  if (details.message) return String(details.message);
  if (details.summary) return String(details.summary);
  if (details.reason) return String(details.reason);
  const keys = Object.keys(details);
  if (keys.length === 0) return "\u2014";
  return keys.slice(0, 3).map((k) => `${k}: ${JSON.stringify(details[k])}`).join(", ");
}

export default function AuditPage() {
  const [data, setData] = useState<PaginatedResponse<AuditLog> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [workflowRunId, setWorkflowRunId] = useState("");
  const [actionFilter, setActionFilter] = useState("All");
  const [actorFilter, setActorFilter] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof getAuditLogs>[0] = {
        page,
        limit,
      };
      if (workflowRunId.trim()) params!.workflowRunId = workflowRunId.trim();
      if (actionFilter !== "All") params!.action = actionFilter;
      if (actorFilter !== "All") params!.actor = actorFilter;
      if (fromDate) params!.from = fromDate;
      if (toDate) params!.to = toDate;

      const result = await getAuditLogs(params);
      setData(result);
    } catch (err: any) {
      setError(err.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [page, limit, workflowRunId, actionFilter, actorFilter, fromDate, toDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleApplyFilters = () => {
    setPage(1);
    fetchLogs();
  };

  const handleClearFilters = () => {
    setWorkflowRunId("");
    setActionFilter("All");
    setActorFilter("All");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  const toggleExpanded = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;
  const startEntry = data ? (data.page - 1) * data.limit + 1 : 0;
  const endEntry = data ? Math.min(data.page * data.limit, data.total) : 0;

  const inputClasses =
    "rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] transition-colors";
  const selectClasses =
    "rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] transition-colors";

  return (
    <div className="p-8">
      <Header
        title="Audit Log"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Audit Log" }]}
      />

      {/* Filters bar */}
      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Workflow ID */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">
              Workflow ID
            </label>
            <div className="relative">
              <input
                type="text"
                value={workflowRunId}
                onChange={(e) => setWorkflowRunId(e.target.value)}
                placeholder="e.g. wf-abc123"
                className={inputClasses + " pr-8"}
              />
              {workflowRunId && (
                <button
                  onClick={() => setWorkflowRunId("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                  title="Clear"
                >
                  x
                </button>
              )}
            </div>
          </div>

          {/* Action type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">
              Action
            </label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className={selectClasses}
            >
              {actionTypes.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Actor */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">
              Actor
            </label>
            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              className={selectClasses}
            >
              {actorTypes.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={inputClasses}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--muted-foreground)]">
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={inputClasses}
            />
          </div>

          {/* Buttons */}
          <button
            onClick={handleApplyFilters}
            className="rounded-lg bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
          >
            Apply Filters
          </button>
          <button
            onClick={handleClearFilters}
            className="rounded-lg border border-[var(--border)] bg-transparent px-4 py-1.5 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30 transition-colors"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
          <button
            onClick={fetchLogs}
            className="ml-3 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="mt-8 flex items-center justify-center py-16 text-sm text-[var(--muted-foreground)]">
          <svg
            className="mr-2 h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          Loading audit logs...
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && data && data.data.length === 0 && (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] py-16">
          <div className="text-4xl text-[var(--muted-foreground)]/40 mb-3">
            No audit log entries found
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">
            Try adjusting your filters, clearing the date range, or selecting a different action type.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && data && data.data.length > 0 && (
        <>
          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                      Workflow
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                      Action
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                      Actor
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((entry) => (
                    <tr key={entry.id} className="group">
                      <td className="border-b border-[var(--border)] px-4 py-2.5 font-mono text-xs text-[var(--muted-foreground)] group-hover:bg-[var(--muted)]/50 transition-colors">
                        {formatTimestamp(entry.timestamp)}
                      </td>
                      <td className="border-b border-[var(--border)] px-4 py-2.5 group-hover:bg-[var(--muted)]/50 transition-colors">
                        {entry.workflowRunId ? (
                          <a
                            href={`/workflows/${entry.workflowRunId}`}
                            className="font-mono text-[var(--primary)] hover:underline"
                            title={entry.workflowRunId}
                          >
                            {truncate(entry.workflowRunId, 12)}
                          </a>
                        ) : (
                          <span className="text-[var(--muted-foreground)]">
                            --
                          </span>
                        )}
                      </td>
                      <td className="border-b border-[var(--border)] px-4 py-2.5 group-hover:bg-[var(--muted)]/50 transition-colors">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${actionBadgeClasses(entry.action)}`}
                        >
                          {entry.action}
                        </span>
                      </td>
                      <td className="border-b border-[var(--border)] px-4 py-2.5 text-[var(--foreground)] group-hover:bg-[var(--muted)]/50 transition-colors">
                        <span className="mr-1.5 inline-block w-4 text-center text-xs">
                          {actorIcon(entry.actor)}
                        </span>
                        {entry.actor}
                      </td>
                      <td className="border-b border-[var(--border)] px-4 py-2.5 text-[var(--muted-foreground)] group-hover:bg-[var(--muted)]/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-[300px]">
                            {detailsSummary(entry.details)}
                          </span>
                          {Object.keys(entry.details).length > 0 && (
                            <button
                              onClick={() => toggleExpanded(entry.id)}
                              className="shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30 transition-colors"
                            >
                              {expandedRows.has(entry.id) ? "Hide" : "View"}
                            </button>
                          )}
                        </div>
                        {expandedRows.has(entry.id) && (
                          <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-xs font-mono text-[var(--foreground)] whitespace-pre-wrap">
                            {JSON.stringify(entry.details, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm">
            <div className="text-[var(--muted-foreground)]">
              Showing {startEntry}&#8211;{endEntry} of {data.total} entries
            </div>

            <div className="flex items-center gap-3">
              {/* Items per page */}
              <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                <span className="text-xs">Per page:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  {pageSizes.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Page controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5 text-xs text-[var(--muted-foreground)]">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
