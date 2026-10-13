const mockWatch = jest.fn();
jest.mock('@kubernetes/client-node', () => ({
  Watch: jest.fn(() => ({ watch: mockWatch })),
}));
const { createApp } = require('../app');
let result;
let api;
let abort;

beforeEach(() => {
  jest.useFakeTimers();
  abort = jest.fn();
  mockWatch.mockReset().mockResolvedValue({ abort });
  api = { listPodForAllNamespaces: jest.fn().mockResolvedValue({
    metadata: { resourceVersion: '123' }, items: [],
  }) };
});
afterEach(() => {
  result.server.emit('close');
  result.io.close();
  jest.useRealTimers();
});

it('starts the watch from the snapshot version and aborts on shutdown', async () => {
  result = createApp({ k8sApi: api, kc: {} });
  await jest.advanceTimersByTimeAsync(0);
  expect(mockWatch).toHaveBeenCalledWith('/api/v1/pods', { resourceVersion: '123' },
    expect.any(Function), expect.any(Function));
  result.server.emit('close');
  expect(abort).toHaveBeenCalled();
});

it('handles rejected watch starts and refreshes the snapshot on retry', async () => {
  mockWatch.mockRejectedValueOnce(new Error('Unreachable'));
  result = createApp({ k8sApi: api, kc: {} });
  await jest.advanceTimersByTimeAsync(0);
  expect(mockWatch).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(5000);
  expect(mockWatch).toHaveBeenCalledTimes(2);
  expect(api.listPodForAllNamespaces).toHaveBeenCalledTimes(2);
});

it('deduplicates retries and does not restart a stopped server', async () => {
  result = createApp({ k8sApi: api, kc: {} });
  await jest.advanceTimersByTimeAsync(0);
  const ended = mockWatch.mock.calls[0][3];
  ended(new Error('Disconnected'));
  ended(new Error('Disconnected again'));
  await jest.advanceTimersByTimeAsync(5000);
  expect(mockWatch).toHaveBeenCalledTimes(2);
  ended(new Error('Disconnected'));
  result.server.emit('close');
  await jest.advanceTimersByTimeAsync(5000);
  expect(mockWatch).toHaveBeenCalledTimes(2);
});
