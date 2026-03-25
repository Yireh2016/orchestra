"use client";

import { useState } from "react";

export interface Phase {
  id: string;
  name: string;
  status: "completed" | "current" | "pending" | "skipped";
  startedAt?: string | null;
  completedAt?: string | null;
}

interface PhaseTimelineProps {
  phases: Phase[];
}

function formatDuration(startedAt?: string | null, completedAt?: string | null): string | null {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diff = Math.max(0, end - start);

  if (diff < 1000) return "<1s";
  if (diff < 60_000) return `${Math.round(diff / 1000)}s`;
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    const s = Math.round((diff % 60_000) / 1000);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(diff / 3_600_000);
  const m = Math.round((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

function statusStyles(status: Phase["status"]) {
  switch (status) {
    case "completed":
      return {
        node: "border-emerald-500 bg-emerald-500 shadow-emerald-500/25 shadow-md",
        text: "text-emerald-400",
        line: "bg-emerald-500",
        label: "Completed",
      };
    case "current":
      return {
        node: "border-[var(--primary)] bg-[var(--primary)]/20 ring-4 ring-[var(--primary)]/30 animate-[pulse-glow_2s_ease-in-out_infinite]",
        text: "text-[var(--primary)] font-semibold",
        line: "bg-[var(--border)]",
        label: "In Progress",
      };
    case "skipped":
      return {
        node: "border-[var(--border)] bg-[var(--muted)] opacity-50",
        text: "text-[var(--muted-foreground)] opacity-50",
        line: "bg-[var(--border)] opacity-50",
        label: "Skipped",
      };
    case "pending":
    default:
      return {
        node: "border-[var(--border)] bg-[var(--card)]",
        text: "text-[var(--muted-foreground)]",
        line: "bg-[var(--border)]",
        label: "Pending",
      };
  }
}

export function PhaseTimeline({ phases }: PhaseTimelineProps) {
  const [hoveredPhase, setHoveredPhase] = useState<string | null>(null);

  return (
    <>
      <style>{`
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 8px 2px var(--primary); opacity: 1; }
          50% { box-shadow: 0 0 20px 6px var(--primary); opacity: 0.85; }
        }
      `}</style>

      {/* Horizontal layout for md+ */}
      <div className="hidden md:flex items-center overflow-x-auto pb-2">
        {phases.map((phase, i) => {
          const styles = statusStyles(phase.status);
          const duration = formatDuration(phase.startedAt, phase.completedAt);
          return (
            <div key={phase.id} className="flex items-center">
              <div
                className="relative flex flex-col items-center"
                onMouseEnter={() => setHoveredPhase(phase.id)}
                onMouseLeave={() => setHoveredPhase(null)}
              >
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-all cursor-pointer ${styles.node}`}
                >
                  {phase.status === "completed" ? (
                    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : phase.status === "current" ? (
                    <div className="h-3 w-3 rounded-full bg-[var(--primary)] animate-pulse" />
                  ) : phase.status === "skipped" ? (
                    <svg className="h-4 w-4 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061A1.125 1.125 0 013 16.811V8.69zM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061a1.125 1.125 0 01-1.683-.977V8.69z" />
                    </svg>
                  ) : (
                    <span className="text-xs font-medium text-[var(--muted-foreground)]">{i + 1}</span>
                  )}
                </div>

                {/* Phase name + duration */}
                <span className={`mt-2 whitespace-nowrap text-xs ${styles.text}`}>{phase.name}</span>
                {phase.status === "skipped" && (
                  <span className="text-[10px] text-[var(--muted-foreground)] opacity-60">Skipped</span>
                )}
                {duration && phase.status !== "skipped" && (
                  <span className="text-[10px] text-[var(--muted-foreground)]">{duration}</span>
                )}

                {/* Tooltip on hover */}
                {hoveredPhase === phase.id && (
                  <div className="absolute -top-20 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-xl text-xs whitespace-nowrap">
                    <p className="font-semibold text-[var(--foreground)]">{phase.name}</p>
                    <p className="text-[var(--muted-foreground)]">Status: {styles.label}</p>
                    {duration && <p className="text-[var(--muted-foreground)]">Duration: {duration}</p>}
                    {phase.startedAt && (
                      <p className="text-[var(--muted-foreground)]">Started: {new Date(phase.startedAt).toLocaleTimeString()}</p>
                    )}
                    <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 h-2 w-2 rotate-45 border-b border-r border-[var(--border)] bg-[var(--card)]" />
                  </div>
                )}
              </div>
              {i < phases.length - 1 && (
                <div className={`mx-3 h-0.5 w-20 rounded-full ${styles.line}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Vertical layout for mobile */}
      <div className="flex md:hidden flex-col gap-0">
        {phases.map((phase, i) => {
          const styles = statusStyles(phase.status);
          const duration = formatDuration(phase.startedAt, phase.completedAt);
          return (
            <div key={phase.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all ${styles.node}`}
                >
                  {phase.status === "completed" ? (
                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : phase.status === "current" ? (
                    <div className="h-2.5 w-2.5 rounded-full bg-[var(--primary)] animate-pulse" />
                  ) : phase.status === "skipped" ? (
                    <svg className="h-3.5 w-3.5 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061A1.125 1.125 0 013 16.811V8.69zM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061a1.125 1.125 0 01-1.683-.977V8.69z" />
                    </svg>
                  ) : (
                    <span className="text-xs font-medium text-[var(--muted-foreground)]">{i + 1}</span>
                  )}
                </div>
                {i < phases.length - 1 && (
                  <div className={`w-0.5 h-6 ${styles.line}`} />
                )}
              </div>
              <div className="pb-6">
                <span className={`text-sm ${styles.text}`}>{phase.name}</span>
                {phase.status === "skipped" && (
                  <span className="ml-2 text-[10px] text-[var(--muted-foreground)] opacity-60">Skipped</span>
                )}
                {duration && phase.status !== "skipped" && (
                  <span className="ml-2 text-[10px] text-[var(--muted-foreground)]">{duration}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
