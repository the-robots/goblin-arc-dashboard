const k8s = require('@kubernetes/client-node');
const { createApp } = require('./app');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
if (process.env.KUBE_CONTEXT) kc.setCurrentContext(process.env.KUBE_CONTEXT);
if (!kc.getCurrentCluster()) {
  throw new Error('No cluster configured. Set KUBECONFIG to a valid kubeconfig file.');
}
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

const { server } = createApp({
  k8sApi, kc,
  appsApi: kc.makeApiClient(k8s.AppsV1Api),
  extensionsApi: kc.makeApiClient(k8s.ApiextensionsV1Api),
  customApi: kc.makeApiClient(k8s.CustomObjectsApi),
});

server.listen(port, host, () => {
  console.log(`Goblin backend running at http://${host}:${port} (context: ${kc.getCurrentContext()})`);
});
