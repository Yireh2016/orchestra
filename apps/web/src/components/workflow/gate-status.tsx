"use client";

import { useState } from "react";

export interface Gate {
  id: string;
  name: string;
  status: "passed" | "failed" | "pending";
  output: string | null;
  retries: number;
  timestamp?: string | null;
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

              {/* Retry dots indicator */}
              {gate.retries > 0 && (
                <div className="flex items-center gap-1 ml-1" title={`${gate.retries} ${gate.retries === 1 ? "retry" : "retries"}`}>
                  {Array.from({ length: Math.min(gate.retries, 5) }).map((_, i) => (
                    <div
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-amber-400"
                    />
                  ))}
                  {gate.retries > 5 && (
                    <span className="text-[10px] text-amber-400 ml-0.5">+{gate.retries - 5}</span>
                  )}
                  <span className="text-[10px] text-[var(--muted-foreground)] ml-1">
                    {gate.retries} {gate.retries === 1 ? "retry" : "retries"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {gate.timestamp && (
                <span className="text-[10px] text-[var(--muted-foreground)] hidden sm:inline">
                  {new Date(gate.timestamp).toLocaleString()}
                </span>
              )}
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
                  <p className="mb-2 text-xs font-medium text-[var(--muted-foreground)]">Output</p>
                  <pre className="overflow-x-auto rounded-lg bg-zinc-900 px-4 py-3 font-mono text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap break-words">
                    {gate.output}
                  </pre>
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)] italic">Awaiting evaluation...</p>
              )}

              {gate.timestamp && (
                <p className="mt-3 text-[10px] text-[var(--muted-foreground)]">
                  Last run: {new Date(gate.timestamp).toLocaleString()}
                </p>
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
