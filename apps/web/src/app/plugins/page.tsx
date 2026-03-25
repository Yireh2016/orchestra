"use client";

import { Header } from "@/components/layout/header";
import { useState } from "react";

interface Plugin {
  id: string;
  name: string;
  type: string;
  version: string;
  description: string;
  enabled: boolean;
}

const initialPlugins: Plugin[] = [
  { id: "plg-1", name: "Jira Sync", type: "PM Adapter", version: "1.2.0", description: "Bi-directional sync with Jira tickets including status, comments, and attachments.", enabled: true },
  { id: "plg-2", name: "GitHub Actions", type: "CI/CD", version: "2.0.1", description: "Trigger and monitor GitHub Actions workflows from Orchestra pipelines.", enabled: true },
  { id: "plg-3", name: "Slack Notifier", type: "Notification", version: "1.0.3", description: "Send workflow status updates and gate results to Slack channels.", enabled: true },
  { id: "plg-4", name: "SonarQube Gate", type: "Quality Gate", version: "0.9.0", description: "Quality gate integration with SonarQube for code analysis and coverage checks.", enabled: false },
  { id: "plg-5", name: "PagerDuty Alert", type: "Notification", version: "1.1.0", description: "Create incidents in PagerDuty when workflows fail or gates are breached.", enabled: false },
  { id: "plg-6", name: "Datadog Metrics", type: "Observability", version: "0.8.2", description: "Export workflow metrics and traces to Datadog for monitoring and alerting.", enabled: false },
  { id: "plg-7", name: "Terraform Deploy", type: "Infrastructure", version: "1.3.0", description: "Execute Terraform plans and applies as deployment steps in workflows.", enabled: true },
  { id: "plg-8", name: "Snyk Security", type: "Security", version: "2.1.0", description: "Run Snyk vulnerability scans as gate checks in CI/CD workflows.", enabled: true },
];

export default function PluginsPage() {
  const [plugins, setPlugins] = useState(initialPlugins);

  const togglePlugin = (id: string) => {
    setPlugins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    );
  };

  return (
    <div className="p-8">
      <Header
        title="Plugins"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Plugins" }]}
        actions={
          <button className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
            Upload Plugin
          </button>
        }
      />

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-sky-500/25 bg-sky-500/10 p-4">
        <span className="mt-0.5 text-sky-400 text-lg leading-none">i</span>
        <p className="text-sm text-sky-300/90">
          Plugin marketplace coming soon. Plugins will allow you to extend Orchestra with custom adapters and phase handlers.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {plugins.map((plugin) => (
          <div
            key={plugin.id}
            className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 transition-colors hover:border-[var(--primary)]/50"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-[var(--foreground)]">{plugin.name}</h3>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
                    {plugin.type}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">v{plugin.version}</span>
                </div>
              </div>
              <button
                onClick={() => togglePlugin(plugin.id)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  plugin.enabled ? "bg-[var(--primary)]" : "bg-[var(--muted)]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    plugin.enabled ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            <p className="mt-3 flex-1 text-sm text-[var(--muted-foreground)]">{plugin.description}</p>
            <div className="mt-4">
              <span
                className={`text-xs font-medium ${
                  plugin.enabled ? "text-emerald-400" : "text-[var(--muted-foreground)]"
                }`}
              >
                {plugin.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
