import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from '../src/app/page';

// Mock socket.io-client
const mockSocket = {
  on: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

// Mock next/font/google to avoid font loading errors
jest.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSocket.on.mockReset();
  mockSocket.disconnect.mockReset();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Dashboard', () => {
  it('renders the dashboard heading', () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    render(<Dashboard />);
    expect(screen.getByText(/Goblin mode/i)).toBeInTheDocument();
    expect(screen.getByText(/K3s Pod Dashboard/i)).toBeInTheDocument();
  });

  it('shows loading state when no pods loaded', () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    render(<Dashboard />);
    expect(screen.getByText('Loading pods...')).toBeInTheDocument();
  });

  it('renders pods from REST API response', async () => {
    const mockPods = {
      items: [
        { metadata: { name: 'test-pod-1', namespace: 'default' }, status: { phase: 'Running' } },
        { metadata: { name: 'test-pod-2', namespace: 'kube-system' }, status: { phase: 'Pending' } },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockPods,
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('test-pod-1')).toBeInTheDocument();
      expect(screen.getByText('test-pod-2')).toBeInTheDocument();
    });

    expect(screen.getByText('Namespace: default')).toBeInTheDocument();
    expect(screen.getByText('Namespace: kube-system')).toBeInTheDocument();
  });

  it('displays correct status styling for Running pods', async () => {
    const mockPods = {
      items: [
        { metadata: { name: 'running-pod', namespace: 'default' }, status: { phase: 'Running' } },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockPods,
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Running')).toBeInTheDocument();
    });

    expect(screen.getByText('Running')).toHaveClass('text-green-600');
  });

  it('displays correct status styling for Pending pods', async () => {
    const mockPods = {
      items: [
        { metadata: { name: 'pending-pod', namespace: 'default' }, status: { phase: 'Pending' } },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockPods,
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    expect(screen.getByText('Pending')).toHaveClass('text-yellow-600');
  });

  it('registers socket event listeners', () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    render(<Dashboard />);

    const registeredEvents = mockSocket.on.mock.calls.map(
      (call: [string, ...unknown[]]) => call[0]
    );
    expect(registeredEvents).toContain('pods:init');
    expect(registeredEvents).toContain('pods:update');
    expect(registeredEvents).toContain('connect_error');
    expect(registeredEvents).toContain('reconnect_attempt');
  });

  it('renders the event log section', () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    render(<Dashboard />);
    expect(screen.getByText(/Event Log/)).toBeInTheDocument();
    expect(screen.getByText('No events yet...')).toBeInTheDocument();
  });

  it('handles REST API failure gracefully', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    render(<Dashboard />);

    // Should still render without crashing
    await waitFor(() => {
      expect(screen.getByText(/Goblin mode/i)).toBeInTheDocument();
    });
  });

  it('handles fetch network error gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    render(<Dashboard />);

    // Should still render without crashing
    await waitFor(() => {
      expect(screen.getByText(/Goblin mode/i)).toBeInTheDocument();
    });
  });
});
