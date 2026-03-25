"use client";

import { Header } from "@/components/layout/header";
import { useCallback, useEffect, useState } from "react";
import {
  getIntegrations,
  createIntegration,
  updateIntegration,
  deleteIntegration,
  testIntegration,
  type Integration,
  type IntegrationType,
} from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Constants & config
// ---------------------------------------------------------------------------

interface AdapterFieldDef {
  key: string;
  label: string;
  type: "text" | "password";
  required: boolean;
  placeholder?: string;
}

interface AdapterDef {
  name: string;
  label: string;
  fields: AdapterFieldDef[];
}

const SECTIONS: {
  type: IntegrationType;
  title: string;
  description: string;
  adapters: AdapterDef[];
}[] = [
  {
    type: "PM",
    title: "PM Tools",
    description: "Project management integrations",
    adapters: [
      {
        name: "jira",
        label: "Jira",
        fields: [
          { key: "baseUrl", label: "Base URL", type: "text", required: true, placeholder: "https://your-domain.atlassian.net" },
          { key: "email", label: "Email", type: "text", required: true, placeholder: "user@company.com" },
          { key: "apiToken", label: "API Token", type: "password", required: true },
        ],
      },
      {
        name: "jira-comments",
        label: "Jira Comments",
        fields: [
          { key: "baseUrl", label: "Base URL", type: "text", required: true, placeholder: "https://your-domain.atlassian.net" },
          { key: "email", label: "Email", type: "text", required: true, placeholder: "user@company.com" },
          { key: "apiToken", label: "API Token", type: "password", required: true },
        ],
      },
    ],
  },
  {
    type: "CODE_HOST",
    title: "Code Hosts",
    description: "Source code management platforms",
    adapters: [
      {
        name: "github",
        label: "GitHub",
        fields: [
          { key: "token", label: "Token", type: "password", required: true },
          { key: "baseUrl", label: "Base URL (Enterprise)", type: "text", required: false, placeholder: "https://github.example.com/api/v3" },
        ],
      },
    ],
  },
  {
    type: "CHANNEL",
    title: "Channels",
    description: "Communication and notification channels",
    adapters: [
      {
        name: "slack",
        label: "Slack",
        fields: [
          { key: "botToken", label: "Bot Token", type: "password", required: true },
          { key: "signingSecret", label: "Signing Secret", type: "password", required: true },
          { key: "defaultChannel", label: "Default Channel", type: "text", required: false, placeholder: "#general" },
        ],
      },
    ],
  },
  {
    type: "CODING_AGENT",
    title: "Coding Agents",
    description: "AI coding agent connections",
    adapters: [
      {
        name: "claude-code",
        label: "Claude Code",
        fields: [
          { key: "apiKey", label: "API Key", type: "password", required: true },
        ],
      },
    ],
  },
];

function adapterLabel(adapterName: string): string {
  for (const s of SECTIONS) {
    for (const a of s.adapters) {
      if (a.name === adapterName) return a.label;
    }
  }
  return adapterName;
}

