const k8s = require('@kubernetes/client-node');
const { createApp } = require('./app');

const port = 3000;

// --- K3s kubeconfig (known-good system file)
const kc = new k8s.KubeConfig();
kc.loadFromFile('/etc/rancher/k3s/k3s.yaml');
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

const { server } = createApp({ k8sApi, kc });

server.listen(port, '0.0.0.0', () => {
  console.log(`Goblin dashboard running at http://0.0.0.0:${port}`);
});

