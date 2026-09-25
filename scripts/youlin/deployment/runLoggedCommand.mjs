import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { open } from 'node:fs/promises';

/** Bounded host orchestration with private logs; does not execute test assertions on host. */
export const runLoggedCommand = async (file, args, { logPath, timeoutMs, signal, env }) => {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 900_000)
    throw new Error('INVALID_COMMAND_DEADLINE');
  signal?.throwIfAborted();
  const log = await open(logPath, 'wx', 0o600);
  let timer;
  let killTimer;
  let stop;
  let timedOut = false;
  try {
    signal?.throwIfAborted();
    const child = spawn(file, args, { env, stdio: ['ignore', log.fd, log.fd] });
    let stopping = false;
    stop = () => {
      if (stopping) return;
      stopping = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    };
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    const [code, exitSignal] = await once(child, 'exit');
    return { aborted: signal?.aborted ?? false, code, signal: exitSignal, timedOut };
  } finally {
    clearTimeout(timer);
    clearTimeout(killTimer);
    if (stop) signal?.removeEventListener('abort', stop);
    await log.close();
  }
};
