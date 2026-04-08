const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const k8s = require('@kubernetes/client-node');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const port = 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- K3s kubeconfig (known-good system file)
const kc = new k8s.KubeConfig();
kc.loadFromFile('/etc/rancher/k3s/k3s.yaml');
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

// --- Health check
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Helper: normalize CoreV1Api list responses defensively
function normalizeBody(resp) {
  // Possibilities we need to support depending on @kubernetes/client-node version:
  // 1) { body: <object> }
  // 2) <object> directly (i.e., resp.items exists)
  // 3) { body: "<json-string>" }
  // 4) undefined/null (error/edge)
  let body = null;

  if (resp && typeof resp === 'object') {
    // Case 2: direct object with items
    if (Array.isArray(resp.items)) {
      body = resp;
    }
    // Case 1 or 3: resp.body present
    else if ('body' in resp) {
      if (typeof resp.body === 'string') {
        try {
          body = JSON.parse(resp.body);
        } catch {
          body = null;
        }
      } else {
        body = resp.body;
      }
    }
  }

  if (!body || typeof body !== 'object') body = { items: [] };
  if (!Array.isArray(body.items)) body.items = [];
  return body;
}

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
  const watch = new k8s.Watch(kc);
  console.log('🔭 Starting Kubernetes pod watch...');

  watch.watch(
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

server.listen(port, '0.0.0.0', () => {
  console.log(`Goblin dashboard running at http://0.0.0.0:${port}`);
});

