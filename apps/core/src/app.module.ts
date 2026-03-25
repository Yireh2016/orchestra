import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './common/config/configuration';
import { DatabaseModule } from './common/database/database.module';
import { WorkflowModule } from './workflow/workflow.module';
import { PhasesModule } from './phases/phases.module';
import { WebhookGatewayModule } from './gateway/gateway.module';
import { AdaptersModule } from './adapters/adapters.module';
import { AgentRuntimeModule } from './agent-runtime/agent-runtime.module';
import { PluginsModule } from './plugins/plugins.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    AdaptersModule.forRoot(),
    WorkflowModule,
    PhasesModule,
    WebhookGatewayModule,
    AgentRuntimeModule,
    PluginsModule,
    AuthModule,
  ],
})
export class AppModule {}
