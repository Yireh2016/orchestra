import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { EventRouterService } from './event-router.service';
import { WebhookAuthGuard } from './webhook-auth.guard';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly eventRouter: EventRouterService) {}

  @Post(':provider')
  @UseGuards(WebhookAuthGuard)
  @HttpCode(200)
  async handleWebhook(
    @Param('provider') provider: string,
    @Body() payload: Record<string, unknown>,
  ) {
    this.logger.log(`Received webhook from ${provider}`);

    const ticketId = this.eventRouter.extractTicketId(provider, payload);
    const prUrl = this.eventRouter.extractPrUrl(provider, payload);

    const eventType = this.resolveEventType(provider, payload);

    await this.eventRouter.route({
      provider,
      eventType,
      payload,
      ticketId,
      prUrl,
    });

    return { received: true };
  }

  private resolveEventType(
    provider: string,
    payload: Record<string, unknown>,
  ): string {
    switch (provider) {
      case 'github':
        return (payload.action as string) ?? 'unknown';
      case 'jira':
        return (payload.webhookEvent as string) ?? 'unknown';
      case 'slack':
        return (payload.type as string) ?? 'unknown';
      default:
        return 'unknown';
    }
  }
}
