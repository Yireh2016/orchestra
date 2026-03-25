import { IsString, IsObject, IsEnum } from 'class-validator';

export class CreateIntegrationDto {
  @IsEnum(['PM', 'CODE_HOST', 'CHANNEL', 'CODING_AGENT'])
  type!: 'PM' | 'CODE_HOST' | 'CHANNEL' | 'CODING_AGENT';

  @IsString()
  adapterName!: string;

  @IsObject()
  config!: Record<string, any>;

  @IsString()
  teamId!: string;
}
