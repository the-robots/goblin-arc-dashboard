'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { io } from 'socket.io-client';
import ArcHealth from './ArcHealth';

type Termination = { exitCode?: number; reason?: string; message?: string; signal?: number; startedAt?: string; finishedAt?: string };
type ContainerSpec = {
  name: string;
  image?: string;
  ports?: { name?: string; containerPort: number; protocol?: string }[];
  resources?: { requests?: Record<string, string>; limits?: Record<string, string> };
};
type Container = {
  name?: string;
  ready: boolean;
  restartCount: number;
  image?: string;
  started?: boolean;
  state?: { waiting?: { reason?: string; message?: string }; running?: { startedAt?: string }; terminated?: Termination };
  lastState?: { terminated?: Termination };
};
type Pod = {
  metadata: { name: string; namespace: string; deletionTimestamp?: string };
  spec?: { nodeName?: string; containers?: ContainerSpec[]; initContainers?: ContainerSpec[] };
  status?: {
    phase?: string;
    containerStatuses?: Container[];
    initContainerStatuses?: Container[];
    conditions?: { type: string; status: string }[];
  };
};
type PodEvent = { type: string; pod: Pod };
const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
const podKey = (pod: Pod) => `${pod.metadata.namespace}/${pod.metadata.name}`;
function applyUpdate(pods: Pod[], { type, pod }: PodEvent): Pod[] {
  const key = podKey(pod);
  if (type === 'DELETED') return pods.filter((p) => podKey(p) !== key);
  return pods.some((p) => podKey(p) === key)
    ? pods.map((p) => podKey(p) === key ? pod : p) : [...pods, pod];
}
function podPhase(pod: Pod) {
  return pod.status?.containerStatuses?.find((c) => c.state?.waiting?.reason)?.state?.waiting?.reason
    || pod.status?.phase || 'Unknown';
}
function statusClass(phase: string) {
  return phase === 'Running' ? 'text-green-600' : phase === 'Pending' || phase === 'ContainerCreating'
    ? 'text-yellow-600' : phase === 'Succeeded' ? 'text-slate-500' : 'text-red-600';
}

type Mood = 'grinning' | 'waiting' | 'sleepy' | 'worried' | 'unknown';
const legend: { mood: Mood; label: string; description: string }[] = [
  { mood: 'grinning', label: 'Grinning', description: 'Green / teal / lime, toothy grin, relaxed blinking: all containers ready.' },
  { mood: 'waiting', label: 'Waiting', description: 'Amber, flat mouth, glancing around: pending, unready, or restarted within 10 minutes.' },
  { mood: 'worried', label: 'Worried', description: 'Pink, frown, fidgeting and sweating: pod or container failure, including init containers.' },
  { mood: 'sleepy', label: 'Sleepy', description: 'Gray, closed eyes, snoozing: completed or terminating.' },
  { mood: 'unknown', label: 'Keeping watch', description: 'Gray, open eyes slowly scanning: missing health; chief also uses this when offline.' },
];

