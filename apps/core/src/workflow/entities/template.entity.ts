export interface GateConfig {
  type: 'lint' | 'test' | 'typecheck' | 'custom';
  command: string;
  maxRetries: number;
  required: boolean;
}

export interface PhaseDefinition {
  name: string;
  type: 'interview' | 'research' | 'planning' | 'execution' | 'review';
  config: Record<string, unknown>;
  gates: GateConfig[];
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  phases: PhaseDefinition[];
  triggerConfig: Record<string, unknown>;
  version: number;
  teamId: string;
  parentTemplateId: string | null;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}
