import * as k8s from '@kubernetes/client-node';
import Table from 'cli-table3';
import chalk from 'chalk';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

export async function watchPods({ namespace }) {
  const kc = new k8s.KubeConfig();

  // 🌐 Smart kubeconfig resolution: use env var, then fallback paths
  const kubeconfigPath =
    process.env.KUBECONFIG && fs.existsSync(process.env.KUBECONFIG)
      ? process.env.KUBECONFIG
      : [
          path.join(process.env.HOME || '', '.kube', 'config'),
          path.join(process.env.HOME || '', '.k3s.yaml'),
          '/etc/rancher/k3s/k3s.yaml',
        ].find((p) => fs.existsSync(p));

  if (!kubeconfigPath) {
    console.error(chalk.red('❌ No kubeconfig file found!'));
    console.error('Searched paths:', [
      process.env.KUBECONFIG,
      '~/.kube/config',
      '~/.k3s.yaml',
      '/etc/rancher/k3s/k3s.yaml',
    ]);
    return;
  }

  try {
    kc.loadFromFile(kubeconfigPath);
    console.log(chalk.green(`✅ Loaded kubeconfig from: ${kubeconfigPath}`));
  } catch (err) {
    console.error(chalk.red(`❌ Failed to load kubeconfig from: ${kubeconfigPath}`));
    console.error('Error:', err.message);
    return;
  }

  const context = kc.getCurrentContext();
  const cluster = kc.getCluster(context);
  if (!cluster || !cluster.server) {
    console.error(chalk.red(`❌ Invalid kubeconfig: no cluster server found in context '${context}'`));
    return;
  }

  const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
  const watch = new k8s.Watch(kc);

  let pods = [];
  let nodes = [];

  function clearScreen() {
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
  }

  async function fetchClusterInfo() {
    try {
      const nodeRes = await k8sApi.listNode();
      nodes = nodeRes.body.items.map((n) => n.metadata.name);
    } catch {
      nodes = [];
    }
  }

  function renderPods() {
    clearScreen();

    console.log(chalk.bold.green('🧩 Goblin Mode - K3s Pod Watcher\n'));
    console.log(
      chalk.cyanBright(`🌐 Cluster:`),
      chalk.white(cluster.name || 'default'),
      chalk.dim(`(${cluster.server})`)
    );
    console.log(chalk.cyanBright(`🖥️  Nodes:`), chalk.white(nodes.length || 'Unknown'), '\n');

    if (!pods.length) {
      console.log(chalk.dim('No pods found in this namespace.\n'));
      return;
    }

    const table = new Table({
      head: ['Namespace', 'Pod', 'Status', 'Restarts', 'Node'],
      style: { head: ['cyan'] },
    });

    for (const pod of pods) {
      const status = pod.status?.phase || 'Unknown';
      const color =
        status === 'Running'
          ? chalk.green
          : status === 'Pending'
          ? chalk.yellow
          : chalk.red;
      const restarts = pod.status?.containerStatuses?.[0]?.restartCount ?? 0;

      table.push([
        pod.metadata.namespace,
        pod.metadata.name,
        color(status),
        restarts,
        pod.spec.nodeName || '',
      ]);
    }

    console.log(table.toString());
    console.log(chalk.dim('\nPress Ctrl+C to exit.'));
  }

  try {
    await fetchClusterInfo();
    const res = await k8sApi.listPodForAllNamespaces();
    pods = res.body?.items || [];
    renderPods();
  } catch (err) {
    console.error(chalk.red('❌ Failed to fetch pods:'), err.message);
    return;
  }

  watch.watch(
    '/api/v1/pods',
    {},
    (type, obj) => {
      if (!obj || !obj.metadata) return;

      if (type === 'ADDED') pods.push(obj);
      if (type === 'DELETED')
        pods = pods.filter((p) => p.metadata.uid !== obj.metadata.uid);
      if (type === 'MODIFIED')
        pods = pods.map((p) =>
          p.metadata.uid === obj.metadata.uid ? obj : p
        );

      if (namespace)
        pods = pods.filter((p) => p.metadata.namespace === namespace);

      renderPods();
    },
    (err) => {
      console.error(chalk.red('⚠️  Watch stream error:'), err.message);
      console.log(chalk.yellow('Reconnecting in 5 seconds...'));
      setTimeout(() => watchPods({ namespace }), 5000);
    }
  );
}

