const request = require('supertest');

// Mock @kubernetes/client-node before requiring app.js
jest.mock('@kubernetes/client-node', () => ({
  Watch: jest.fn().mockImplementation(() => ({
    watch: jest.fn(),
  })),
}));

const mockK8sApi = {
  listPodForAllNamespaces: jest.fn(),
};

const mockKc = {};

const { createApp } = require('../app');

let app, server, io;

beforeAll((done) => {
  const result = createApp({ k8sApi: mockK8sApi, kc: mockKc });
  app = result.app;
  server = result.server;
  io = result.io;
  // Start server on a random port for testing
  server.listen(0, done);
});

afterAll(() => {
  return new Promise((resolve) => {
    io.close(() => resolve());
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('GET /healthz', () => {
  it('returns { ok: true }', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('GET /api/pods', () => {
  it('returns pod list when k8s API succeeds with body wrapper', async () => {
    const mockPods = {
      body: {
        items: [
          { metadata: { name: 'pod-1', namespace: 'default' }, status: { phase: 'Running' } },
          { metadata: { name: 'pod-2', namespace: 'kube-system' }, status: { phase: 'Pending' } },
        ],
      },
    };
    mockK8sApi.listPodForAllNamespaces.mockResolvedValue(mockPods);

    const res = await request(app).get('/api/pods');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].metadata.name).toBe('pod-1');
    expect(res.body.items[1].metadata.name).toBe('pod-2');
  });

  it('returns pod list when k8s API returns direct items', async () => {
    const mockPods = {
      items: [
        { metadata: { name: 'pod-a', namespace: 'default' }, status: { phase: 'Running' } },
      ],
    };
    mockK8sApi.listPodForAllNamespaces.mockResolvedValue(mockPods);

    const res = await request(app).get('/api/pods');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].metadata.name).toBe('pod-a');
  });

  it('returns 500 when k8s API throws', async () => {
    mockK8sApi.listPodForAllNamespaces.mockRejectedValue(new Error('K8s unreachable'));

    const res = await request(app).get('/api/pods');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to fetch pods' });
  });

  it('returns empty items when k8s API returns null', async () => {
    mockK8sApi.listPodForAllNamespaces.mockResolvedValue(null);

    const res = await request(app).get('/api/pods');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });
});

describe('Static files', () => {
  it('serves public/index.html at root', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Goblin Backend');
  });
});
