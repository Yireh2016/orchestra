import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventBusService } from './event-bus.service';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/events' })
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly eventBus: EventBusService) {}

  afterInit() {
    this.eventBus.registerGateway(this);
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Client subscribes to a specific workflow run's events.
   * Joins a socket.io room keyed by workflowId.
   */
  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, data: { workflowId: string }) {
    client.join(`workflow:${data.workflowId}`);
    return { subscribed: data.workflowId };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(client: Socket, data: { workflowId: string }) {
    client.leave(`workflow:${data.workflowId}`);
  }

  /**
   * Broadcast an event to all connected clients and, if the event
   * carries a workflowRunId, to that workflow's room as well.
   */
  broadcast(event: any) {
    this.server.emit('event', event); // all clients
    if (event.workflowRunId) {
      this.server
        .to(`workflow:${event.workflowRunId}`)
        .emit('workflow-event', event);
    }
  }
}
