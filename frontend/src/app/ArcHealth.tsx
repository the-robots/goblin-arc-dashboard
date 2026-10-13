'use client';
import { useEffect, useState } from 'react';

type Named = { name: string; namespace: string };
type ArcSnapshot = {
  checkedAt: string;
  status: 'healthy' | 'attention' | 'unknown' | 'not-installed';
  generations: string[];
  controllers: (Named & { desired: number; available: number; updated: number; healthy: boolean })[];
  capacity: (Named & { kind: string; desired: number | null; ready: number | null; available: number | null })[];
  runners: (Named & { kind: string; phase: string; ready: boolean | null })[];
  autoscalers: (Named & { minimum: number | null; maximum: number | null; desired: number | null })[];
  unhealthyPods: (Named & { phase: string; reasons: string[] })[];
  warnings: (Named & { target: string; reason: string; message: string; time: string; count: number })[];
  issues: string[];
  errors: string[];
  scope: string;
  limitation?: string;
};

export default function ArcHealth({ base }: { base: string }) {
  const [snapshot, setSnapshot] = useState<ArcSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch(`${base}/api/arc`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: ArcSnapshot = await response.json();
        if (!data.checkedAt || !Array.isArray(data.controllers)) throw new Error('Invalid ARC health response');
        if (!controller.signal.aborted) {
          setSnapshot(data);
          setError(null);
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(`ARC health unavailable: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 30000);
      }
    }
    refresh();
    const aging = setInterval(() => setClock(Date.now()), 10000);
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearInterval(aging);
    };
  }, [base]);
  const stale = !!snapshot && clock - Date.parse(snapshot.checkedAt) > 90000;
  const state = error || stale ? 'unknown' : snapshot?.status;
  const label = !snapshot && !error ? 'Checking ARC...' : state === 'healthy' ? 'Kubernetes-side checks passing'
    : state === 'attention' ? 'Needs attention' : state === 'not-installed' ? 'ARC not detected' : 'Health unverified';
  const badge = state === 'healthy' ? 'text-emerald-300 border-emerald-800' : 'text-amber-300 border-amber-800';
  return <section aria-label="ARC health" className="mb-8 rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs uppercase tracking-widest text-emerald-400">GitHub Actions Runner Controller</p>
        <h2 className="mt-1 text-xl font-semibold">ARC health</h2></div>
      <span className={`text-sm rounded-full border px-3 py-1 ${badge}`}>{label}</span>
    </div>
    <p className="mt-3 text-xs text-slate-400">{snapshot?.scope || 'Kubernetes-side checks only. GitHub registration, online/busy status and job execution are unverified.'}</p>
    {error && <p role="alert" className="mt-3 text-amber-300 text-sm">{error}</p>}
    {stale && <p className="mt-3 text-amber-300 text-sm">Last health check is stale. Do not treat this as current health.</p>}
    {snapshot && <>
      <p className="mt-2 text-xs text-slate-500">{snapshot.generations.join(' + ') || 'No ARC CRDs found'} · Checked: {snapshot.checkedAt} · Refreshes every 30 seconds</p>
      {snapshot.limitation && <p className="mt-2 text-xs text-amber-300">{snapshot.limitation}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-3 text-sm">
        <p><strong className="text-slate-100">{snapshot.controllers.filter((c) => c.healthy).length}/{snapshot.controllers.length}</strong> <span className="text-slate-400">controllers available</span></p>
        <p><strong className="text-slate-100">{snapshot.runners.filter((r) => r.ready).length}/{snapshot.runners.length}</strong> <span className="text-slate-400">runners reporting ready</span></p>
        <p><strong className="text-slate-100">{snapshot.warnings.length}</strong> <span className="text-slate-400">recent warnings (last hour, up to 20)</span></p>
      </div>
      {snapshot.errors.length > 0 && <ul className="mt-3 text-sm text-amber-300">{snapshot.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {snapshot.issues.length > 0 && <ul className="mt-3 text-sm text-amber-300">{snapshot.issues.map((e) => <li key={e}>{e}</li>)}</ul>}
      <details className="mt-4 border-t border-slate-800 pt-3">
        <summary className="cursor-pointer text-sm text-slate-300">Inspect controllers, runner capacity &amp; events</summary>
        <div className="mt-3 space-y-4 text-xs text-slate-400 break-words [overflow-wrap:anywhere]">
          <div><h3 className="font-semibold text-slate-200 mb-2">Controllers</h3>
            {snapshot.controllers.map((c) => <p key={`${c.namespace}/${c.name}`}>{c.namespace}/{c.name}: {c.available}/{c.desired} available, {c.updated} updated · {c.healthy ? 'Available' : 'Not fully available'}</p>)}
            {!snapshot.controllers.length && <p>None detected. Discovery is based on ARC deployment names and labels.</p>}</div>
          <div><h3 className="font-semibold text-slate-200 mb-2">Runner capacity</h3>
            {snapshot.capacity.map((c) => <p key={`${c.kind}/${c.namespace}/${c.name}`}>{c.namespace}/{c.name} ({c.kind}): desired {c.desired ?? 'unknown'}, {c.kind === 'RunnerDeployment' ? 'ready' : 'reported current'} {c.ready ?? 'unknown'}, available {c.available ?? 'unknown'}</p>)}
            {!snapshot.capacity.length && <p>No runner capacity resources reported.</p>}</div>
          <div><h3 className="font-semibold text-slate-200 mb-2">Runners</h3>
            {snapshot.runners.map((r) => <p key={`${r.kind}/${r.namespace}/${r.name}`}>{r.namespace}/{r.name}: {r.phase}, ready {r.ready === null ? 'unknown' : r.ready ? 'yes' : 'no'}</p>)}
            {!snapshot.runners.length && <p>No runners reported. Zero runners can be intentional when scaled to zero.</p>}</div>
          {snapshot.autoscalers.length > 0 && <div><h3 className="font-semibold text-slate-200 mb-2">Autoscalers</h3>
            {snapshot.autoscalers.map((a) => <p key={`${a.namespace}/${a.name}`}>{a.namespace}/{a.name}: min {a.minimum ?? 'unknown'}, max {a.maximum ?? 'unknown'}, desired {a.desired ?? 'unknown'}</p>)}</div>}
          {snapshot.unhealthyPods.length > 0 && <div><h3 className="font-semibold text-slate-200 mb-2">Pods needing attention</h3>
            {snapshot.unhealthyPods.map((p) => <p key={`${p.namespace}/${p.name}`}>{p.namespace}/{p.name}: {p.phase} {p.reasons.join(', ')}</p>)}</div>}
          <div><h3 className="font-semibold text-slate-200 mb-2">Recent warning events</h3>
            {snapshot.warnings.map((w) => <p className="mb-2 whitespace-pre-wrap max-h-40 overflow-y-auto" key={`${w.namespace}/${w.name}`}>{w.time} · {w.namespace}/{w.target} · {w.reason} (×{w.count}): {w.message}</p>)}
            {!snapshot.warnings.length && <p>No matching warning events in the last hour. This does not prove job execution is healthy.</p>}</div>
        </div>
      </details>
    </>}
  </section>;
}
