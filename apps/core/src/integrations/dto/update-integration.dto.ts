import { IsString, IsObject, IsOptional } from 'class-validator';

export class UpdateIntegrationDto {
  @IsOptional()
  @IsString()
  adapterName?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
