"use client";

import { Header } from "@/components/layout/header";

interface Integration {
  id: string;
  name: string;
  adapter: string;
  status: "connected" | "disconnected" | "error";
  description: string;
}

const sections = [
  {
    title: "PM Tool",
    description: "Project management integrations",
    integrations: [
      { id: "int-1", name: "Jira Cloud", adapter: "jira", status: "connected" as const, description: "Connected to acme.atlassian.net" },
      { id: "int-2", name: "Linear", adapter: "linear", status: "disconnected" as const, description: "Not configured" },
    ],
  },
  {
    title: "Code Host",
    description: "Source code management platforms",
    integrations: [
      { id: "int-3", name: "GitHub", adapter: "github", status: "connected" as const, description: "Connected to acme-org" },
      { id: "int-4", name: "GitLab", adapter: "gitlab", status: "disconnected" as const, description: "Not configured" },
    ],
  },
  {
    title: "Channels",
    description: "Communication and notification channels",
    integrations: [
      { id: "int-5", name: "Slack", adapter: "slack", status: "connected" as const, description: "Connected to Acme workspace" },
      { id: "int-6", name: "Discord", adapter: "discord", status: "error" as const, description: "Token expired" },
    ],
  },
  {
    title: "Coding Agents",
    description: "AI coding agent connections",
    integrations: [
      { id: "int-7", name: "Claude Code", adapter: "claude", status: "connected" as const, description: "API key configured" },
      { id: "int-8", name: "Cursor Agent", adapter: "cursor", status: "connected" as const, description: "3 instances available" },
      { id: "int-9", name: "Codex", adapter: "codex", status: "disconnected" as const, description: "Not configured" },
    ],
  },
];

function statusIndicator(status: Integration["status"]) {
  switch (status) {
    case "connected": return "bg-emerald-500";
    case "disconnected": return "bg-zinc-500";
    case "error": return "bg-red-500";
  }
}

function statusLabel(status: Integration["status"]) {
  switch (status) {
    case "connected": return "Connected";
    case "disconnected": return "Disconnected";
    case "error": return "Error";
  }
}

export default function IntegrationsPage() {
  return (
    <div className="p-8">
      <Header
        title="Integrations"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Integrations" }]}
      />

      <div className="mt-8 space-y-10">
        {sections.map((section) => (
          <div key={section.title}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--foreground)]">{section.title}</h2>
                <p className="text-sm text-[var(--muted-foreground)]">{section.description}</p>
              </div>
              <button className="rounded-lg border border-dashed border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors">
                + Add Integration
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {section.integrations.map((integration) => (
                <div
                  key={integration.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition-colors hover:border-[var(--primary)]/50"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-[var(--foreground)]">{integration.name}</h3>
                      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{integration.adapter}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${statusIndicator(integration.status)}`} />
                      <span className="text-xs text-[var(--muted-foreground)]">{statusLabel(integration.status)}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-[var(--muted-foreground)]">{integration.description}</p>
                  <div className="mt-4 flex gap-2">
                    <button className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
                      Configure
                    </button>
                    {integration.status === "error" && (
                      <button className="rounded-lg border border-[var(--destructive)]/30 px-3 py-1 text-xs font-medium text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-colors">
                        Reconnect
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
