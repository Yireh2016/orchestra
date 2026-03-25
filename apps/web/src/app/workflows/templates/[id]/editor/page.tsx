"use client";

import { Header } from "@/components/layout/header";
import { use, useState, useEffect } from "react";
import { getTemplate, updateTemplate, publishTemplate, WorkflowTemplate, TemplatePhase } from "@/lib/api-client";

const handlers = ["coding-agent", "review-agent", "test-runner", "deploy-agent", "security-scanner", "custom"];
const gateTypes = ["none", "approval", "automated-test", "coverage-threshold", "manual"];

interface EditorPhase {
  id: string;
  name: string;
  handler: string;
  order: number;
  skipCondition: string;
  gateType: string;
}

function templatePhaseToEditor(p: TemplatePhase, index: number): EditorPhase {
  return {
    id: p.id,
    name: p.name,
    handler: p.handler,
    order: p.order ?? index,
    skipCondition: p.skipCondition ?? "",
    gateType: p.gateConfig?.type ?? "none",
  };
}

function editorPhaseToTemplate(p: EditorPhase, index: number): TemplatePhase {
  const result: TemplatePhase = {
    id: p.id,
    name: p.name,
    handler: p.handler,
    order: index,
  };
  if (p.skipCondition) result.skipCondition = p.skipCondition;
  if (p.gateType && p.gateType !== "none") result.gateConfig = { type: p.gateType };
  return result;
}

export default function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phases, setPhases] = useState<EditorPhase[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const tpl = await getTemplate(id);
        setTemplate(tpl);
        setName(tpl.name);
        setDescription(tpl.description);
        setPhases((tpl.phases ?? []).map((p, i) => templatePhaseToEditor(p, i)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load template");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const updatePhase = (index: number, field: keyof EditorPhase, value: string) => {
    setPhases((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const addPhase = () => {
    setPhases((prev) => [
      ...prev,
      { id: `p${Date.now()}`, name: "New Phase", handler: "coding-agent", order: prev.length, skipCondition: "", gateType: "none" },
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

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const updated = await updateTemplate(id, {
        name,
        description,
        phases: phases.map((p, i) => editorPhaseToTemplate(p, i)),
      });
      setTemplate(updated);
      setSaveMessage("Saved successfully");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      // Save first, then publish
      await updateTemplate(id, {
        name,
        description,
        phases: phases.map((p, i) => editorPhaseToTemplate(p, i)),
      });
      const updated = await publishTemplate(id);
      setTemplate(updated);
      setSaveMessage("Published successfully");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to publish template");
    } finally {
      setPublishing(false);
    }
  };

  if (error) {
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
        />
        <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
          <p className="font-medium">Error loading template</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
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
        />
        <p className="mt-8 text-sm text-[var(--muted-foreground)]">Loading template...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Header
        title="Edit Template"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Templates", href: "/workflows/templates" },
          { label: template?.name ?? id },
          { label: "Editor" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {saveMessage && (
              <span className="text-sm text-emerald-400">{saveMessage}</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Draft"}
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {publishing ? "Publishing..." : "Publish"}
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

          {phases.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No phases yet. Click "+ Add Phase" to add one.</p>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}
