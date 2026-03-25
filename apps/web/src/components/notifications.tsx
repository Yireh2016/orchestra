'use client';
import { useEffect, useState, useCallback } from 'react';
import { getWSClient, OrchestraEvent } from '@/lib/ws-client';

interface Toast {
  id: string;
  message: string;
  color: 'green' | 'blue' | 'red' | 'amber';
  timestamp: number;
}

function eventToMessage(event: OrchestraEvent): string {
  const id = event.workflowRunId
    ? event.workflowRunId.slice(0, 8)
    : event.taskId
      ? event.taskId.slice(0, 8)
      : event.agentId
        ? event.agentId.slice(0, 8)
        : '';

  switch (event.type) {
    case 'workflow.started':
      return `Workflow ${id} started`;
    case 'workflow.paused':
      return `Workflow ${id} paused`;
    case 'workflow.resumed':
      return `Workflow ${id} resumed`;
    case 'workflow.completed':
      return `Workflow ${id} completed`;
    case 'phase.started':
      return `Phase started${id ? ` in ${id}` : ''}`;
    case 'phase.completed':
      return `Phase completed${id ? ` in ${id}` : ''}`;
    case 'task.queued':
      return `Task queued${event.taskId ? ` (${event.taskId.slice(0, 8)})` : ''}`;
    case 'task.started':
      return `Task started${event.taskId ? ` (${event.taskId.slice(0, 8)})` : ''}`;
    case 'task.completed':
      return `Task completed${event.taskId ? ` (${event.taskId.slice(0, 8)})` : ''}`;
    case 'task.failed':
      return `Task failed${event.taskId ? ` (${event.taskId.slice(0, 8)})` : ''}`;
    case 'gate.passed':
      return `Gate passed${id ? ` in ${id}` : ''}`;
    case 'gate.failed':
      return `Gate failed${id ? ` in ${id}` : ''}`;
    case 'agent.spawned':
      return `Agent spawned${event.agentId ? ` (${event.agentId.slice(0, 8)})` : ''}`;
    case 'agent.completed':
      return `Agent completed${event.agentId ? ` (${event.agentId.slice(0, 8)})` : ''}`;
    case 'agent.stopped':
      return `Agent stopped${event.agentId ? ` (${event.agentId.slice(0, 8)})` : ''}`;
    default:
      return `Event: ${event.type}`;
  }
}

function eventToColor(event: OrchestraEvent): Toast['color'] {
  const type = event.type;
  if (type.includes('completed') || type.includes('passed')) return 'green';
  if (type.includes('failed') || type.includes('stopped')) return 'red';
  if (type.includes('paused') || type.includes('queued')) return 'amber';
  return 'blue';
}

const colorClasses: Record<Toast['color'], string> = {
  green: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  blue: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  red: 'border-red-500/40 bg-red-500/10 text-red-300',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
};

export function Notifications() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const client = getWSClient();

    const unsub = client.onAny((event) => {
      const toast: Toast = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        message: eventToMessage(event),
        color: eventToColor(event),
        timestamp: Date.now(),
      };

      setToasts((prev) => [...prev.slice(-4), toast]);

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 5000);
    });

    return () => unsub();
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-right-5 ${colorClasses[toast.color]}`}
        >
          <p className="flex-1 text-sm font-medium">{toast.message}</p>
          <button
            onClick={() => dismiss(toast.id)}
            className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
