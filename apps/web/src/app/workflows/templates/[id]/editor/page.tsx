"use client";

import { Header } from "@/components/layout/header";
import { use, useState } from "react";

interface Phase {
  id: string;
  name: string;
  handler: string;
  skipCondition: string;
  gateType: string;
}

const handlers = ["coding-agent", "review-agent", "test-runner", "deploy-agent", "security-scanner", "custom"];
const gateTypes = ["none", "approval", "automated-test", "coverage-threshold", "manual"];

const initialPhases: Phase[] = [
  { id: "p1", name: "Planning", handler: "coding-agent", skipCondition: "", gateType: "none" },
  { id: "p2", name: "Implementation", handler: "coding-agent", skipCondition: "", gateType: "automated-test" },
  { id: "p3", name: "Code Review", handler: "review-agent", skipCondition: "", gateType: "approval" },
  { id: "p4", name: "Testing", handler: "test-runner", skipCondition: "ticket.type === 'docs'", gateType: "coverage-threshold" },
  { id: "p5", name: "Deploy", handler: "deploy-agent", skipCondition: "", gateType: "manual" },
];

export default function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [name, setName] = useState("Full CI/CD Pipeline");
  const [description, setDescription] = useState("Complete pipeline from ticket to deployment with testing and review gates.");
  const [phases, setPhases] = useState<Phase[]>(initialPhases);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const updatePhase = (index: number, field: keyof Phase, value: string) => {
    setPhases((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const addPhase = () => {
    setPhases((prev) => [
      ...prev,
      { id: `p${Date.now()}`, name: "New Phase", handler: "coding-agent", skipCondition: "", gateType: "none" },
    ]);
  };

  const removePhase = (index: number) => {
    setPhases((prev) => prev.filter((_, i) => i !== index));
  };

  const movePhase = (from: number, to: number) => {
    setPhases((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(from, 1);
      copy.splice(to, 0, removed);
      return copy;
    });
  };

  return (
    <div className="p-8">
      <Header
        title="Edit Template"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Templates", href: "/workflows/templates" },
          { label: id },
          { label: "Editor" },
        ]}
        actions={
          <div className="flex gap-2">
            <button className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
              Save Draft
            </button>
            <button className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity">
              Publish
            </button>
          </div>
        }
      />

      {/* Form */}
      <div className="mt-8 max-w-4xl space-y-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Template Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-none"
          />
        </div>

        {/* Phases */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Phases</h2>
            <button
              onClick={addPhase}
              className="rounded-lg border border-dashed border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
            >
              + Add Phase
            </button>
          </div>

          <div className="space-y-3">
            {phases.map((phase, index) => (
              <div
                key={phase.id}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex !== null && dragIndex !== index) {
                    movePhase(dragIndex, index);
                  }
                  setDragIndex(null);
                }}
                className={`rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all ${
                  dragIndex === index ? "opacity-50 scale-[0.98]" : ""
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="cursor-grab text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
                      </svg>
                    </span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)]/15 text-xs font-medium text-[var(--primary)]">
                      {index + 1}
                    </span>
                  </div>
                  <button
                    onClick={() => removePhase(index)}
                    className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-[var(--muted-foreground)]">Phase Name</label>
                    <input
                      type="text"
                      value={phase.name}
                      onChange={(e) => updatePhase(index, "name", e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--muted-foreground)]">Handler</label>
                    <select
                      value={phase.handler}
                      onChange={(e) => updatePhase(index, "handler", e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    >
                      {handlers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--muted-foreground)]">Skip Condition</label>
                    <input
                      type="text"
                      value={phase.skipCondition}
                      onChange={(e) => updatePhase(index, "skipCondition", e.target.value)}
                      placeholder="e.g., ticket.type === 'docs'"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--muted-foreground)]">Gate Type</label>
                    <select
                      value={phase.gateType}
                      onChange={(e) => updatePhase(index, "gateType", e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    >
                      {gateTypes.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
