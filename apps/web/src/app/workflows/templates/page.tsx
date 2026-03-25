"use client";

import { Header } from "@/components/layout/header";
import { useEffect, useState } from "react";
import { getTemplates, cloneTemplate, WorkflowTemplate } from "@/lib/api-client";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const loadTemplates = async () => {
    try {
      const tpls = await getTemplates();
      setTemplates(tpls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleClone = async (id: string) => {
    setCloningId(id);
    try {
      await cloneTemplate(id);
      await loadTemplates();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to clone template");
    } finally {
      setCloningId(null);
    }
  };

  if (error) {
    return (
      <div className="p-8">
        <Header
          title="Workflow Templates"
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Workflows", href: "/workflows" },
            { label: "Templates" },
          ]}
        />
        <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
          <p className="font-medium">Error loading templates</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Header
        title="Workflow Templates"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Workflows", href: "/workflows" },
          { label: "Templates" },
        ]}
        actions={
          <button className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
            New Template
          </button>
        }
      />

      {loading ? (
        <p className="mt-8 text-sm text-[var(--muted-foreground)]">Loading templates...</p>
      ) : templates.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--muted-foreground)]">No templates found. Create one to get started.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 transition-colors hover:border-[var(--primary)]/50"
            >
              <div className="flex items-start justify-between">
                <h3 className="text-base font-semibold text-[var(--foreground)]">{tpl.name}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    tpl.published
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-amber-500/15 text-amber-400"
                  }`}
                >
                  {tpl.published ? "Published" : "Draft"}
                </span>
              </div>
              <p className="mt-2 flex-1 text-sm text-[var(--muted-foreground)]">{tpl.description}</p>
              <div className="mt-4 flex items-center gap-4 text-xs text-[var(--muted-foreground)]">
                <span>{tpl.phases?.length ?? 0} phases</span>
                <span className="h-1 w-1 rounded-full bg-[var(--muted-foreground)]" />
                <span>{tpl.teamId}</span>
              </div>
              <div className="mt-4 flex gap-2">
                <a
                  href={`/workflows/templates/${tpl.id}/editor`}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                >
                  Edit
                </a>
                <button
                  onClick={() => handleClone(tpl.id)}
                  disabled={cloningId === tpl.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
                >
                  {cloningId === tpl.id ? "Cloning..." : "Clone"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