function ContainerDetails({ pod }: { pod: Pod }) {
  const groups = [
    { label: 'Init container', specs: pod.spec?.initContainers || [], statuses: pod.status?.initContainerStatuses || [] },
    { label: 'Container', specs: pod.spec?.containers || [], statuses: pod.status?.containerStatuses || [] },
  ];
  const entries = groups.flatMap(({ label, specs, statuses }) => {
    const configured = specs.map((spec) => ({ label, spec, status: statuses.find((c) => c.name === spec.name) }));
    return [...configured, ...statuses.filter((c) => !specs.some((s) => s.name === c.name))
      .map((status) => ({ label, spec: undefined, status }))];
  });
  if (!entries.length) return <p className="mt-3 text-xs text-slate-400">No container details reported yet.</p>;
  return <div className="mt-3 space-y-2">
    {entries.map(({ label, spec, status }, i) => {
      const state = status?.state;
      const terminated = state?.terminated;
      const previous = status?.lastState?.terminated;
      const current = state?.waiting ? `Waiting: ${state.waiting.reason || 'Unknown reason'}`
        : terminated ? `Terminated: ${terminated.reason || 'Unknown reason'}`
        : state?.running ? 'Running' : 'State not reported';
      const resourceText = (resources?: Record<string, string>) => resources && Object.keys(resources).length
        ? Object.entries(resources).map(([key, value]) => `${key}: ${value}`).join(', ') : 'Not specified';
      return <details key={`${label}-${spec?.name || status?.name || i}`} className="rounded-lg border border-slate-800 p-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-200 break-all focus-visible:outline-emerald-400">
          {label}: {spec?.name || status?.name || `#${i + 1}`} · {status ? status.ready ? 'Ready' : 'Not ready' : 'Status unavailable'} · {status?.restartCount ?? '--'} restarts
        </summary>
        <dl className="mt-3 space-y-2 text-xs text-slate-400 break-words [overflow-wrap:anywhere]">
          <div><dt className="text-slate-300">Image</dt><dd>{status?.image || spec?.image || 'Not reported'}</dd></div>
          <div><dt className="text-slate-300">Current state</dt><dd>{current}</dd></div>
          {(state?.waiting?.message || terminated?.message) && <div><dt className="text-slate-300">State message</dt><dd className="whitespace-pre-wrap max-h-40 overflow-y-auto">{state?.waiting?.message || terminated?.message}</dd></div>}
          {status?.started !== undefined && <div><dt className="text-slate-300">Started</dt><dd>{status.started ? 'Yes' : 'No'}</dd></div>}
          {(state?.running?.startedAt || terminated?.startedAt) && <div><dt className="text-slate-300">Started at</dt><dd>{state?.running?.startedAt || terminated?.startedAt}</dd></div>}
          {terminated && <div><dt className="text-slate-300">Current exit</dt><dd>Code: {terminated.exitCode ?? 'Not reported'} · Signal: {terminated.signal ?? 'Not reported'}{terminated.finishedAt && ` · Finished: ${terminated.finishedAt}`}</dd></div>}
          {previous && <div><dt className="text-slate-300">Previous exit</dt><dd>{previous.reason || 'Reason not reported'} · Code: {previous.exitCode ?? 'Not reported'} · Signal: {previous.signal ?? 'Not reported'}{previous.startedAt && ` · Started: ${previous.startedAt}`}{previous.finishedAt && ` · Finished: ${previous.finishedAt}`}</dd>
            {previous.message && <dd className="whitespace-pre-wrap max-h-40 overflow-y-auto">{previous.message}</dd>}</div>}
          <div><dt className="text-slate-300">Declared ports</dt><dd>{spec?.ports?.length ? spec.ports.map((p) => `${p.name ? `${p.name}: ` : ''}${p.containerPort}/${p.protocol || 'TCP'}`).join(', ') : 'None reported'}</dd></div>
          <div><dt className="text-slate-300">Resource requests</dt><dd>{resourceText(spec?.resources?.requests)}</dd></div>
          <div><dt className="text-slate-300">Resource limits</dt><dd>{resourceText(spec?.resources?.limits)}</dd></div>
        </dl>
      </details>;
    })}
    <p className="text-xs text-slate-500">Resources are configured requests/limits, not live usage. Times are as reported by Kubernetes.</p>
  </div>;
}

