const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { normalizeBody } = require('./lib/normalizeBody');

/**
 * Create the Express app, HTTP server, and Socket.IO instance.
 * Accepts k8sApi and kc as dependencies so they can be mocked in tests.
 */
function createApp({ k8sApi, kc }) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  app.use(cors());
  app.use(express.static(path.join(__dirname, 'public')));

  // --- Health check
  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  // --- REST: pods list (defensive + debug)
  app.get('/api/pods', async (_req, res) => {
    try {
      const resp = await k8sApi.listPodForAllNamespaces();

      // Debug insight (goes to backend.log)
      console.log('[/api/pods] resp type =', typeof resp, 'keys =', resp && typeof resp === 'object' ? Object.keys(resp) : 'n/a');
      console.log('[/api/pods] typeof resp.body =', resp && resp.body !== undefined ? typeof resp.body : 'undefined');

      const body = normalizeBody(resp);
      res.json(body);
    } catch (err) {
      console.error('Error fetching pods', err);
      res.status(500).json({ error: 'Failed to fetch pods' });
    }
  });

  // --- Global watch with auto-reconnect
  function startPodWatch() {
    const k8sWatch = new (require('@kubernetes/client-node').Watch)(kc);
    console.log('🔭 Starting Kubernetes pod watch...');

    k8sWatch.watch(
      '/api/v1/pods',
      {},
      (type, obj) => {
        if (!obj || !obj.metadata) return;
        io.emit('pods:update', { type, pod: obj });
      },
      (err) => {
        console.error('⚠️ Pod watch error:', err);
        setTimeout(startPodWatch, 5000); // retry after delay
      }
    );
  }
  startPodWatch();

  // --- WebSocket: send initial list (defensive)
  io.on('connection', (socket) => {
    console.log('🟢 Client connected:', socket.id);

    k8sApi.listPodForAllNamespaces()
      .then((resp) => {
        const body = normalizeBody(resp);
        socket.emit('pods:init', body.items);
      })
      .catch((err) => {
        console.error('Error sending initial pod list:', err);
        socket.emit('pods:init', []); // let UI render even if fetch failed
      });

    socket.on('disconnect', () => {
      console.log('🔴 Client disconnected:', socket.id);
    });
  });

  return { app, server, io };
}

module.exports = { createApp };
