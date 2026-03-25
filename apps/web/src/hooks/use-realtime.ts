'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { getWSClient, OrchestraEvent } from '@/lib/ws-client';

export function useRealtimeEvents(eventTypes?: string[]) {
  const [events, setEvents] = useState<OrchestraEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const client = getWSClient();
    setConnected(client.connected);

    // Poll connection status
    intervalRef.current = setInterval(() => {
      setConnected(client.connected);
    }, 1000);

    const unsubscribers: (() => void)[] = [];

    if (eventTypes && eventTypes.length > 0) {
      for (const type of eventTypes) {
        const unsub = client.on(type, (event) => {
          setEvents((prev) => [...prev.slice(-99), event]);
        });
        unsubscribers.push(unsub);
      }
    } else {
      const unsub = client.onAny((event) => {
        setEvents((prev) => [...prev.slice(-99), event]);
      });
      unsubscribers.push(unsub);
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(eventTypes)]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { events, connected, clearEvents };
}

export function useWorkflowEvents(workflowId: string) {
  const [events, setEvents] = useState<OrchestraEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!workflowId) return;

    const client = getWSClient();
    setConnected(client.connected);

    intervalRef.current = setInterval(() => {
      setConnected(client.connected);
    }, 1000);

    client.subscribeWorkflow(workflowId);

    const unsub = client.onAny((event) => {
      if (event.workflowRunId === workflowId) {
        setEvents((prev) => [...prev.slice(-99), event]);
      }
    });

    return () => {
      unsub();
      client.unsubscribeWorkflow(workflowId);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [workflowId]);

  return { events, connected };
}
