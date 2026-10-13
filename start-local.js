const { spawn } = require('node:child_process');
const { homedir } = require('node:os');
const path = require('node:path');

process.env.KUBECONFIG ||= path.join(homedir(), '.kube', 'goblin-k3s.yaml');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Start this launcher with npm run start:local.');
const child = spawn(process.execPath, [npmCli, 'run', 'dev'], {
  cwd: __dirname,
  env: process.env,
  stdio: 'inherit',
});
child.on('error', (error) => {
  console.error('Failed to start dashboard:', error);
  process.exitCode = 1;
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
