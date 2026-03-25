import { Injectable, Logger } from '@nestjs/common';

// Forward reference to avoid circular dependency at import time
import type { EventsGateway } from './events.gateway';

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  private gateway?: EventsGateway;

  /**
   * Called by EventsGateway on init to register itself so the bus
   * can broadcast events over WebSocket.
   */
  registerGateway(gateway: EventsGateway) {
    this.gateway = gateway;
  }

  /**
   * Emit an event to all connected WebSocket clients.
   * Services throughout the application inject EventBusService to publish
   * real-time updates (workflow transitions, task progress, agent lifecycle).
   */
  emit(event: {
    type: string;
    workflowRunId?: string;
    taskId?: string;
    agentId?: string;
    payload: Record<string, any>;
  }) {
    this.logger.debug(`Event: ${event.type}`);
    if (this.gateway) {
      this.gateway.broadcast(event);
    }
  }
}
