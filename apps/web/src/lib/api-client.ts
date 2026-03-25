const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// --- Type definitions (mirroring @orchestra/shared) ---

export interface Workflow {
  id: string;
  ticketId: string;
  templateId: string;
  state: "pending" | "running" | "paused" | "gated" | "completed" | "failed" | "cancelled";
  currentPhaseId: string | null;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  phases: TemplatePhase[];
  teamId: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplatePhase {
  id: string;
  name: string;
  handler: string;
  order: number;
  skipCondition?: string;
  gateConfig?: GateConfig;
}

export interface GateConfig {
  type: string;
  threshold?: number;
  approvers?: string[];
}

export interface Task {
  id: string;
  workflowId: string;
  phaseId: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  dependencies: string[];
  result?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  type: string;
  status: "online" | "offline" | "idle";
  activeTasks: number;
  maxConcurrent: number;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  workflowId: string;
  action: string;
  actor: string;
  details: string;
}

// --- API Error ---

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: unknown
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = "ApiError";
  }
}

// --- Fetch helper ---

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, res.statusText, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// --- Workflows ---

export async function getWorkflows(params?: {
  state?: string;
  limit?: number;
  offset?: number;
}): Promise<Workflow[]> {
  const query = new URLSearchParams();
  if (params?.state) query.set("state", params.state);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return request<Workflow[]>(`/workflows${qs ? `?${qs}` : ""}`);
}

export async function getWorkflow(id: string): Promise<Workflow> {
  return request<Workflow>(`/workflows/${id}`);
}

export async function createWorkflow(data: {
  ticketId: string;
  templateId: string;
  context?: Record<string, unknown>;
}): Promise<Workflow> {
  return request<Workflow>("/workflows", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function transitionWorkflow(
  id: string,
  state: string
): Promise<Workflow> {
  return request<Workflow>(`/workflows/${id}/transition`, {
    method: "PATCH",
    body: JSON.stringify({ state }),
  });
}

export async function pauseWorkflow(
  id: string,
  reason?: string
): Promise<Workflow> {
  return request<Workflow>(`/workflows/${id}/pause`, {
    method: "POST",
    body: JSON.stringify({ reason: reason ?? "" }),
  });
}

export async function resumeWorkflow(id: string): Promise<Workflow> {
  return request<Workflow>(`/workflows/${id}/resume`, {
    method: "POST",
  });
}

// --- Tasks ---

export async function getWorkflowTasks(workflowId: string): Promise<Task[]> {
  return request<Task[]>(`/workflows/${workflowId}/tasks`);
}

// --- Templates ---

export async function getTemplates(): Promise<WorkflowTemplate[]> {
  return request<WorkflowTemplate[]>("/templates");
}

export async function getTemplate(id: string): Promise<WorkflowTemplate> {
  return request<WorkflowTemplate>(`/templates/${id}`);
}

export async function createTemplate(
  data: Omit<WorkflowTemplate, "id" | "createdAt" | "updatedAt">
): Promise<WorkflowTemplate> {
  return request<WorkflowTemplate>("/templates", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateTemplate(
  id: string,
  data: Partial<Omit<WorkflowTemplate, "id" | "createdAt" | "updatedAt">>
): Promise<WorkflowTemplate> {
  return request<WorkflowTemplate>(`/templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function cloneTemplate(id: string): Promise<WorkflowTemplate> {
  return request<WorkflowTemplate>(`/templates/${id}/clone`, {
    method: "POST",
  });
}

export async function publishTemplate(id: string): Promise<WorkflowTemplate> {
  return request<WorkflowTemplate>(`/templates/${id}/publish`, {
    method: "PATCH",
  });
}

// --- Agents ---

export async function getAgents(): Promise<Agent[]> {
  return request<Agent[]>("/agents");
}

// --- Audit ---

export async function getAuditLog(params?: {
  workflowId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditEntry[]> {
  const query = new URLSearchParams();
  if (params?.workflowId) query.set("workflowId", params.workflowId);
  if (params?.action) query.set("action", params.action);
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return request<AuditEntry[]>(`/audit${qs ? `?${qs}` : ""}`);
}
