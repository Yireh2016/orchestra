"use client";

import { Header } from "@/components/layout/header";
import { useState } from "react";

const actionTypes = ["All", "workflow.created", "workflow.transitioned", "workflow.completed", "workflow.failed", "gate.passed", "gate.failed", "task.started", "task.completed", "config.changed"];

const auditEntries = [
  { timestamp: "2025-03-25 09:29:05", workflow: "WF-1042", action: "task.started", actor: "Agent: ESLint Bot", details: "Started lint check on 14 files" },
  { timestamp: "2025-03-25 09:29:05", workflow: "WF-1042", action: "task.started", actor: "Agent: Claude", details: "Started writing unit tests" },
  { timestamp: "2025-03-25 09:29:00", workflow: "WF-1042", action: "workflow.transitioned", actor: "System", details: "Phase: Implementation -> Code Review" },
  { timestamp: "2025-03-25 09:28:44", workflow: "WF-1042", action: "task.completed", actor: "Agent: Cursor", details: "Implementation completed (14 files changed)" },
  { timestamp: "2025-03-25 09:14:15", workflow: "WF-1042", action: "gate.passed", actor: "System", details: "Planning gate passed: Requirements validated" },
  { timestamp: "2025-03-25 09:12:00", workflow: "WF-1042", action: "workflow.created", actor: "User: admin@acme.com", details: "Created from template: Full CI/CD Pipeline" },
  { timestamp: "2025-03-25 08:45:22", workflow: "WF-1041", action: "workflow.completed", actor: "System", details: "All phases completed successfully" },
  { timestamp: "2025-03-25 07:30:00", workflow: "WF-1040", action: "gate.failed", actor: "System", details: "Performance benchmark failed: 15% regression" },
  { timestamp: "2025-03-25 06:50:11", workflow: "WF-1039", action: "workflow.failed", actor: "System", details: "Test suite failed with 3 errors" },
  { timestamp: "2025-03-24 23:10:00", workflow: "WF-1038", action: "config.changed", actor: "User: admin@acme.com", details: "Updated Jira integration credentials" },
];

function actionColor(action: string) {
  if (action.includes("failed")) return "text-red-400";
  if (action.includes("completed") || action.includes("passed")) return "text-emerald-400";
  if (action.includes("started") || action.includes("created")) return "text-sky-400";
  if (action.includes("transitioned")) return "text-amber-400";
  return "text-[var(--muted-foreground)]";
}

export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState("All");
  const [workflowFilter, setWorkflowFilter] = useState("");

  const filtered = auditEntries.filter((e) => {
    if (actionFilter !== "All" && e.action !== actionFilter) return false;
    if (workflowFilter && !e.workflow.toLowerCase().includes(workflowFilter.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-8">
      <Header
        title="Audit Log"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Audit Log" }]}
      />

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div>
          <label className="mr-2 text-sm text-[var(--muted-foreground)]">Action:</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          >
            {actionTypes.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mr-2 text-sm text-[var(--muted-foreground)]">Workflow:</label>
          <input
            type="text"
            value={workflowFilter}
            onChange={(e) => setWorkflowFilter(e.target.value)}
            placeholder="e.g. WF-1042"
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Timestamp</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Workflow</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Action</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Actor</th>
              <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry, i) => (
              <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/50 transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs text-[var(--muted-foreground)]">{entry.timestamp}</td>
                <td className="px-4 py-2.5 font-mono text-[var(--primary)]">{entry.workflow}</td>
                <td className={`px-4 py-2.5 font-mono text-xs ${actionColor(entry.action)}`}>{entry.action}</td>
                <td className="px-4 py-2.5 text-[var(--foreground)]">{entry.actor}</td>
                <td className="px-4 py-2.5 text-[var(--muted-foreground)]">{entry.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
