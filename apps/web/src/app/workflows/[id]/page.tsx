"use client";

import { Header } from "@/components/layout/header";
import { PhaseTimeline } from "@/components/workflow/phase-timeline";
import { DagVisualizer } from "@/components/workflow/dag-visualizer";
import { GateStatus } from "@/components/workflow/gate-status";
import { use } from "react";

const workflowData = {
  id: "WF-1042",
  ticket: "PROJ-318",
  template: "Full CI/CD Pipeline",
  state: "Running" as const,
  phases: [
    { id: "p1", name: "Planning", status: "completed" as const },
    { id: "p2", name: "Implementation", status: "completed" as const },
    { id: "p3", name: "Code Review", status: "current" as const },
    { id: "p4", name: "Testing", status: "pending" as const },
    { id: "p5", name: "Deploy", status: "pending" as const },
  ],
  tasks: [
    { id: "t1", name: "Parse Requirements", status: "completed" as const, dependencies: [] },
    { id: "t2", name: "Generate Plan", status: "completed" as const, dependencies: ["t1"] },
    { id: "t3", name: "Implement Feature", status: "completed" as const, dependencies: ["t2"] },
    { id: "t4", name: "Write Tests", status: "running" as const, dependencies: ["t3"] },
    { id: "t5", name: "Run Linter", status: "running" as const, dependencies: ["t3"] },
    { id: "t6", name: "Code Review", status: "pending" as const, dependencies: ["t4", "t5"] },
    { id: "t7", name: "Integration Tests", status: "pending" as const, dependencies: ["t6"] },
    { id: "t8", name: "Deploy to Staging", status: "pending" as const, dependencies: ["t7"] },
  ],
  gates: [
    { id: "g1", name: "Test Coverage > 80%", status: "passed" as const, output: "Coverage: 87.3%", retries: 0 },
    { id: "g2", name: "No Critical Vulnerabilities", status: "passed" as const, output: "0 critical, 2 low", retries: 0 },
    { id: "g3", name: "PR Approved", status: "pending" as const, output: null, retries: 0 },
    { id: "g4", name: "Performance Benchmark", status: "failed" as const, output: "Latency regression: 15% slower on /api/search", retries: 2 },
  ],
  activityLog: [
    { time: "09:12:00", action: "Workflow started", actor: "System" },
    { time: "09:12:05", action: "Planning phase started", actor: "System" },
    { time: "09:13:22", action: "Requirements parsed successfully", actor: "Agent: Claude" },
    { time: "09:14:10", action: "Plan generated (12 subtasks)", actor: "Agent: Claude" },
    { time: "09:14:15", action: "Implementation phase started", actor: "System" },
    { time: "09:28:44", action: "Feature implemented (14 files changed)", actor: "Agent: Cursor" },
    { time: "09:29:00", action: "Code Review phase started", actor: "System" },
    { time: "09:29:05", action: "Write Tests task started", actor: "Agent: Claude" },
    { time: "09:29:05", action: "Run Linter task started", actor: "Agent: ESLint Bot" },
  ],
};

export default function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="p-8">
      <Header
        title={`Workflow ${id}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Workflows", href: "/workflows" },
          { label: id },
        ]}
        actions={
          <div className="flex gap-2">
            <button className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
              Pause
            </button>
            <button className="rounded-lg bg-[var(--destructive)] px-4 py-2 text-sm font-medium text-[var(--destructive-foreground)] hover:opacity-90 transition-opacity">
              Cancel
            </button>
          </div>
        }
      />

      {/* Workflow Meta */}
      <div className="mt-6 flex gap-6 text-sm">
        <div>
          <span className="text-[var(--muted-foreground)]">Ticket: </span>
          <span className="font-medium text-[var(--foreground)]">{workflowData.ticket}</span>
        </div>
        <div>
          <span className="text-[var(--muted-foreground)]">Template: </span>
          <span className="font-medium text-[var(--foreground)]">{workflowData.template}</span>
        </div>
        <div>
          <span className="text-[var(--muted-foreground)]">State: </span>
          <span className="inline-flex rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
            {workflowData.state}
          </span>
        </div>
      </div>

      {/* Phase Timeline */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Phase Progress</h2>
        <PhaseTimeline phases={workflowData.phases} />
      </div>

      {/* Task DAG + Gates */}
      <div className="mt-10 grid grid-cols-1 gap-8 xl:grid-cols-2">
        <div>
          <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Task Dependencies</h2>
          <DagVisualizer tasks={workflowData.tasks} />
        </div>
        <div>
          <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Gate Results</h2>
          <GateStatus gates={workflowData.gates} />
        </div>
      </div>

      {/* Activity Log */}
      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-[var(--foreground)]">Activity Log</h2>
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Time</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Action</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted-foreground)]">Actor</th>
              </tr>
            </thead>
            <tbody>
              {workflowData.activityLog.map((entry, i) => (
                <tr key={i} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs text-[var(--muted-foreground)]">{entry.time}</td>
                  <td className="px-4 py-2.5 text-[var(--foreground)]">{entry.action}</td>
                  <td className="px-4 py-2.5 text-[var(--muted-foreground)]">{entry.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
