// In-container command entry. No host credentials or Git metadata are used.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

const [mode, ...args] = process.argv.slice(2);
const run = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) console.error('Container command failed:', result.error);
  return result.status ?? 1;
};

if (mode === '--check') {
  if (
    !args.some((arg) => !arg.startsWith('-')) ||
    args.includes('--type') ||
    args.includes('--staged')
  ) {
    throw new Error(
      'Container check requires explicit files; whole-repo types use rootTypecheck.mjs',
    );
  }
  // Empty disposable metadata satisfies the check entrypoint's checkout guard.
  // It does NOT provide history, baseline diff or new-file Git advisories.
  if (
    run('git', ['config', '--global', '--add', 'safe.directory', '/workspace']) ||
    run('git', ['init', '--quiet', '/workspace'])
  ) {
    throw new Error('Could not initialize disposable checkout metadata');
  }
  const bunDir = '/workspace/scripts/youlin/toolchain/node_modules/@oven/bun-linux-x64/bin';
  process.env.PATH = `${bunDir}:${process.env.PATH}`;
  console.log(
    'Explicit-file check only: disposable empty Git metadata; no baseline/diff verification',
  );
  process.exitCode = run(`${bunDir}/bun`, ['run', 'check', ...args]);
  for (const file of readdirSync('/tmp').filter(
    (name) => name.startsWith('check-autofix-') && name.endsWith('.diff'),
  )) {
    console.log(`Container autofix evidence: ${file}\n${readFileSync(`/tmp/${file}`, 'utf8')}`);
  }
} else if (mode === '--') {
  if (!args.length) throw new Error('Supply an explicit command');
  process.exitCode = run(args[0], args.slice(1));
} else throw new Error('Expected --check or --');
