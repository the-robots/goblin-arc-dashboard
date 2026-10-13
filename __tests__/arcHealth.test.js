const { getArcHealth } = require('../lib/arcHealth');
const now = Date.parse('2026-10-13T20:00:00Z');
const resource = (name, extra = {}) => ({ metadata: { name, namespace: 'arc-systems' }, ...extra });
function clients() {
  return {
    now,
    k8sApi: {
      listPodForAllNamespaces: jest.fn().mockResolvedValue({ items: [resource('runner-1', {
        metadata: { name: 'runner-1', namespace: 'arc-systems', labels: { 'actions-runner': '' } },
        status: { phase: 'Running', containerStatuses: [{ ready: true }] },
      })] }),
      listEventForAllNamespaces: jest.fn().mockResolvedValue({ items: [] }),
    },
    appsApi: { listDeploymentForAllNamespaces: jest.fn().mockResolvedValue({ items: [
      resource('actions-runner-controller', { spec: { replicas: 1 }, status: { availableReplicas: 1, updatedReplicas: 1 } }),
    ] }) },
    extensionsApi: { listCustomResourceDefinition: jest.fn().mockResolvedValue({ items: ['runners', 'runnerdeployments'].map((plural) => ({
      spec: { group: 'actions.summerwind.dev', names: { plural }, versions: [{ name: 'v1alpha1', served: true, storage: true }] },
    })) }) },
    customApi: { listClusterCustomObject: jest.fn(async ({ plural }) => ({ items: [
      plural === 'runners' ? resource('runner-1', {
        status: { ready: true, phase: 'Running', registration: { token: 'DO_NOT_EXPOSE', organization: 'example' } },
      }) : resource('fleet', { spec: { replicas: 1 }, status: { desiredReplicas: 1, availableReplicas: 1, readyReplicas: 1 } }),
    ] })) },
  };
}

it('reports passing Kubernetes health and strips credential-bearing fields', async () => {
  const result = await getArcHealth(clients());
  expect(result.status).toBe('healthy');
  expect(result.controllers).toHaveLength(1);
  expect(result.scope).toContain('unverified');
  expect(JSON.stringify(result)).not.toContain('DO_NOT_EXPOSE');
  expect(result.runners[0]).toEqual({ name: 'runner-1', namespace: 'arc-systems', kind: 'Runner', phase: 'Running', ready: true });
});

it('reports capacity deficits and unavailable controller rollouts', async () => {
  const input = clients();
  input.appsApi.listDeploymentForAllNamespaces.mockResolvedValue({ items: [
    resource('actions-runner-controller', { metadata: { name: 'actions-runner-controller', namespace: 'arc-systems', generation: 2 },
      spec: { replicas: 1 }, status: { availableReplicas: 1, updatedReplicas: 1, observedGeneration: 1 } }),
  ] });
  input.customApi.listClusterCustomObject.mockImplementation(async ({ plural }) => ({ items: plural === 'runnerdeployments'
    ? [resource('fleet', { spec: { replicas: 2 }, status: { availableReplicas: 1 } })] : [] }));
  const result = await getArcHealth(input);
  expect(result.status).toBe('attention');
  expect(result.issues.join(' ')).toContain('1 available of 2 desired');
  expect(result.controllers[0].healthy).toBe(false);
});

it('fails visibly to unknown when reads are denied', async () => {
  const input = clients();
  input.k8sApi.listEventForAllNamespaces.mockRejectedValue(new Error('Forbidden'));
  const result = await getArcHealth(input);
  expect(result.status).toBe('unknown');
  expect(result.errors[0]).toContain('RBAC');
});

it('filters warnings by ARC object and one-hour window', async () => {
  const input = clients();
  input.k8sApi.listEventForAllNamespaces.mockResolvedValue({ items: [
    resource('recent', { involvedObject: { name: 'runner-1' }, lastTimestamp: new Date(now - 1000).toISOString(), reason: 'Failed' }),
    resource('old', { involvedObject: { name: 'runner-1' }, lastTimestamp: new Date(now - 3600001).toISOString() }),
    resource('unrelated', { involvedObject: { name: 'other' }, lastTimestamp: new Date(now).toISOString() }),
  ] });
  const result = await getArcHealth(input);
  expect(result.status).toBe('attention');
  expect(result.warnings.map((w) => w.name)).toEqual(['recent']);
});

it('allows intentional scale-to-zero without treating it as missing capacity', async () => {
  const input = clients();
  input.customApi.listClusterCustomObject.mockImplementation(async ({ plural }) => ({ items: plural === 'runnerdeployments'
    ? [resource('fleet', { spec: { replicas: 0 }, status: { desiredReplicas: 0, availableReplicas: 0 } })] : [] }));
  input.k8sApi.listPodForAllNamespaces.mockResolvedValue({ items: [] });
  expect((await getArcHealth(input)).status).toBe('healthy');
});

it('does not claim scale-set health is verified', async () => {
  const input = clients();
  input.extensionsApi.listCustomResourceDefinition.mockResolvedValue({ items: [
    { spec: { group: 'actions.github.com', names: { plural: 'autoscalingrunnersets' },
      versions: [{ name: 'v1alpha1', served: true, storage: true }] } },
  ] });
  input.customApi.listClusterCustomObject.mockResolvedValue({ items: [
    resource('scale-set', { status: { desiredRunners: 1, currentRunners: 1 } }),
  ] });
  const result = await getArcHealth(input);
  expect(result.status).toBe('unknown');
  expect(result.limitation).toContain('not verified');
});

it('distinguishes no installation from failed discovery', async () => {
  const input = clients();
  input.extensionsApi.listCustomResourceDefinition.mockResolvedValue({ items: [] });
  input.appsApi.listDeploymentForAllNamespaces.mockResolvedValue({ items: [] });
  expect((await getArcHealth(input)).status).toBe('not-installed');
});
