interface Phase {
  id: string;
  name: string;
  status: "completed" | "current" | "pending" | "skipped";
}

interface PhaseTimelineProps {
  phases: Phase[];
}

function statusStyles(status: Phase["status"]) {
  switch (status) {
    case "completed":
      return {
        node: "border-emerald-500 bg-emerald-500",
        text: "text-emerald-400",
        line: "bg-emerald-500",
      };
    case "current":
      return {
        node: "border-[var(--primary)] bg-[var(--primary)]/20 ring-4 ring-[var(--primary)]/20",
        text: "text-[var(--primary)] font-semibold",
        line: "bg-[var(--border)]",
      };
    case "skipped":
      return {
        node: "border-[var(--border)] bg-[var(--muted)] opacity-50",
        text: "text-[var(--muted-foreground)] line-through opacity-50",
        line: "bg-[var(--border)] opacity-50",
      };
    case "pending":
    default:
      return {
        node: "border-[var(--border)] bg-[var(--card)]",
        text: "text-[var(--muted-foreground)]",
        line: "bg-[var(--border)]",
      };
  }
}

export function PhaseTimeline({ phases }: PhaseTimelineProps) {
  return (
    <div className="flex items-center overflow-x-auto pb-2">
      {phases.map((phase, i) => {
        const styles = statusStyles(phase.status);
        return (
          <div key={phase.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${styles.node}`}
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
              <span className={`mt-2 whitespace-nowrap text-xs ${styles.text}`}>{phase.name}</span>
            </div>
            {i < phases.length - 1 && (
              <div className={`mx-2 h-0.5 w-16 ${styles.line}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
