import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import Dashboard from '../src/app/page';

const mockSocket = { on: jest.fn(), disconnect: jest.fn(), io: { on: jest.fn() } };
jest.mock('socket.io-client', () => ({ io: jest.fn(() => mockSocket) }));
jest.mock('../src/app/ArcHealth', () => ({ __esModule: true, default: () => null }));
const pod = (name: string, namespace = 'default', phase = 'Running') => ({
  metadata: { name, namespace }, status: { phase,
    containerStatuses: [{ name: 'app', ready: true, restartCount: 0 }] },
});
const emit = (event: string, data?: unknown) => {
  act(() => mockSocket.on.mock.calls.find(([name]) => name === event)![1](data));
};
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
});
afterEach(() => jest.restoreAllMocks());

describe('Dashboard', () => {
  it('renders heading, loading, and then an empty cluster', async () => {
    render(<Dashboard />);
    expect(screen.getByText(/Goblin mode/i)).toBeInTheDocument();
    expect(screen.getByText('Loading pods...')).toBeInTheDocument();
    expect(await screen.findByText('No pods in this cluster.')).toBeInTheDocument();
    expect(screen.queryByText('Loading pods...')).not.toBeInTheDocument();
  });

  it('renders namespace, status, and filters', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ items: [
      pod('test-pod-1'), pod('test-pod-2', 'kube-system', 'Pending'),
    ] }) });
    render(<Dashboard />);
    await screen.findByRole('heading', { name: 'test-pod-1' });
    expect(screen.getByText('Namespace: default')).toBeInTheDocument();
    expect(screen.getByText('Running', { selector: 'span' })).toHaveClass('text-green-600');
    expect(screen.getByText('Pending', { selector: 'span' })).toHaveClass('text-yellow-600');
    expect(screen.getAllByRole('img', { name: 'grinning pod goblin' })).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'waiting pod goblin' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Namespace'), { target: { value: 'kube-system' } });
    expect(screen.queryByRole('heading', { name: 'test-pod-1' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search pods'), { target: { value: 'missing' } });
    expect(screen.getByText('No pods match your filters.')).toBeInTheDocument();
  });

  it.each(['HTTP 500', 'Network error'])('shows fetch failure: %s', async (error) => {
    if (error === 'HTTP 500') (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });
    else (global.fetch as jest.Mock).mockRejectedValue(new Error(error));
    render(<Dashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent(error);
    expect(screen.getByText('Unable to load pods.')).toBeInTheDocument();
  });

  it('updates and deletes by namespace and deduplicates ADDED events', async () => {
    const a = pod('shared', 'a');
    const b = pod('shared', 'b');
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ items: [a, b] }) });
    render(<Dashboard />);
    await screen.findByText('Namespace: a');
    emit('pods:init', [a, b]);
    emit('pods:update', { type: 'ADDED', pod: a });
    expect(screen.getAllByRole('heading', { name: 'shared' })).toHaveLength(2);
    emit('pods:update', { type: 'MODIFIED', pod: pod('shared', 'a', 'Pending') });
    expect(screen.getByText('Pending', { selector: 'span' })).toBeInTheDocument();
    emit('pods:update', { type: 'DELETED', pod: a });
    expect(screen.queryByText('Namespace: a')).not.toBeInTheDocument();
    expect(screen.getByText('Namespace: b')).toBeInTheDocument();
  });

  it('keeps events arriving during initial snapshot loading', async () => {
    (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<Dashboard />);
    emit('pods:update', { type: 'ADDED', pod: pod('new') });
    emit('pods:init', []);
    expect(screen.getByRole('heading', { name: 'new' })).toBeInTheDocument();
    expect(screen.queryByText('Loading pods...')).not.toBeInTheDocument();
  });

  it('shows watch health separately from socket health and cleans up', async () => {
    const { unmount } = render(<Dashboard />);
    await screen.findByText('No pods in this cluster.');
    emit('connect');
    emit('cluster:status', { connected: true, error: null });
    expect(screen.getByRole('status')).toHaveTextContent('Live cluster watch');
    emit('cluster:status', { connected: false, error: 'Watch failed' });
    expect(screen.getByRole('alert')).toHaveTextContent('Watch failed');
    emit('pods:error', { error: 'Cannot read pods' });
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot read pods');
    emit('disconnect');
    expect(screen.getByRole('status')).toHaveTextContent('Backend disconnected');
    unmount();
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('shows container waiting reasons and caps the log', async () => {
    const broken = { ...pod('broken'), status: { phase: 'Running', containerStatuses: [
      { ready: false, restartCount: 3, state: { waiting: { reason: 'CrashLoopBackOff' } } },
    ] } };
    render(<Dashboard />);
    await screen.findByText('No pods in this cluster.');
    emit('pods:init', [broken]);
    expect(screen.getByText('CrashLoopBackOff', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'worried pod goblin' })).toBeInTheDocument();
    for (let i = 0; i < 60; i++) emit('pods:update', { type: 'MODIFIED', pod: broken });
    expect(screen.getAllByRole('listitem')).toHaveLength(50);
  });

  it('reflects readiness even for Running pods and opens one goblin report at a time', async () => {
    const unready = { ...pod('unready'), status: { phase: 'Running', containerStatuses: [
      { name: 'worker', ready: false, restartCount: 12 },
    ] } };
    render(<Dashboard />);
    await screen.findByText('No pods in this cluster.');
    emit('pods:init', [unready, pod('healthy')]);
    const unreadyButton = screen.getByRole('button', { name: 'Ask goblin about default/unready' });
    expect(unreadyButton).toHaveClass('w-14');
    expect(unreadyButton.querySelector('svg')).toHaveAttribute('aria-label', 'waiting pod goblin');
    fireEvent.click(unreadyButton);
    expect(unreadyButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Not all containers are ready. Holding the fort.')).toBeVisible();
    expect(screen.getByText(/Watch offline/)).toBeVisible();
    emit('connect');
    emit('cluster:status', { connected: true, error: null });
    expect(screen.queryByText(/Watch offline/)).not.toBeInTheDocument();
    const healthyButton = screen.getByRole('button', { name: 'Ask goblin about default/healthy' });
    expect(healthyButton).toHaveClass('w-10');
    fireEvent.click(healthyButton);
    expect(unreadyButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('All containers ready. Nothing to bonk.')).toBeVisible();
    fireEvent.click(healthyButton);
    expect(healthyButton).toHaveAttribute('aria-expanded', 'false');
  });

  it.each([
    [599999, 'waiting'],
    [600000, 'grinning'],
    [86400000, 'grinning'],
  ])('uses a 10-minute window, not lifetime restarts, for mood (%i ms)', async (age, mood) => {
    const now = Date.parse('2026-10-13T20:00:00Z');
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const restarted = { ...pod('restarted'), status: { phase: 'Running', containerStatuses: [
      { ready: true, restartCount: 100, lastState: { terminated: { finishedAt: new Date(now - age).toISOString() } } },
    ] } };
    render(<Dashboard />);
    await screen.findByText('No pods in this cluster.');
    emit('pods:init', [restarted]);
    const button = screen.getByRole('button', { name: 'Ask goblin about default/restarted' });
    expect(button.querySelector('svg')).toHaveAttribute('aria-label', `${mood} pod goblin`);
  });

  it('handles failed init containers, missing health, completed and terminating pods', async () => {
    render(<Dashboard />);
    await screen.findByText('No pods in this cluster.');
    emit('pods:init', [
      { ...pod('init-failed'), status: { phase: 'Pending', initContainerStatuses: [
        { ready: false, restartCount: 1, state: { terminated: { exitCode: 1, reason: 'Error' } } },
      ] } },
      { metadata: { name: 'unknown', namespace: 'default' }, status: { phase: 'Running' } },
      pod('done', 'default', 'Succeeded'),
      { ...pod('leaving'), metadata: { name: 'leaving', namespace: 'default', deletionTimestamp: '2026-10-13T20:00:00Z' } },
    ]);
    for (const [name, mood] of [['init-failed', 'worried'], ['unknown', 'unknown'], ['done', 'sleepy'], ['leaving', 'sleepy']]) {
      expect(screen.getByRole('button', { name: `Ask goblin about default/${name}` }).querySelector('svg'))
        .toHaveAttribute('aria-label', `${mood} pod goblin`);
    }
  });

  it('shows a visible legend and rich container details matched by name', async () => {
    render(<Dashboard />);
    await screen.findByText('No pods in this cluster.');
    expect(screen.getByText('Goblin key · Colors, expressions & health').closest('details')).toHaveAttribute('open');
    expect(screen.getByText(/Green \/ teal \/ lime/)).toBeVisible();
    const detailed = { ...pod('detailed'), spec: {
      containers: [
        { name: 'app', image: 'example/app:v1', ports: [{ name: 'web', containerPort: 8080 }],
          resources: { requests: { cpu: '100m', memory: '64Mi' }, limits: { memory: '128Mi' } } },
        { name: 'sidecar', image: 'example/sidecar:v2' },
      ],
      initContainers: [{ name: 'setup', image: 'example/setup:v3' }],
    }, status: { phase: 'Running', containerStatuses: [
      { name: 'sidecar', ready: false, restartCount: 2,
        state: { waiting: { reason: 'CrashLoopBackOff', message: 'Back-off restarting failed container' } } },
      { name: 'app', ready: true, restartCount: 4, started: true,
        state: { running: { startedAt: '2026-10-13T20:00:00Z' } },
        lastState: { terminated: { reason: 'OOMKilled', exitCode: 137, signal: 9, finishedAt: '2026-10-12T20:00:00Z' } } },
    ] } };
    emit('pods:init', [detailed]);
    fireEvent.click(screen.getByRole('button', { name: 'Ask goblin about default/detailed' }));
    const appDetails = screen.getByText('Container: app · Ready · 4 restarts').closest('details')!;
    fireEvent.click(within(appDetails).getByText('Container: app · Ready · 4 restarts'));
    expect(within(appDetails).getByText('example/app:v1')).toBeInTheDocument();
    expect(within(appDetails).getByText('web: 8080/TCP')).toBeInTheDocument();
    expect(within(appDetails).getByText('cpu: 100m, memory: 64Mi')).toBeInTheDocument();
    expect(within(appDetails).getByText('memory: 128Mi')).toBeInTheDocument();
    expect(within(appDetails).getByText(/OOMKilled · Code: 137 · Signal: 9/)).toBeInTheDocument();
    expect(screen.getByText('Back-off restarting failed container')).toBeInTheDocument();
    expect(screen.getByText('Init container: setup · Status unavailable · -- restarts')).toBeVisible();
    expect(screen.getByText(/not live usage/)).toBeVisible();
  });
});