function adapterDef(adapterName: string): AdapterDef | undefined {
  for (const s of SECTIONS) {
    for (const a of s.adapters) {
      if (a.name === adapterName) return a;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface ToastData {
  id: number;
  message: string;
  variant: "success" | "error" | "info";
}

let toastId = 0;

function ToastContainer({ toasts, onDismiss }: { toasts: ToastData[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-sm transition-all animate-in slide-in-from-bottom-4 ${
            t.variant === "success"
              ? "border border-emerald-500/30 bg-emerald-950/80 text-emerald-200"
              : t.variant === "error"
              ? "border border-red-500/30 bg-red-950/80 text-red-200"
              : "border border-blue-500/30 bg-blue-950/80 text-blue-200"
          }`}
        >
          {t.variant === "success" && (
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
          {t.variant === "error" && (
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-60 hover:opacity-100">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Password field with show/hide toggle
// ---------------------------------------------------------------------------

function PasswordField({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 pr-10 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        tabIndex={-1}
      >
        {visible ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integration form modal (Add / Edit)
// ---------------------------------------------------------------------------

function IntegrationFormModal({
  mode,
  sectionType,
  adapters,
  integration,
  onSave,
  onClose,
}: {
  mode: "add" | "edit";
  sectionType: IntegrationType;
  adapters: AdapterDef[];
  integration?: Integration;
  onSave: () => void;
  onClose: () => void;
}) {
  const [selectedAdapter, setSelectedAdapter] = useState<string>(
    integration?.adapterName ?? adapters[0]?.name ?? ""
  );
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentAdapterDef = adapters.find((a) => a.name === selectedAdapter);

  // Initialize form values when adapter or integration changes
  useEffect(() => {
    if (mode === "edit" && integration) {
      const initial: Record<string, string> = {};
      const def = adapterDef(integration.adapterName);
      if (def) {
        for (const f of def.fields) {
          // For secrets, leave blank so user can optionally re-enter
          if (f.type === "password") {
            initial[f.key] = "";
          } else {
            initial[f.key] = integration.config[f.key] ?? "";
          }
        }
      }
      setFormValues(initial);
    } else {
      setFormValues({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedAdapter]);

  const setField = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): boolean => {
    if (!currentAdapterDef) return false;
    for (const f of currentAdapterDef.fields) {
      if (f.required) {
        // In edit mode, secret fields are optional (empty = don't update)
        if (mode === "edit" && f.type === "password") continue;
        if (!formValues[f.key]?.trim()) return false;
      }
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) {
      setError("Please fill in all required fields.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (mode === "add") {
        await createIntegration({
          type: sectionType,
          adapterName: selectedAdapter,
          config: { ...formValues },
          teamId: "team-1",
        });
      } else if (integration) {
        // Only send fields that were filled in; skip empty secret fields
        const config: Record<string, string> = {};
        if (currentAdapterDef) {
          for (const f of currentAdapterDef.fields) {
            const v = formValues[f.key];
            if (f.type === "password") {
              if (v && v.trim()) config[f.key] = v;
            } else {
              if (v !== undefined) config[f.key] = v;
            }
          }
        }
        await updateIntegration(integration.id, { config });
      }
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save integration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          {mode === "add" ? "Add Integration" : "Edit Integration"}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {mode === "add" ? "Configure a new integration for your team." : "Update integration settings."}
        </p>

        <div className="mt-5 space-y-4">
          {/* Adapter selector */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--muted-foreground)]">Adapter</label>
            {mode === "edit" ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]">
                {adapterLabel(selectedAdapter)}
              </div>
            ) : (
              <select
                value={selectedAdapter}
                onChange={(e) => {
                  setSelectedAdapter(e.target.value);
                  setFormValues({});
                }}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              >
                {adapters.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Dynamic fields */}
          {currentAdapterDef?.fields.map((field) => (
            <div key={field.key}>
              <label htmlFor={`field-${field.key}`} className="mb-1.5 block text-xs font-medium text-[var(--muted-foreground)]">
                {field.label}
                {field.required && mode === "add" && <span className="ml-0.5 text-red-400">*</span>}
              </label>
              {field.type === "password" ? (
                <PasswordField
                  id={`field-${field.key}`}
                  value={formValues[field.key] ?? ""}
                  onChange={(v) => setField(field.key, v)}
                  placeholder={
                    mode === "edit" ? "Enter new value to update" : field.placeholder ?? ""
                  }
                />
              ) : (
                <input
                  id={`field-${field.key}`}
                  type="text"
                  value={formValues[field.key] ?? ""}
                  onChange={(e) => setField(field.key, e.target.value)}
                  placeholder={field.placeholder ?? ""}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-400">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">{message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integration card
// ---------------------------------------------------------------------------

function IntegrationCard({
  integration,
  onEdit,
  onTest,
  onDelete,
  testing,
}: {
  integration: Integration;
  onEdit: () => void;
  onTest: () => void;
  onDelete: () => void;
  testing: boolean;
}) {
  const def = adapterDef(integration.adapterName);

  const statusColor =
    integration.testStatus === "success"
      ? "bg-emerald-500"
      : integration.testStatus === "failed"
      ? "bg-red-500"
      : "bg-yellow-500";

  const statusText =
    integration.testStatus === "success"
      ? "Connected"
      : integration.testStatus === "failed"
      ? "Failed"
      : "Untested";

  // Build config summary showing non-secret fields and ***** for secrets
  const configSummary: { label: string; value: string }[] = [];
  if (def) {
    for (const f of def.fields) {
      const raw = integration.config[f.key];
      if (!raw) continue;
      configSummary.push({
        label: f.label,
        value: f.type === "password" ? "*****" : raw,
      });
    }
  }

  return (
    <div className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition-colors hover:border-[var(--primary)]/50">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--muted)] text-xs font-bold uppercase text-[var(--foreground)]">
            {integration.adapterName.slice(0, 2)}
          </div>
          <div>
            <h3 className="font-medium text-[var(--foreground)]">{adapterLabel(integration.adapterName)}</h3>
            <p className="text-xs text-[var(--muted-foreground)]">{integration.adapterName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
          <span className="text-xs text-[var(--muted-foreground)]">{statusText}</span>
        </div>
      </div>

      {/* Config summary */}
      {configSummary.length > 0 && (
        <div className="mt-3 space-y-1">
          {configSummary.map((c) => (
            <div key={c.label} className="flex items-baseline gap-2 text-xs">
              <span className="text-[var(--muted-foreground)]">{c.label}:</span>
              <span className="truncate font-mono text-[var(--foreground)]">{c.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Last tested */}
      {integration.lastTestedAt && (
        <p className="mt-2 text-[10px] text-[var(--muted-foreground)]">
          Last tested: {new Date(integration.lastTestedAt).toLocaleString()}
        </p>
      )}

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={onEdit}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
        >
          Edit
        </button>
        <button
          onClick={onTest}
          disabled={testing}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
        >
          {testing ? (
            <span className="flex items-center gap-1.5">
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Testing...
            </span>
          ) : (
            "Test Connection"
          )}
        </button>
        <button
          onClick={onDelete}
          className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastData[]>([]);

  // Modal state
  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [modalSectionType, setModalSectionType] = useState<IntegrationType>("PM");
  const [modalAdapters, setModalAdapters] = useState<AdapterDef[]>([]);
  const [editingIntegration, setEditingIntegration] = useState<Integration | undefined>();

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Testing state per-integration
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());

  const addToast = useCallback((message: string, variant: ToastData["variant"]) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fetchIntegrations = useCallback(async () => {
    try {
      const data = await getIntegrations();
      setIntegrations(data);
    } catch {
      addToast("Failed to load integrations.", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // -- Handlers --

  const handleAdd = (section: (typeof SECTIONS)[number]) => {
    setModalMode("add");
    setModalSectionType(section.type);
    setModalAdapters(section.adapters);
    setEditingIntegration(undefined);
  };

  const handleEdit = (integration: Integration, section: (typeof SECTIONS)[number]) => {
    setModalMode("edit");
    setModalSectionType(section.type);
    setModalAdapters(section.adapters);
    setEditingIntegration(integration);
  };

  const handleModalSave = () => {
    setModalMode(null);
    fetchIntegrations();
    addToast(
      modalMode === "add" ? "Integration created." : "Integration updated.",
      "success"
    );
  };

  const handleModalClose = () => {
    setModalMode(null);
  };

  const handleTest = async (id: string) => {
    setTestingIds((prev) => new Set(prev).add(id));
    try {
      const result = await testIntegration(id);
      addToast(result.message, result.success ? "success" : "error");
      // Refresh to get updated testStatus
      await fetchIntegrations();
    } catch {
      addToast("Connection test failed.", "error");
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    try {
      await deleteIntegration(deletingId);
      addToast("Integration deleted.", "success");
      setDeletingId(null);
      fetchIntegrations();
    } catch {
      addToast("Failed to delete integration.", "error");
      setDeletingId(null);
    }
  };

  return (
    <div className="p-8">
      <Header
        title="Integrations"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Integrations" }]}
      />

      {loading ? (
        <div className="mt-16 flex items-center justify-center">
          <svg className="h-6 w-6 animate-spin text-[var(--muted-foreground)]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="ml-3 text-sm text-[var(--muted-foreground)]">Loading integrations...</span>
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {SECTIONS.map((section) => {
            const sectionIntegrations = integrations.filter((i) => i.type === section.type);

            return (
              <div key={section.type}>
                {/* Section header */}
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--foreground)]">{section.title}</h2>
                    <p className="text-sm text-[var(--muted-foreground)]">{section.description}</p>
                  </div>
                  <button
                    onClick={() => handleAdd(section)}
                    className="rounded-lg border border-dashed border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
                  >
                    + Add Integration
                  </button>
                </div>

                {/* Cards grid or empty state */}
                {sectionIntegrations.length === 0 ? (
                  <div className="flex items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 py-12">
                    <div className="text-center">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--muted)]">
                        <svg className="h-5 w-5 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-6.364-6.364L4.5 8.25" />
                        </svg>
                      </div>
                      <p className="text-sm text-[var(--muted-foreground)]">No integrations configured</p>
                      <button
                        onClick={() => handleAdd(section)}
                        className="mt-2 text-xs font-medium text-[var(--primary)] hover:underline"
                      >
                        Add your first integration
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sectionIntegrations.map((integration) => (
                      <IntegrationCard
                        key={integration.id}
                        integration={integration}
                        onEdit={() => handleEdit(integration, section)}
                        onTest={() => handleTest(integration.id)}
                        onDelete={() => setDeletingId(integration.id)}
                        testing={testingIds.has(integration.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {modalMode && (
        <IntegrationFormModal
          mode={modalMode}
          sectionType={modalSectionType}
          adapters={modalAdapters}
          integration={editingIntegration}
          onSave={handleModalSave}
          onClose={handleModalClose}
        />
      )}

      {deletingId && (
        <ConfirmDialog
          title="Delete Integration"
          message="Are you sure you want to delete this integration? This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingId(null)}
        />
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
