import { useState, useEffect } from 'react';
import { wsUrl } from '../utils/wsUrl';

export interface MetricData {
  timestamp: string;
  cpu: number;
  ram: number;
  uptime: string;
  bandwidth: number;
  latency: number;
  nodes: { id: string; status: string; load: number }[];
  events: { time: string; type: string; label: string }[];
}

export function useMetrics() {
  const [metrics, setMetrics] = useState<MetricData | null>(null);
  const [history, setHistory] = useState<MetricData[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(wsUrl());

    ws.onopen = () => {
      setConnected(true);
      console.log('Connected to monitoring server');
    };

    ws.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data);
        // Only accept dashboard-type messages
        if (raw.type && raw.type !== 'dashboard') return;
        const data: MetricData = raw;
        setMetrics(data);
        setHistory((prev) => {
          const next = [...prev, data];
          if (next.length > 30) return next.slice(1);
          return next;
        });
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('Disconnected from monitoring server');
    };

    return () => {
      ws.close();
    };
  }, []);

  return { metrics, history, connected };
}
