const identity = (resource) => ({
  name: resource.metadata?.name,
  namespace: resource.metadata?.namespace,
});
const key = (resource) => `${resource.metadata?.namespace}/${resource.metadata?.name}`;
const isController = (resource) => resource.metadata?.labels?.['app.kubernetes.io/name'] === 'actions-runner-controller'
  || resource.metadata?.labels?.['app.kubernetes.io/name'] === 'gha-runner-scale-set-controller'
  || /^(arc-.*actions-runner-controller|actions-runner-controller|controller-manager)$/.test(resource.metadata?.name || '');

async function getArcHealth({ k8sApi, appsApi, extensionsApi, customApi, now = Date.now() }) {
  const errors = [];
  async function read(label, request) {
    try {
      const response = await request();
      const body = response?.body ?? response;
      const list = typeof body === 'string' ? JSON.parse(body) : body;
      if (!Array.isArray(list?.items)) throw new Error('Invalid Kubernetes list response');
      return list.items;
    } catch (err) {
      console.error(`ARC health: could not read ${label}:`, err.message);
      errors.push(`Could not read ${label}. Check Kubernetes connectivity and RBAC permissions.`);
      return null;
    }
  }
  const [crds, deployments, pods, events] = await Promise.all([
    read('ARC CRDs', () => extensionsApi.listCustomResourceDefinition()),
    read('deployments', () => appsApi.listDeploymentForAllNamespaces()),
    read('pods', () => k8sApi.listPodForAllNamespaces()),
    read('warning events', () => k8sApi.listEventForAllNamespaces({ fieldSelector: 'type=Warning' })),
  ]);
  const definitions = (crds || []).filter((c) => ['actions.summerwind.dev', 'actions.github.com'].includes(c.spec?.group));
  const legacy = definitions.some((c) => c.spec.group === 'actions.summerwind.dev');
  const modern = definitions.some((c) => c.spec.group === 'actions.github.com');
  const resources = {};
  await Promise.all(['runners', 'runnerdeployments', 'horizontalrunnerautoscalers', 'autoscalingrunnersets', 'ephemeralrunners', 'ephemeralrunnersets'].map(async (plural) => {
    const definition = definitions.find((c) => c.spec?.names?.plural === plural);
    if (!definition) return;
    const version = definition.spec.versions.find((v) => v.storage && v.served) || definition.spec.versions.find((v) => v.served);
    if (!version) {
      errors.push(`No served API version for ${plural}.`);
      return;
    }
    resources[plural] = await read(plural, () => customApi.listClusterCustomObject({
      group: definition.spec.group, version: version.name, plural,
    }));
  }));
  const namespaces = new Set(Object.values(resources).flatMap((items) => (items || []).map((r) => r.metadata?.namespace)));
  const controllers = (deployments || []).filter((d) => isController(d)
    && (d.metadata?.name !== 'controller-manager' || namespaces.has(d.metadata?.namespace)
      || d.metadata?.namespace === 'actions-runner-system')).map((d) => {
    const desired = d.spec?.replicas ?? 1;
    const available = d.status?.availableReplicas ?? 0;
    const updated = d.status?.updatedReplicas ?? 0;
    const observed = (d.status?.observedGeneration ?? 0) >= (d.metadata?.generation ?? 0);
    return { ...identity(d), desired, available, updated, healthy: desired > 0 && available >= desired && updated >= desired && observed };
  });
  controllers.forEach((d) => namespaces.add(d.namespace));
  const capacity = [
    ...(resources.runnerdeployments || []).map((r) => ({
      ...identity(r), kind: 'RunnerDeployment',
      desired: r.status?.desiredReplicas ?? r.spec?.replicas ?? null,
      ready: r.status?.readyReplicas ?? 0, available: r.status?.availableReplicas ?? 0,
    })),
    ...(resources.autoscalingrunnersets || []).map((r) => ({
      ...identity(r), kind: 'AutoscalingRunnerSet',
      desired: r.status?.desiredRunners ?? null,
      ready: r.status?.currentRunners ?? null, available: null,
    })),
  ];
  const runners = [
    ...(resources.runners || []).map((r) => ({
      ...identity(r), kind: 'Runner', phase: r.status?.phase || 'Unknown', ready: r.status?.ready ?? null,
    })),
    ...(resources.ephemeralrunners || []).map((r) => ({
      ...identity(r), kind: 'EphemeralRunner', phase: r.status?.phase || 'Unknown', ready: null,
    })),
  ];
  const autoscalers = (resources.horizontalrunnerautoscalers || []).map((r) => ({
    ...identity(r), minimum: r.spec?.minReplicas ?? null, maximum: r.spec?.maxReplicas ?? null,
    desired: r.status?.desiredReplicas ?? null,
  }));
  const arcPods = (pods || []).filter((p) => namespaces.has(p.metadata?.namespace)
    && (isController(p) || p.metadata?.labels?.['control-plane'] === 'controller-manager'
      || 'actions-runner' in (p.metadata?.labels || {}) || p.metadata?.labels?.['runner-deployment-name']
      || p.metadata?.labels?.['actions.github.com/scale-set-name']
      || p.metadata?.labels?.['app.kubernetes.io/component'] === 'runner-scale-set-listener'));
  const unhealthyPods = arcPods.filter((p) => {
    if (p.metadata?.deletionTimestamp || p.status?.phase === 'Succeeded') return false;
    const containers = p.status?.containerStatuses || [];
    return p.status?.phase !== 'Running' || !containers.length || containers.some((c) => !c.ready)
      || p.status?.conditions?.some((c) => c.type === 'Ready' && c.status !== 'True');
  }).map((p) => ({ ...identity(p), phase: p.status?.phase || 'Unknown',
    reasons: [...(p.status?.initContainerStatuses || []), ...(p.status?.containerStatuses || [])]
      .filter((c) => c.state?.waiting || (c.state?.terminated?.exitCode ?? 0) !== 0)
      .map((c) => c.state?.waiting?.reason || c.state?.terminated?.reason || 'Container failed'),
  }));
  const relevant = new Set([...arcPods, ...(deployments || []).filter(isController),
    ...Object.values(resources).flatMap((items) => items || [])].map(key));
  const warnings = (events || []).filter((e) => {
    const target = e.involvedObject || e.regarding || {};
    const timestamp = e.lastTimestamp || e.eventTime || e.metadata?.creationTimestamp;
    const age = now - Date.parse(timestamp || '');
    return namespaces.has(e.metadata?.namespace) && relevant.has(`${target.namespace || e.metadata?.namespace}/${target.name}`)
      && age >= 0 && age <= 60 * 60 * 1000;
  }).map((e) => ({
    ...identity(e), target: (e.involvedObject || e.regarding)?.name,
    reason: e.reason || 'Warning', message: e.message || e.note || '',
    time: e.lastTimestamp || e.eventTime || e.metadata?.creationTimestamp, count: e.count ?? 1,
  })).sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 20);
  const issues = [];
  const unknowns = [];
  if ((legacy || modern) && !controllers.length && deployments) issues.push('No ARC controller deployment detected.');
  controllers.filter((c) => !c.healthy).forEach((c) => issues.push(`${c.namespace}/${c.name}: controller not fully available or rollout not observed.`));
  capacity.filter((c) => c.desired !== null && c.available !== null && c.available < c.desired)
    .forEach((c) => issues.push(`${c.namespace}/${c.name}: ${c.available} available of ${c.desired} desired runners.`));
  runners.filter((r) => r.kind === 'Runner' && r.ready === false)
    .forEach((r) => issues.push(`${r.namespace}/${r.name}: runner not ready.`));
  if (runners.some((r) => r.kind === 'Runner' && r.ready === null)) unknowns.push('Some legacy runners have not reported readiness.');
  if (capacity.some((c) => c.desired === null)) unknowns.push('Some runner capacity resources have not reported desired capacity.');
  if (legacy && !definitions.some((d) => d.spec.names.plural === 'runners')) unknowns.push('Legacy runner readiness CRD is missing.');
  if (unhealthyPods.length) issues.push(`${unhealthyPods.length} ARC pod(s) not ready.`);
  if (warnings.length) issues.push(`${warnings.length} recent ARC warning event(s); inspect below.`);
  const installed = legacy || modern || controllers.length > 0;
  return {
    checkedAt: new Date(now).toISOString(),
    status: errors.length ? 'unknown' : !installed ? 'not-installed' : issues.length ? 'attention' : modern || unknowns.length ? 'unknown' : 'healthy',
    generations: [legacy && 'Legacy ARC', modern && 'Runner scale sets'].filter(Boolean),
    controllers, capacity, runners, autoscalers, unhealthyPods, warnings, issues, errors: [...errors, ...unknowns],
    scope: 'Kubernetes-side checks only. GitHub registration, online/busy status and job execution are unverified.',
    ...(modern ? { limitation: 'Scale-set resources are shown, but end-to-end scale-set health is not verified.' } : {}),
  };
}

module.exports = { getArcHealth };
