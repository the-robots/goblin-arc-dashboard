'use client';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

type Pod = {
  metadata: { name: string; namespace: string };
  status?: { phase: string };
};

type PodEvent = {
  type: string;
  pod: Pod;
};

// Resolve backend once, so both REST and socket use the same host:port
const BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BACKEND_URL) ||
  'http://192.168.1.229:3000';

export default function Dashboard() {
  const [pods, setPods] = useState<Pod[]>([]);
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;

    // 1) Fetch initial list over REST (defensive)
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/pods`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const items: Pod[] = Array.isArray(data?.items) ? data.items : [];
        if (mounted) {
          setPods(items);
          setEvents((prev) => [
            `📦 Initial pod list loaded (REST): ${items.length} pods.`,
            ...prev,
          ]);
        }
      } catch (e: any) {
        if (mounted) {
          setEvents((prev) => [
            `❌ Failed REST /api/pods: ${e?.message ?? e}`,
            ...prev,
          ]);
        }
      }
    })();

    // 2) Connect to backend WebSocket for live updates
    const socket = io(BASE, {
      transports: ['websocket', 'polling'],
      withCredentials: false,
    });

    // Optional: if backend also emits an initial list, accept it
    socket.on('pods:init', (items: Pod[]) => {
      if (!mounted) return;
      setPods(items);
      setEvents((prev) => [
        `📦 Initial pod list loaded (socket): ${items.length} pods.`,
        ...prev,
      ]);
    });

    socket.on('pods:update', ({ type, pod }: PodEvent) => {
      if (!mounted || !pod?.metadata?.name) return;
      const name = pod.metadata.name;

      setPods((prev) => {
        if (type === 'ADDED') return [...prev, pod];
        if (type === 'DELETED') return prev.filter((p) => p.metadata.name !== name);
        if (type === 'MODIFIED') return prev.map((p) => (p.metadata.name === name ? pod : p));
        return prev;
      });

      const icon =
        type === 'ADDED' ? '🟢' :
        type === 'DELETED' ? '🔴' :
        type === 'MODIFIED' ? '🟡' : '⚪️';

      setEvents((prev) => [
        `${icon} ${type} → ${name} (${pod.metadata.namespace})`,
        ...prev.slice(0, 49),
      ]);
    });

    socket.on('connect_error', (err) => {
      if (!mounted) return;
      setEvents((prev) => [`❌ Socket connect error: ${err.message}`, ...prev]);
    });

    socket.on('reconnect_attempt', () => {
      if (!mounted) return;
      setEvents((prev) => ['♻️ Reconnecting Kubernetes watch...', ...prev]);
    });

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, []);

  return (
    <main className="p-6 min-h-screen bg-gray-50">
      <h1 className="text-3xl font-bold mb-6">
        🧩 Goblin mode - K3s Pod Dashboard
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Pod List */}
        <div className="lg:col-span-3">
          {pods.length === 0 ? (
            <p className="text-gray-600">Loading pods...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pods.map((pod) => (
                <div
                  key={pod.metadata.name}
                  className="p-4 border rounded-xl shadow-sm bg-white hover:shadow-md transition"
                >
                  <h2 className="font-semibold text-lg break-all">
                    {pod.metadata.name}
                  </h2>
                  <p className="text-sm text-gray-500">
                    Namespace: {pod.metadata.namespace}
                  </p>
                  <p className="mt-2 text-sm">
                    Status{' '}
                    <span
                      className={
                        pod.status?.phase === 'Running'
                          ? 'text-green-600 font-semibold'
                          : pod.status?.phase === 'Pending'
                          ? 'text-yellow-600 font-semibold'
                          : 'text-red-600 font-semibold'
                      }
                    >
                      {pod.status?.phase ?? 'Unknown'}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Event Log */}
        <div className="lg:col-span-1">
          <h2 className="text-xl font-semibold mb-2">📜 Event Log</h2>
          <div className="border rounded-xl bg-white p-3 h-[70vh] overflow-y-auto shadow-sm">
            {events.length === 0 ? (
              <p className="text-gray-500 text-sm">No events yet...</p>
            ) : (
              <ul className="space-y-1 text-sm font-mono">
                {events.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Backend: <code>{BASE}</code>
          </p>
        </div>
      </div>
    </main>
  );
}

