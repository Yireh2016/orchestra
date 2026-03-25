'use client';
import { io, Socket } from 'socket.io-client';

type EventHandler = (event: OrchestraEvent) => void;

interface OrchestraEvent {
  type: string;
  workflowRunId?: string;
  taskId?: string;
  agentId?: string;
  payload?: Record<string, any>;
}

class OrchestraWSClient {
  private socket: Socket | null = null;
  private handlers = new Map<string, Set<EventHandler>>();
  private globalHandlers = new Set<EventHandler>();

  connect() {
    if (this.socket?.connected) return;
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    this.socket = io(`${url}/events`, { transports: ['websocket', 'polling'] });

    this.socket.on('connect', () => console.log('[WS] Connected'));
    this.socket.on('disconnect', () => console.log('[WS] Disconnected'));
    this.socket.on('event', (event: OrchestraEvent) => {
      this.dispatch(event);
    });
  }

  disconnect() { this.socket?.disconnect(); }

  get connected() { return this.socket?.connected ?? false; }

  subscribeWorkflow(workflowId: string) {
    this.socket?.emit('subscribe', { workflowId });
  }

  unsubscribeWorkflow(workflowId: string) {
    this.socket?.emit('unsubscribe', { workflowId });
  }

  // Subscribe to specific event types
  on(eventType: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) this.handlers.set(eventType, new Set());
    this.handlers.get(eventType)!.add(handler);
    return () => this.handlers.get(eventType)?.delete(handler);
  }

  // Subscribe to ALL events
  onAny(handler: EventHandler): () => void {
    this.globalHandlers.add(handler);
    return () => this.globalHandlers.delete(handler);
  }

  private dispatch(event: OrchestraEvent) {
    this.globalHandlers.forEach(h => h(event));
    this.handlers.get(event.type)?.forEach(h => h(event));
  }
}

let instance: OrchestraWSClient | null = null;
export function getWSClient(): OrchestraWSClient {
  if (!instance) { instance = new OrchestraWSClient(); instance.connect(); }
  return instance;
}

export type { OrchestraEvent, EventHandler };
