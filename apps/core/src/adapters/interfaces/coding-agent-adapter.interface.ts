export const CODING_AGENT_ADAPTER = Symbol('CODING_AGENT_ADAPTER');

export interface AgentInstance {
  id: string;
  status: 'starting' | 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface SpawnParams {
  prompt: string;
  workingDirectory: string;
  timeout?: number;
  env?: Record<string, string>;
}

export interface CodingAgentAdapter {
  spawn(params: SpawnParams): Promise<AgentInstance>;
  getStatus(instanceId: string): Promise<AgentInstance>;
  getOutput(instanceId: string): Promise<string>;
  kill(instanceId: string): Promise<void>;
  listRunning(): Promise<AgentInstance[]>;
}
