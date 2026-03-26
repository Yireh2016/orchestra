"use client";

import { Header } from "@/components/layout/header";
import { useState, useEffect } from "react";
import {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  scanProject,
  Project,
  ProjectRepository,
} from "@/lib/api-client";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface RepoFormRow {
  url: string;
  defaultBranch: string;
  path: string;
}

function emptyRepo(): RepoFormRow {
  return { url: "", defaultBranch: "main", path: "" };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createRepos, setCreateRepos] = useState<RepoFormRow[]>([emptyRepo()]);
  const [createPmKey, setCreatePmKey] = useState("");
  const [creating, setCreating] = useState(false);

  // Scan state
  const [scanningId, setScanningId] = useState<string | null>(null);

  // Edit/detail modal state
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editRepos, setEditRepos] = useState<RepoFormRow[]>([]);
  const [editPmKey, setEditPmKey] = useState("");
  const [editContext, setEditContext] = useState("");
  const [saving, setSaving] = useState(false);

  // Post-create scan prompt
  const [askScanProject, setAskScanProject] = useState<Project | null>(null);

  const loadProjects = async () => {
    try {
      const projs = await getProjects();
      setProjects(projs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // --- Create ---
  const resetCreate = () => {
    setCreateName("");
    setCreateDesc("");
    setCreateRepos([emptyRepo()]);
    setCreatePmKey("");
  };

  const handleCreate = async () => {
    if (!createName.trim()) return;
    const validRepos = createRepos.filter((r) => r.url.trim());
    if (validRepos.length === 0) return;
    setCreating(true);
    try {
      const repos: ProjectRepository[] = validRepos.map((r) => ({
        url: r.url.trim(),
        defaultBranch: r.defaultBranch.trim() || "main",
        path: r.path.trim() || undefined,
      }));
      const proj = await createProject({
        name: createName.trim(),
        description: createDesc.trim() || undefined,
        repositories: repos,
        pmProjectKey: createPmKey.trim() || undefined,
        teamId: "team-1",
      });
      setShowCreate(false);
      resetCreate();
      await loadProjects();
      setAskScanProject(proj);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const handleScanAfterCreate = async () => {
    if (!askScanProject) return;
    setScanningId(askScanProject.id);
    setAskScanProject(null);
    try {
      const updated = await scanProject(askScanProject.id);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanningId(null);
    }
  };

  // --- Scan ---
  const handleScan = async (id: string) => {
    setScanningId(id);
    try {
      const updated = await scanProject(id);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanningId(null);
    }
  };

  // --- Delete ---
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  // --- Edit ---
  const openEdit = async (proj: Project) => {
    try {
      const full = await getProject(proj.id);
      setEditProject(full);
      setEditName(full.name);
      setEditDesc(full.description || "");
      setEditRepos(
        full.repositories.length > 0
          ? full.repositories.map((r) => ({
              url: r.url,
              defaultBranch: r.defaultBranch || "main",
              path: r.path || "",
            }))
          : [emptyRepo()]
      );
      setEditPmKey(full.pmProjectKey || "");
      setEditContext(full.context || "");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to load project");
    }
  };

  const handleSave = async () => {
    if (!editProject || !editName.trim()) return;
    const validRepos = editRepos.filter((r) => r.url.trim());
    if (validRepos.length === 0) return;
    setSaving(true);
    try {
      const repos: ProjectRepository[] = validRepos.map((r) => ({
        url: r.url.trim(),
        defaultBranch: r.defaultBranch.trim() || "main",
        path: r.path.trim() || undefined,
      }));
      const updated = await updateProject(editProject.id, {
        name: editName.trim(),
        description: editDesc.trim(),
        repositories: repos,
        pmProjectKey: editPmKey.trim() || undefined,
        context: editContext,
      });
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditProject(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!editProject) return;
    setScanningId(editProject.id);
    try {
      const updated = await scanProject(editProject.id);
      setEditProject(updated);
      setEditContext(updated.context || "");
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanningId(null);
    }
  };

  // --- Repo list helpers ---
  const updateCreateRepo = (idx: number, field: keyof RepoFormRow, value: string) => {
    setCreateRepos((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };
  const addCreateRepo = () => setCreateRepos((prev) => [...prev, emptyRepo()]);
  const removeCreateRepo = (idx: number) => {
    setCreateRepos((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const updateEditRepo = (idx: number, field: keyof RepoFormRow, value: string) => {
    setEditRepos((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };
  const addEditRepo = () => setEditRepos((prev) => [...prev, emptyRepo()]);
  const removeEditRepo = (idx: number) => {
    setEditRepos((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  // auto-detect PM key from first repo URL
  useEffect(() => {
    if (createRepos.length > 0 && createRepos[0].url && !createPmKey) {
      const match = createRepos[0].url.match(/\/([^/]+?)(?:\.git)?$/);
      if (match) {
        setCreatePmKey(match[1]);
      }
    }
  }, [createRepos, createPmKey]);

  if (error) {
    return (
      <div className="p-8">
        <Header
          title="Projects"
          breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Projects" }]}
        />
        <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
          <p className="font-medium">Error loading projects</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Header
        title="Projects"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Projects" }]}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
          >
            New Project
          </button>
        }
      />

      {/* Ask scan after create */}
      {askScanProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--foreground)]">Scan Repositories?</h3>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Project &quot;{askScanProject.name}&quot; was created. Would you like to scan its repositories now to generate context?
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setAskScanProject(null)}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              >
                Later
              </button>
              <button
                onClick={handleScanAfterCreate}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
              >
                Scan Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--foreground)]">New Project</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Name *</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="My Project"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Description</label>
                <textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="Optional project description"
                  rows={2}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Repositories *</label>
                <div className="space-y-2">
                  {createRepos.map((repo, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="flex-1 space-y-1">
                        <input
                          type="text"
                          value={repo.url}
                          onChange={(e) => updateCreateRepo(idx, "url", e.target.value)}
                          placeholder="https://github.com/org/repo"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={repo.defaultBranch}
                            onChange={(e) => updateCreateRepo(idx, "defaultBranch", e.target.value)}
                            placeholder="Branch (main)"
                            className="w-1/2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                          />
                          <input
                            type="text"
                            value={repo.path}
                            onChange={(e) => updateCreateRepo(idx, "path", e.target.value)}
                            placeholder="Path (optional)"
                            className="w-1/2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                          />
                        </div>
                      </div>
                      {createRepos.length > 1 && (
                        <button
                          onClick={() => removeCreateRepo(idx)}
                          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                          title="Remove repository"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={addCreateRepo}
                  className="mt-2 text-sm text-[var(--primary)] hover:underline"
                >
                  + Add Repository
                </button>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">PM Project Key</label>
                <input
                  type="text"
                  value={createPmKey}
                  onChange={(e) => setCreatePmKey(e.target.value)}
                  placeholder="Auto-detected from repo name"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => { setShowCreate(false); resetCreate(); }}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createName.trim() || createRepos.every((r) => !r.url.trim())}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Detail Modal */}
      {editProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--foreground)]">Edit Project</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Name *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Description</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">Repositories</label>
                <div className="space-y-2">
                  {editRepos.map((repo, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="flex-1 space-y-1">
                        <input
                          type="text"
                          value={repo.url}
                          onChange={(e) => updateEditRepo(idx, "url", e.target.value)}
                          placeholder="https://github.com/org/repo"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={repo.defaultBranch}
                            onChange={(e) => updateEditRepo(idx, "defaultBranch", e.target.value)}
                            placeholder="Branch (main)"
                            className="w-1/2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                          />
                          <input
                            type="text"
                            value={repo.path}
                            onChange={(e) => updateEditRepo(idx, "path", e.target.value)}
                            placeholder="Path (optional)"
                            className="w-1/2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                          />
                        </div>
                      </div>
                      {editRepos.length > 1 && (
                        <button
                          onClick={() => removeEditRepo(idx)}
                          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                          title="Remove repository"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={addEditRepo}
                  className="mt-2 text-sm text-[var(--primary)] hover:underline"
                >
                  + Add Repository
                </button>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">PM Project Key</label>
                <input
                  type="text"
                  value={editPmKey}
                  onChange={(e) => setEditPmKey(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-[var(--foreground)]">Context</label>
                  <div className="flex items-center gap-3">
                    {editProject.contextGeneratedAt && (
                      <span className="text-xs text-[var(--muted-foreground)]">
                        Generated {timeAgo(editProject.contextGeneratedAt)}
                      </span>
                    )}
                    <button
                      onClick={handleRegenerate}
                      disabled={scanningId === editProject.id}
                      className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
                    >
                      {scanningId === editProject.id ? (
                        <>
                          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Scanning...
                        </>
                      ) : (
                        "Regenerate Context"
                      )}
                    </button>
                  </div>
                </div>
                <textarea
                  value={editContext}
                  onChange={(e) => setEditContext(e.target.value)}
                  rows={12}
                  className="w-full rounded-lg border border-[var(--border)] bg-zinc-900 px-4 py-3 font-mono text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-y"
                  placeholder="No context generated yet. Click 'Regenerate Context' to scan repositories."
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setEditProject(null)}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editName.trim() || editRepos.every((r) => !r.url.trim())}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project List */}
      {loading ? (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">Loading projects...</p>
      ) : projects.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">No projects found. Create one to get started.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((proj) => (
            <div
              key={proj.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition-colors hover:border-[var(--primary)]/30"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-semibold text-[var(--foreground)]">{proj.name}</h3>
                  {proj.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--muted-foreground)]">{proj.description}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-2.5 py-0.5 text-[var(--muted-foreground)]">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                  {proj.repositories?.length || 0} repo{(proj.repositories?.length || 0) !== 1 ? "s" : ""}
                </span>
                {proj.pmProjectKey && (
                  <span className="inline-flex items-center rounded-full bg-[var(--muted)] px-2.5 py-0.5 text-[var(--muted-foreground)]">
                    {proj.pmProjectKey}
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 ${
                    proj.contextGeneratedAt
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-zinc-500/15 text-zinc-400"
                  }`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${proj.contextGeneratedAt ? "bg-emerald-400" : "bg-zinc-400"}`} />
                  {proj.contextGeneratedAt ? "Context generated" : "No context"}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-3">
                <button
                  onClick={() => openEdit(proj)}
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleScan(proj.id)}
                  disabled={scanningId === proj.id}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
                >
                  {scanningId === proj.id ? (
                    <>
                      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Scanning...
                    </>
                  ) : (
                    "Scan Repos"
                  )}
                </button>
                <button
                  onClick={() => handleDelete(proj.id)}
                  className="ml-auto rounded-md border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
