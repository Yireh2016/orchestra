import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  UseGuards,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { EventRouterService, InboundEvent } from './event-router.service';
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
    @Headers() headers: Record<string, string>,
    @Body() payload: Record<string, unknown>,
  ) {
    this.logger.log(`Received webhook from ${provider}`);

    const normalizedEvent = this.normalizePayload(provider, headers, payload);

    const result = await this.eventRouter.routeAndGetTarget(normalizedEvent);

    return {
      received: true,
      routed: result !== null,
      workflowRunId: result?.workflowRunId ?? null,
    };
  }

  /**
   * Normalizes different provider payloads into a common InboundEvent format.
   */
  private normalizePayload(
    provider: string,
    headers: Record<string, string>,
    payload: Record<string, unknown>,
  ): InboundEvent {
    const eventType = this.resolveEventType(provider, headers, payload);
    const ticketId = this.eventRouter.extractTicketId(provider, payload);
    const prUrl = this.eventRouter.extractPrUrl(provider, payload);

    return {
      provider,
      eventType,
      payload,
      ticketId,
      prUrl,
    };
  }

  private resolveEventType(
    provider: string,
    headers: Record<string, string>,
    payload: Record<string, unknown>,
  ): string {
    switch (provider) {
      case 'github': {
        // GitHub sends event type in the X-GitHub-Event header
        const ghEvent = headers['x-github-event'] ?? '';
        const action = payload.action as string | undefined;
        return action ? `${ghEvent}.${action}` : ghEvent || 'unknown';
      }
      case 'jira':
        return (payload.webhookEvent as string) ?? 'unknown';
      case 'slack':
        return (payload.type as string) ?? 'unknown';
      default:
        return 'unknown';
    }
  }
}
