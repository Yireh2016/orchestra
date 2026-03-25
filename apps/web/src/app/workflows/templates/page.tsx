"use client";

import { Header } from "@/components/layout/header";

const templates = [
  { id: "tpl-1", name: "Full CI/CD Pipeline", description: "Complete pipeline from ticket to deployment with testing and review gates.", phases: 5, team: "Platform", published: true },
  { id: "tpl-2", name: "Bug Fix Flow", description: "Quick bug fix flow with automated testing and hotfix deployment.", phases: 3, team: "Platform", published: true },
  { id: "tpl-3", name: "Feature Development", description: "Standard feature development with planning, implementation, review, and QA.", phases: 4, team: "Engineering", published: true },
  { id: "tpl-4", name: "Hotfix Pipeline", description: "Emergency hotfix with expedited review and direct-to-prod deployment.", phases: 3, team: "SRE", published: true },
  { id: "tpl-5", name: "Refactoring Workflow", description: "Large-scale refactoring with incremental validation and rollback support.", phases: 6, team: "Engineering", published: false },
  { id: "tpl-6", name: "Security Audit", description: "Security-focused workflow with vulnerability scanning and compliance checks.", phases: 4, team: "Security", published: false },
];

export default function TemplatesPage() {
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
              <span>{tpl.phases} phases</span>
              <span className="h-1 w-1 rounded-full bg-[var(--muted-foreground)]" />
              <span>{tpl.team}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <a
                href={`/workflows/templates/${tpl.id}/editor`}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              >
                Edit
              </a>
              <button className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
                Clone
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
