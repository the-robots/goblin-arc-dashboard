import React from 'react';
import { act, render, screen } from '@testing-library/react';
import ArcHealth from '../src/app/ArcHealth';

const snapshot = {
  checkedAt: new Date().toISOString(), status: 'healthy', generations: ['Legacy ARC'],
  controllers: [{ name: 'controller', namespace: 'arc', healthy: true, desired: 1, available: 1, updated: 1 }],
  capacity: [], runners: [], autoscalers: [], unhealthyPods: [], warnings: [], errors: [], issues: [],
  scope: 'Kubernetes-side checks only. GitHub status unverified.',
};
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => snapshot });
});
afterEach(() => jest.useRealTimers());

it('shows ARC scope and checks without asserting end-to-end health', async () => {
  render(<ArcHealth base="http://localhost:3000" />);
  expect(await screen.findByText('Kubernetes-side checks passing')).toBeInTheDocument();
  expect(screen.getByText(snapshot.scope)).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/arc', expect.objectContaining({ signal: expect.any(AbortSignal) }));
});

it('shows missing permissions rather than a healthy badge', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({
    ...snapshot, status: 'unknown', errors: ['Could not read ARC CRDs. Check RBAC permissions.'],
  }) });
  render(<ArcHealth base="" />);
  expect(await screen.findByText('Health unverified')).toBeInTheDocument();
  expect(screen.getByText(/Check RBAC/)).toBeInTheDocument();
});

it('marks cached health unverified on refresh failure and aborts on unmount', async () => {
  jest.useFakeTimers();
  const { unmount } = render(<ArcHealth base="" />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText('Kubernetes-side checks passing')).toBeInTheDocument();
  (global.fetch as jest.Mock).mockRejectedValue(new Error('Offline'));
  await act(async () => { await jest.advanceTimersByTimeAsync(30000); });
  expect(screen.getByText('Health unverified')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Offline');
  const signal = (global.fetch as jest.Mock).mock.calls[0][1].signal;
  unmount();
  expect(signal.aborted).toBe(true);
});
