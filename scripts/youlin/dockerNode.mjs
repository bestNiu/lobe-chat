// Host-side coordinator. Usage: dockerNode.mjs [--cwd=packages/database] -- command args...
// Or: dockerNode.mjs --check --lint --test explicit/files...
import { randomUUID } from 'node:crypto';

import {
  createNodeContainer,
  localDocker,
  removeContainer,
  runContainer,
} from './dockerRuntime.mjs';

const args = process.argv.slice(2);
const documents = args[0] === '--docs';
if (documents) args.shift();
let workdir = '/workspace';
if (args[0]?.startsWith('--cwd=')) {
  const relative = args.shift().slice('--cwd='.length);
  if (relative.startsWith('/') || relative.split('/').includes('..'))
    throw new Error('Invalid working directory');
  workdir += `/${relative}`;
}
if (!['--', '--check'].includes(args[0])) throw new Error('Expected --check or -- command');
const checking = args[0] === '--check';
if (checking && workdir !== '/workspace') throw new Error('Check must run from workspace root');
const files = checking ? args.slice(1).filter((arg) => !arg.startsWith('-')) : [];
const docker = await localDocker();
const name = `youlin-command-${randomUUID()}`;
let interrupted = false;
const interrupt = () => {
  interrupted = true;
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  await createNodeContainer(docker, {
    name,
    workdir,
    gitMetadata: checking,
    documents,
    writableFiles: checking && (!args.includes('--test') || args.includes('--lint')) ? files : [],
    memoryMiB: checking ? 4096 : 2048,
    args: ['/workspace/scripts/youlin/dockerCommand.mjs', ...args],
  });
  if (interrupted) throw new Error('Interrupted before container start');
  const result = await runContainer(docker, name, () => interrupted, 90_000);
  if (result.exitCode !== 0 || result.oomKilled || interrupted) process.exitCode = 1;
} catch (error) {
  console.error('Container command coordinator failed:', error);
  process.exitCode = 1;
} finally {
  try {
    await removeContainer(docker, name);
    console.log('Command container cleanup: verified');
  } catch (error) {
    console.error(`Inspect only ${name}:`, error);
    process.exitCode = 1;
  }
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
