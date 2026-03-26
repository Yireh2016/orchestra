import { Module, forwardRef } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { EventRouterService } from './event-router.service';
import { WebhookAuthGuard } from './webhook-auth.guard';
import { PollingService } from './polling.service';
import { PollingController } from './polling.controller';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [forwardRef(() => WorkflowModule)],
  controllers: [WebhookController, PollingController],
  providers: [EventRouterService, WebhookAuthGuard, PollingService],
  exports: [EventRouterService],
})
export class WebhookGatewayModule {}
