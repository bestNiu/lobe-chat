// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createExperimentalOwnedReader } from '../ownedReader';
import type { ExperimentalOwnedReaderOptions } from '../types';

const options = (): ExperimentalOwnedReaderOptions => ({
  enabled: true,
  connection: {
    socketPath: '/tmp/unused-youlin-socket',
    port: 5432,
    user: 'synthetic',
    database: 'synthetic',
    password: 'synthetic',
  },
  maxConnections: 1,
  connectionTimeoutMs: 500,
  statementTimeoutMs: 500,
  queryTimeoutMs: 1000,
});

describe('owned reader configuration without database IO', () => {
  it('defaults off and requires complete explicit configuration', () => {
    expect(() => createExperimentalOwnedReader()).toThrow('FEATURE_DISABLED');
    expect(() => createExperimentalOwnedReader({ enabled: true })).toThrow('NOT_CONFIGURED');
  });

  it.each([
    { maxConnections: 0 },
    { maxConnections: 17 },
    { maxConnections: 1.5 },
    { connectionTimeoutMs: 0 },
    { statementTimeoutMs: Number.POSITIVE_INFINITY },
    { queryTimeoutMs: 500 },
    { queryTimeoutMs: 120001 },
  ])('rejects invalid resource budgets %j', (patch) => {
    expect(() => createExperimentalOwnedReader({ ...options(), ...patch })).toThrow(
      'NOT_CONFIGURED',
    );
  });

  it('rejects an empty password rather than allowing pg to fall back to ambient credentials', () => {
    const config = options();
    if (!config.connection) throw new Error('Missing fixture connection');
    config.connection.password = '';
    expect(() => createExperimentalOwnedReader(config)).toThrow('NOT_CONFIGURED');
  });

  it('does not accept a TCP endpoint through the local socket contract', () => {
    const config = options();
    if (!config.connection) throw new Error('Missing fixture connection');
    config.connection.socketPath = '127.0.0.1';
    expect(() => createExperimentalOwnedReader(config)).toThrow('NOT_CONFIGURED');
  });

  it('rejects pre-aborted reads and all reads after idempotent close without connecting', async () => {
    const reader = createExperimentalOwnedReader(options());
    const abort = new AbortController();
    abort.abort();
    try {
      await expect(
        reader.readAuthoritativeState({ id: 'synthetic', kind: 'user' }, abort.signal),
      ).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      await reader.close();
    }
    await reader.close();
    await expect(
      reader.readAuthoritativeState(
        { id: 'synthetic', kind: 'user' },
        new AbortController().signal,
      ),
    ).rejects.toThrow('READER_CLOSED');
  });
});
