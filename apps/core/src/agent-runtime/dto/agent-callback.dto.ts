import { IsString, IsOptional, IsEnum, IsObject } from 'class-validator';

export class AgentCallbackDto {
  @IsString()
  taskId!: string;

  @IsString()
  workflowRunId!: string;

  @IsEnum(['success', 'error', 'timeout'])
  status!: 'success' | 'error' | 'timeout';

  @IsString()
  @IsOptional()
  message?: string;

  @IsString()
  @IsOptional()
  output?: string;

  @IsString()
  @IsOptional()
  branch?: string;

  @IsString()
  @IsOptional()
  agentType?: string;

  @IsObject()
  @IsOptional()
  gateResults?: Record<string, any>;

  @IsString()
  @IsOptional()
  timestamp?: string;
}
