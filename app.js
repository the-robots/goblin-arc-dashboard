const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { normalizeBody } = require('./lib/normalizeBody');
const { getArcHealth } = require('./lib/arcHealth');

/**
 * Create the Express app, HTTP server, and Socket.IO instance.
 * Accepts k8sApi and kc as dependencies so they can be mocked in tests.
 */
function createApp({ k8sApi, kc, appsApi, extensionsApi, customApi }) {
  const app = express();
  const server = http.createServer(app);
  const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3001';
  const io = new Server(server, { cors: { origin } });

  app.use(cors({ origin }));
  app.use(express.static(path.join(__dirname, 'public')));

  // --- Health check
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  let arcRequest;
  let arcSnapshot;
  app.get('/api/arc', async (_req, res) => {
    if (!appsApi || !extensionsApi || !customApi) {
      res.status(503).json({ error: 'ARC health clients are not configured.' });
      return;
    }
    try {
      if (!arcSnapshot || Date.now() - arcSnapshot.time >= 15000) {
        if (!arcRequest) arcRequest = getArcHealth({ k8sApi, appsApi, extensionsApi, customApi })
          .then((data) => { arcSnapshot = { data, time: Date.now() }; })
          .finally(() => { arcRequest = undefined; });
        await arcRequest;
      }
      res.json(arcSnapshot.data);
    } catch (err) {
      console.error('Error checking ARC health:', err);
      res.status(500).json({ error: 'Failed to check ARC health.' });
    }
  });

  // --- REST: pods list (defensive + debug)
  app.get('/api/pods', async (_req, res) => {
    try {
      const resp = await k8sApi.listPodForAllNamespaces();

      const body = normalizeBody(resp);
      res.json(body);
    } catch (err) {
      console.error('Error fetching pods', err);
      res.status(500).json({ error: 'Failed to fetch pods' });
    }
  });

  // --- Global watch with auto-reconnect
  let stopped = false;
  let activeWatch;
  let retryTimer;
  let watchStatus = { connected: false, error: null };
  function reportWatch(connected, error = null) {
    watchStatus = { connected, error };
    io.emit('cluster:status', watchStatus);
  }
  async function startPodWatch() {
    if (stopped) return;
    const k8sWatch = new (require('@kubernetes/client-node').Watch)(kc);
    console.log('🔭 Starting Kubernetes pod watch...');
    const retry = (err) => {
      if (stopped) return;
      console.error('Pod watch disconnected:', err?.message || 'Stream ended');
      reportWatch(false, 'Cluster watch disconnected; retrying...');
      if (!retryTimer) retryTimer = setTimeout(() => {
        retryTimer = undefined;
        startPodWatch();
      }, 5000);
    };
    try {
      const snapshot = normalizeBody(await k8sApi.listPodForAllNamespaces());
      if (stopped) return;
      io.emit('pods:init', snapshot.items);
      activeWatch = await k8sWatch.watch(
        '/api/v1/pods',
        snapshot.metadata?.resourceVersion ? { resourceVersion: snapshot.metadata.resourceVersion } : {},
        (type, obj) => {
          if (!obj || !obj.metadata) return;
          io.emit('pods:update', { type, pod: obj });
        },
        retry
      );
      if (stopped) activeWatch?.abort();
      else if (!retryTimer) reportWatch(true);
    } catch (err) {
      retry(err);
    }
  }
  startPodWatch();
  server.on('close', () => {
    stopped = true;
    clearTimeout(retryTimer);
    activeWatch?.abort();
  });

  // --- WebSocket: send initial list (defensive)
  io.on('connection', (socket) => {
    console.log('🟢 Client connected:', socket.id);
    socket.emit('cluster:status', watchStatus);

    k8sApi.listPodForAllNamespaces()
      .then((resp) => {
        const body = normalizeBody(resp);
        socket.emit('pods:init', body.items);
      })
      .catch((err) => {
        console.error('Error sending initial pod list:', err);
        socket.emit('pods:error', { error: 'Failed to fetch pods from Kubernetes' });
      });

    socket.on('disconnect', () => {
      console.log('🔴 Client disconnected:', socket.id);
    });
  });

  return { app, server, io };
}

module.exports = { createApp };
