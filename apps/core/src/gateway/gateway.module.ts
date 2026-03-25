import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { EventRouterService } from './event-router.service';
import { WebhookAuthGuard } from './webhook-auth.guard';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [WorkflowModule],
  controllers: [WebhookController],
  providers: [EventRouterService, WebhookAuthGuard],
  exports: [EventRouterService],
})
export class WebhookGatewayModule {}