function podHealth(pod: Pod, now: number): { mood: Mood; message: string } {
  if (pod.metadata.deletionTimestamp) return { mood: 'sleepy', message: 'Packing my bags. This pod is terminating.' };
  if (pod.status?.phase === 'Succeeded') return { mood: 'sleepy', message: 'Job done. Time for a goblin nap.' };
  const containers = pod.status?.containerStatuses || [];
  const all = [...(pod.status?.initContainerStatuses || []), ...containers];
  const broken = all.find((c) => (c.state?.waiting?.reason && !['ContainerCreating', 'PodInitializing'].includes(c.state.waiting.reason))
    || (c.state?.terminated?.exitCode !== undefined && c.state.terminated.exitCode !== 0));
  if (broken || pod.status?.phase === 'Failed') return { mood: 'worried',
    message: `Something's wrong: ${broken?.state?.waiting?.reason || broken?.state?.terminated?.reason || 'Pod failed'}.` };
  if (pod.status?.phase === 'Pending') return { mood: 'waiting', message: 'Still getting my boots on. Pod is pending.' };
  const expected = pod.spec?.containers?.length || containers.length;
  if (!containers.length || containers.length < expected) return { mood: 'unknown', message: 'No complete container health report yet. Keeping watch.' };
  if (containers.some((c) => !c.ready) || pod.status?.conditions?.some((c) => c.type === 'Ready' && c.status !== 'True')) {
    return { mood: 'waiting', message: 'Not all containers are ready. Holding the fort.' };
  }
  const recent = containers.some((c) => {
    const finished = Date.parse(c.lastState?.terminated?.finishedAt || '');
    return c.restartCount > 0 && now >= finished && now - finished < 10 * 60 * 1000;
  });
  if (recent) return { mood: 'waiting', message: 'Back on my feet, but a container restarted in the last 10 minutes.' };
  if (pod.status?.phase !== 'Running') return { mood: 'unknown', message: 'Pod health is unknown. Keeping watch.' };
  return { mood: 'grinning', message: 'All containers ready. Nothing to bonk.' };
}

function Goblin({ mood = 'grinning', identity = 'chief', className = '' }: { mood?: Mood; identity?: string; className?: string }) {
  const waiting = mood === 'waiting';
  const sleeping = mood === 'sleepy';
  const unknown = mood === 'unknown';
  const trouble = mood === 'worried';
  const seed = Array.from(identity).reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
  const skin = trouble ? '#fb7185' : waiting ? '#fbbf24' : sleeping || unknown ? '#94a3b8' : ['#4ade80', '#2dd4bf', '#a3e635'][seed % 3];
  const hair = [
    'm35 30 9-15 10 12 11-17 8 18 12-5-2 12',
    'M35 32q0-20 14-13l11-12 10 16q18-7 15 12',
    'M35 32 44 22 51 28 60 14 69 28 77 22 85 35',
    'M35 32q25-28 50 3l-20-5-5 8-6-10Z',
  ];
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={`${mood} pod goblin`} className={`goblin goblin-${mood} ${className}`}
      style={{ '--goblin-delay': `-${(seed % 40) / 10}s` } as CSSProperties}>
      <ellipse cx="60" cy="108" rx="38" ry="6" fill="#020617" opacity=".6" />
      <g className="goblin-body">
      <path d="M25 46 5 24 9 65 32 72M95 46 115 24 111 65 88 72" fill={skin} stroke="#14532d" strokeWidth="3" strokeLinejoin="round" />
      <path d="m12 37 5 23 13 4m78-27-5 23-13 4" fill="none" stroke="#14532d" strokeWidth="3" opacity=".5" />
      <path d="M29 97q31-22 62 0l6 12H23Z" fill={['#6d28d9', '#0369a1', '#b45309'][seed % 3]} stroke="#2e1065" strokeWidth="3" />
      <path d="m47 95 13 12 13-12" fill="none" stroke="#c4b5fd" strokeWidth="3" />
      <path d="M26 55q-2-31 34-32 36 1 34 32v20q-3 27-34 28-31-1-34-28Z" fill={skin} stroke="#14532d" strokeWidth="3" />
      <path d={hair[seed % hair.length]} fill="#166534" stroke="#14532d" strokeWidth="3" strokeLinejoin="round" />
      {sleeping ? <path d="m36 60 14 3m20 0 14-3" stroke="#052e16" strokeWidth="4" strokeLinecap="round" />
        : <>
          <g className="goblin-eyes">
            <ellipse cx="44" cy="61" rx="10" ry="9" fill="#fef9c3" />
            <ellipse cx="76" cy="61" rx="10" ry="9" fill="#fef9c3" />
            <g className="goblin-pupils">
              <ellipse cx={waiting ? 47 : 46} cy="62" rx="3" ry="5" fill="#052e16" />
              <ellipse cx={waiting ? 79 : 74} cy="62" rx="3" ry="5" fill="#052e16" />
            </g>
          </g>
          <path d={trouble ? 'm34 49 16-5m20 0 16 5' : 'm34 47 16 4m20 0 16-4'} stroke="#14532d" strokeWidth="4" strokeLinecap="round" />
        </>}
      <path d="m60 62-6 13h12" fill="none" stroke="#14532d" strokeWidth="3" strokeLinejoin="round" />
      <path d={trouble ? 'M44 89q16-15 32 0' : waiting || sleeping || unknown ? 'M48 85h24' : 'M40 81q20 25 40 0Z'}
        fill={waiting || sleeping || trouble || unknown ? 'none' : '#052e16'} stroke="#14532d" strokeWidth="3" strokeLinecap="round" />
      {mood === 'grinning' && <path d="m45 84 6 9 3-9m12 0 3 9 6-9" fill="#fef9c3" />}
      <circle cx="33" cy="74" r="4" fill="#14532d" opacity=".2" />
      <circle cx="87" cy="74" r="4" fill="#14532d" opacity=".2" />
      {seed % 2 === 0 ? <circle cx="98" cy="78" r="6" fill="none" stroke="#fbbf24" strokeWidth="3" />
        : <path d="m29 72 7 8m-8-4 8-7" stroke="#14532d" strokeWidth="2" />}
      {trouble && <path className="goblin-sweat" d="M92 44q5 8 0 11-5-3 0-11Z" fill="#7dd3fc" stroke="#0369a1" strokeWidth="1.5" />}
      </g>
      {sleeping && <g className="goblin-zzz" fill="#cbd5e1" fontFamily="sans-serif" fontWeight="700">
        <text x="88" y="34" fontSize="14">z</text>
        <text x="98" y="20" fontSize="18">z</text>
      </g>}
    </svg>
  );
}

