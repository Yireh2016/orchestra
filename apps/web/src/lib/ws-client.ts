type WorkflowEvent =
  | { type: "workflow.created"; payload: { workflowId: string } }
  | { type: "workflow.transitioned"; payload: { workflowId: string; fromPhase: string; toPhase: string } }
  | { type: "workflow.completed"; payload: { workflowId: string } }
  | { type: "workflow.failed"; payload: { workflowId: string; error: string } }
  | { type: "task.started"; payload: { workflowId: string; taskId: string } }
  | { type: "task.completed"; payload: { workflowId: string; taskId: string } }
  | { type: "task.failed"; payload: { workflowId: string; taskId: string; error: string } }
  | { type: "gate.passed"; payload: { workflowId: string; gateId: string } }
  | { type: "gate.failed"; payload: { workflowId: string; gateId: string; error: string } };

type EventType = WorkflowEvent["type"];

type EventHandler<T extends EventType> = (
  event: Extract<WorkflowEvent, { type: T }>
) => void;

interface Subscription {
  unsubscribe: () => void;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";

export class OrchestraWSClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<EventHandler<EventType>>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private subscriptions = new Set<string>();

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      // Re-subscribe to previously subscribed workflows
      for (const workflowId of this.subscriptions) {
        this.sendSubscribe(workflowId);
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WorkflowEvent;
        this.dispatch(data);
      } catch {
        console.error("Failed to parse WebSocket message:", event.data);
      }
    };

    this.ws.onclose = () => {
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.subscriptions.clear();
    this.handlers.clear();
  }

  subscribeToWorkflow(workflowId: string): void {
    this.subscriptions.add(workflowId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(workflowId);
    }
  }

  unsubscribeFromWorkflow(workflowId: string): void {
    this.subscriptions.delete(workflowId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: "unsubscribe", workflowId }));
    }
  }

  on<T extends EventType>(eventType: T, handler: EventHandler<T>): Subscription {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    const handlerSet = this.handlers.get(eventType)!;
    handlerSet.add(handler as unknown as EventHandler<EventType>);

    return {
      unsubscribe: () => {
        handlerSet.delete(handler as unknown as EventHandler<EventType>);
        if (handlerSet.size === 0) {
          this.handlers.delete(eventType);
        }
      },
    };
  }

  private dispatch(event: WorkflowEvent): void {
    const handlerSet = this.handlers.get(event.type);
    if (handlerSet) {
      for (const handler of handlerSet) {
        try {
          handler(event as Extract<WorkflowEvent, { type: EventType }>);
        } catch (err) {
          console.error(`Error in handler for ${event.type}:`, err);
        }
      }
    }
  }

  private sendSubscribe(workflowId: string): void {
    this.ws?.send(JSON.stringify({ action: "subscribe", workflowId }));
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnect attempts reached");
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

// Singleton instance
let wsClient: OrchestraWSClient | null = null;

export function getWSClient(): OrchestraWSClient {
  if (!wsClient) {
    wsClient = new OrchestraWSClient();
  }
  return wsClient;
}
