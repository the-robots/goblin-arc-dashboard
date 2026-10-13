#!/usr/bin/env node
import { Command } from 'commander';
import { watchPods } from './lib/watch.js';

const program = new Command();

program
  .name('goblin')
  .description('🧩 Goblin Mode - GitHub ARC CLI Dashboard')
  .version('1.0.0');

program
  .command('watch')
  .description('Live dashboard of pods (like htop)')
  .option('-n, --namespace <namespace>', 'Namespace filter')
  .action((opts) => watchPods(opts));

program.parse(process.argv);