export default function Dashboard() {
  const [pods, setPods] = useState<Pod[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [watching, setWatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [namespace, setNamespace] = useState('');
  const [phase, setPhase] = useState('');
  const [selectedGoblin, setSelectedGoblin] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    let socketHasData = false;
    let pendingUpdates: PodEvent[] = [];
    const controller = new AbortController();
    const log = (message: string) => {
      if (mounted) setEvents((prev) => [message, ...prev].slice(0, 50));
    };
    const fail = (message: string) => {
      if (mounted) {
        setError(message);
        log(message);
      }
    };
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/pods`, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data?.items)) throw new Error('Invalid pod list received');
        if (mounted && !socketHasData) {
          setPods(pendingUpdates.reduce(applyUpdate, data.items));
          setLoaded(true);
          setError(null);
          log(`Initial pod list loaded (REST): ${data.items.length} pods.`);
        }
      } catch (err) {
        if (!controller.signal.aborted && !socketHasData) {
          fail(`Failed REST /api/pods: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    })();
    const socket = io(BASE, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      if (mounted) setConnected(true);
    });
    socket.on('disconnect', () => {
      if (mounted) {
        setConnected(false);
        setWatching(false);
        socketHasData = false;
        pendingUpdates = [];
        log('Backend disconnected; displayed pods may be stale.');
      }
    });
    socket.on('cluster:status', (status: { connected: boolean; error: string | null }) => {
      if (!mounted) return;
      setWatching(status.connected);
      setWatchError(status.error);
    });
    socket.on('pods:init', (items: Pod[]) => {
      if (!mounted) return;
      socketHasData = true;
      setPods(pendingUpdates.reduce(applyUpdate, items));
      pendingUpdates = [];
      setLoaded(true);
      setError(null);
      log(`Initial pod list loaded (socket): ${items.length} pods.`);
    });
    socket.on('pods:error', (data: { error: string }) => fail(data.error));
    socket.on('pods:update', ({ type, pod }: PodEvent) => {
      if (!mounted || !pod?.metadata?.name || !['ADDED', 'MODIFIED', 'DELETED'].includes(type)) return;
      const key = podKey(pod);
      if (!socketHasData) pendingUpdates.push({ type, pod });
      setPods((prev) => applyUpdate(prev, { type, pod }));
      log(`${type} -> ${key}`);
    });
    socket.on('connect_error', (err) => {
      if (mounted) setConnected(false);
      log(`Socket connect error: ${err.message}`);
    });
    socket.io.on('reconnect_attempt', () => log('Reconnecting to backend...'));
    return () => {
      mounted = false;
      controller.abort();
      socket.disconnect();
    };
  }, []);

  const namespaces = [...new Set(pods.map((p) => p.metadata.namespace))].sort();
  const phases = [...new Set(pods.map(podPhase))].sort();
  const visible = pods.filter((p) => (!namespace || p.metadata.namespace === namespace)
    && (!phase || podPhase(p) === phase)
    && podKey(p).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => podKey(a).localeCompare(podKey(b)));
  const running = pods.filter((p) => podPhase(p) === 'Running').length;
  const attention = pods.filter((p) => ['waiting', 'worried', 'unknown'].includes(podHealth(p, now).mood)).length;
  const restarts = pods.reduce((sum, p) => sum + (p.status?.containerStatuses || [])
    .reduce((total, c) => total + c.restartCount, 0), 0);

  return (
    <main className="mx-auto max-w-[1600px] p-6 lg:p-10 min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Goblin mood={!connected || !watching || !loaded || error ? 'unknown'
            : pods.some((p) => podHealth(p, now).mood === 'worried') ? 'worried' : attention ? 'waiting' : 'grinning'}
            className="w-24 h-24 shrink-0 drop-shadow-[0_0_18px_#4ade8033]" />
          <div>
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-400 mb-2">Cluster observatory</p>
          <h1 className="text-3xl font-bold tracking-tight">Goblin mode - GitHub ARC Dashboard</h1>
          <p className="text-slate-400 mt-2">Your workloads, live. No noise, no guesswork.</p>
          </div>
        </div>
        <span role="status" className={`rounded-full border px-4 py-2 text-sm ${connected && watching
          ? 'border-emerald-700 text-emerald-300 bg-emerald-950/50' : 'border-amber-700 text-amber-300 bg-amber-950/50'}`}>
          {connected && watching ? 'Live cluster watch' : connected ? 'Cluster watch reconnecting' : 'Backend disconnected'}
        </span>
      </header>
      {(error || watchError) && <div role="alert" className="mb-6 rounded-xl border border-red-800 bg-red-950/50 p-4 text-red-200">{error || watchError}</div>}
      <ArcHealth base={BASE} />
      <section aria-label="Cluster summary" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[['Total pods', pods.length], ['Running pods', running], ['Needs attention', attention], ['Container restarts', restarts]].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <p className="text-sm text-slate-400">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{loaded ? value : '--'}</p>
          </div>
        ))}
      </section>
      <details open className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-300">Goblin key · Colors, expressions &amp; health</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {legend.map((item) => <div key={item.mood} className="flex gap-3 items-center text-xs">
            <span aria-hidden="true" className="h-12 w-12 shrink-0 rounded-lg bg-slate-950/60">
              <Goblin mood={item.mood} identity={`legend-${item.mood}`} className="h-full w-full" />
            </span>
            <p className="text-slate-400"><strong className="text-slate-200">{item.label}</strong> - {item.description}</p>
          </div>)}
        </div>
        <p className="mt-3 text-xs text-slate-400">Click a goblin for its report, then expand a container for details. Bigger goblins need attention; hair and outfits are just personality. Lifetime restart counts alone are not alarms. Offline reports may be stale.</p>
      </details>
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <section aria-label="Pods" className="xl:col-span-3">
          <div className="flex flex-wrap gap-3 mb-5">
            <input aria-label="Search pods" placeholder="Search pod or namespace..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="min-w-48 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none focus:border-emerald-400" />
            <select aria-label="Namespace" value={namespace} onChange={(e) => setNamespace(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
              <option value="">All namespaces</option>{namespaces.map((n) => <option key={n}>{n}</option>)}
            </select>
            <select aria-label="Pod status" value={phase} onChange={(e) => setPhase(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
              <option value="">All statuses</option>{phases.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <p className="text-xs text-slate-400 mb-4">{visible.length} of {pods.length} pods · Tap a goblin for its health report. No cluster changes.</p>
          {!loaded ? <p className="text-slate-400">{error ? 'Unable to load pods.' : 'Loading pods...'}</p>
            : visible.length === 0 ? <p className="text-slate-400">{pods.length ? 'No pods match your filters.' : 'No pods in this cluster.'}</p>
            : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visible.map((pod) => {
                const containers = pod.status?.containerStatuses || [];
                const status = podPhase(pod);
                const health = podHealth(pod, now);
                const selected = selectedGoblin === podKey(pod);
                const reportId = `goblin-${encodeURIComponent(podKey(pod))}`;
                const stale = !connected || !watching;
                return (
                  <article key={podKey(pod)} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 hover:border-slate-600 transition">
                    <button type="button" aria-label={`Ask goblin about ${podKey(pod)}`} aria-expanded={selected} aria-controls={reportId}
                      title={stale ? 'Health may be stale. Click for last known report.' : health.message}
                      onClick={() => setSelectedGoblin(selected ? null : podKey(pod))}
                      className={`goblin-button float-right ml-3 mb-2 rounded-xl border border-transparent hover:border-slate-600 focus-visible:outline-2 focus-visible:outline-emerald-400 ${health.mood === 'grinning' || health.mood === 'sleepy' ? 'w-10 h-10' : 'w-14 h-14'} ${selected ? 'goblin-selected bg-slate-800' : ''}`}>
                      <Goblin mood={health.mood} identity={podKey(pod)} className="w-full h-full" />
                    </button>
                    <p className="text-xs text-slate-400 mb-2">Namespace: {pod.metadata.namespace}</p>
                    <h2 className="font-semibold break-all mb-4">{pod.metadata.name}</h2>
                    <span className={`inline-block rounded-md bg-slate-950 px-2 py-1 text-sm font-semibold ${statusClass(status)}`}>{status}</span>
                    <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div><dt className="text-slate-400">Ready</dt><dd>{containers.filter((c) => c.ready).length}/{containers.length}</dd></div>
                      <div><dt className="text-slate-400">Restarts</dt><dd>{containers.reduce((n, c) => n + c.restartCount, 0)}</dd></div>
                    </dl>
                    <p className="mt-4 text-xs text-slate-500 break-all">Node: {pod.spec?.nodeName || 'Unscheduled'}</p>
                    <div id={reportId} hidden={!selected} className="clear-both mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm">
                      <p className="font-semibold text-slate-200">{health.message}</p>
                      {selected && stale && <p className="text-amber-300 mt-2">Watch offline. This is last known health, not live data.</p>}
                      {selected && <ContainerDetails pod={pod} />}
                      <p className="mt-2 text-xs text-slate-500">Lifetime restart counts are history, not a current alarm.</p>
                    </div>
                  </article>
                );
              })}
            </div>}
        </section>
        <aside>
          <h2 className="font-semibold mb-4">Event Log</h2>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 h-[60vh] overflow-y-auto">
            {events.length === 0 ? <p className="text-slate-400 text-sm">No events yet...</p>
              : <ul className="space-y-3 text-xs font-mono text-slate-300">{events.map((e, i) => <li className="break-all border-b border-slate-800 pb-3" key={i}>{e}</li>)}</ul>}
          </div>
          <p className="mt-3 text-xs text-slate-500 break-all">Backend: <code>{BASE}</code> · Latest 50 events</p>
        </aside>
      </div>
    </main>
  );
}
