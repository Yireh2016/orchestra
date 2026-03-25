"use client";

import { useState } from "react";

interface Gate {
  id: string;
  name: string;
  status: "passed" | "failed" | "pending";
  output: string | null;
  retries: number;
}

interface GateStatusProps {
  gates: Gate[];
}

function statusBadge(status: Gate["status"]) {
  switch (status) {
    case "passed": return "bg-emerald-500/15 text-emerald-400";
    case "failed": return "bg-red-500/15 text-red-400";
    case "pending": return "bg-amber-500/15 text-amber-400";
  }
}

function statusIcon(status: Gate["status"]) {
  switch (status) {
    case "passed":
      return (
        <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "failed":
      return (
        <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "pending":
      return (
        <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
}

export function GateStatus({ gates }: GateStatusProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {gates.map((gate) => (
        <div
          key={gate.id}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden"
        >
          <button
            onClick={() => toggle(gate.id)}
            className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-[var(--muted)]/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              {statusIcon(gate.status)}
              <span className="text-sm font-medium text-[var(--foreground)]">{gate.name}</span>
              {gate.retries > 0 && (
                <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
                  {gate.retries} {gate.retries === 1 ? "retry" : "retries"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(gate.status)}`}>
                {gate.status}
              </span>
              <svg
                className={`h-4 w-4 text-[var(--muted-foreground)] transition-transform ${
                  expanded.has(gate.id) ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </button>
          {expanded.has(gate.id) && (
            <div className="border-t border-[var(--border)] bg-[var(--muted)]/30 px-5 py-4">
              {gate.output ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--muted-foreground)]">Output</p>
                  <p className="rounded-lg bg-[var(--background)] px-3 py-2 font-mono text-sm text-[var(--foreground)]">
                    {gate.output}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)] italic">Awaiting evaluation...</p>
              )}
              {gate.status === "failed" && (
                <button className="mt-3 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
                  Retry Gate
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
