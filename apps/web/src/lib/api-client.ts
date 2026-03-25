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
  name?: string;
  type?: string;
  status: "running" | "idle" | "failed" | "online" | "offline";
  workflowRunId?: string | null;
  taskId?: string | null;
  startedAt?: string | null;
  activeTasks?: number;
  maxConcurrent?: number;
}

export interface AgentLogs {
  agentId: string;
  logs: string[];
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  workflowId: string;
  action: string;
  actor: string;
  details: string;
}

export interface AuditLog {
  id: string;
  workflowRunId: string | null;
  action: string;
  actor: string;
  details: Record<string, any>;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
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

export async function getAgent(id: string): Promise<Agent> {
  return request<Agent>(`/agents/${id}`);
}

export async function getAgentLogs(id: string): Promise<AgentLogs> {
  return request<AgentLogs>(`/agents/${id}/logs`);
}

export async function stopAgent(id: string): Promise<void> {
  return request<void>(`/agents/${id}/stop`, { method: "POST" });
}

// --- Integrations ---

export type IntegrationType = "PM" | "CODE_HOST" | "CHANNEL" | "CODING_AGENT";

export interface Integration {
  id: string;
  type: IntegrationType;
  adapterName: string;
  config: Record<string, string>;
  teamId: string;
  testStatus?: "success" | "failed" | null;
  lastTestedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getIntegrations(): Promise<Integration[]> {
  return request<Integration[]>("/integrations");
}

export async function getIntegration(id: string): Promise<Integration> {
  return request<Integration>(`/integrations/${id}`);
}

export async function createIntegration(data: {
  type: IntegrationType;
  adapterName: string;
  config: Record<string, string>;
  teamId: string;
}): Promise<Integration> {
  return request<Integration>("/integrations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateIntegration(
  id: string,
  data: { adapterName?: string; config?: Record<string, string> }
): Promise<Integration> {
  return request<Integration>(`/integrations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteIntegration(id: string): Promise<void> {
  return request<void>(`/integrations/${id}`, { method: "DELETE" });
}

export async function testIntegration(
  id: string
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(
    `/integrations/${id}/test`,
    { method: "POST" }
  );
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

export async function getAuditLogs(params?: {
  workflowRunId?: string;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<AuditLog>> {
  const searchParams = new URLSearchParams();
  if (params?.workflowRunId) searchParams.set("workflowRunId", params.workflowRunId);
  if (params?.action) searchParams.set("action", params.action);
  if (params?.actor) searchParams.set("actor", params.actor);
  if (params?.from) searchParams.set("from", params.from);
  if (params?.to) searchParams.set("to", params.to);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString();
  return request<PaginatedResponse<AuditLog>>(`/audit-logs${query ? `?${query}` : ""}`);
}
