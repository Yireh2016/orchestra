import { Module } from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { IntegrationController } from './integration.controller';
import { CryptoService } from './crypto.service';

@Module({
  controllers: [IntegrationController],
  providers: [IntegrationService, CryptoService],
  exports: [IntegrationService, CryptoService],
})
export class IntegrationsModule {}
