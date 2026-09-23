import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient, PoolConfig } from 'pg';
import { Pool } from 'pg';

import { createExperimentalRevocationReader } from './reader';
import type { ExperimentalOwnedReaderOptions, ExperimentalSubjectRef } from './types';

/**
 * Local, opt-in experiment. Owns its pool: external clients/transactions cannot
 * be supplied. Not a production endpoint, identity mapper or global consistency proof.
 */
export const createExperimentalOwnedReader = (options: ExperimentalOwnedReaderOptions = {}) => {
  if (options.enabled !== true) throw new Error('FEATURE_DISABLED');
  const { connection, connectionTimeoutMs, maxConnections, queryTimeoutMs, statementTimeoutMs } =
    options;
  if (
    !connection ||
    typeof connection.socketPath !== 'string' ||
    !connection.socketPath.startsWith('/') ||
    typeof connection.database !== 'string' ||
    !connection.database ||
    typeof connection.user !== 'string' ||
    !connection.user ||
    typeof connection.password !== 'string' ||
    !connection.password ||
    !Number.isInteger(connection.port) ||
    connection.port < 1 ||
    connection.port > 65535 ||
    !Number.isInteger(maxConnections) ||
    !maxConnections ||
    maxConnections < 1 ||
    maxConnections > 16 ||
    !Number.isInteger(connectionTimeoutMs) ||
    !connectionTimeoutMs ||
    connectionTimeoutMs < 1 ||
    connectionTimeoutMs > 60_000 ||
    !Number.isInteger(statementTimeoutMs) ||
    !statementTimeoutMs ||
    statementTimeoutMs < 1 ||
    statementTimeoutMs > 60_000 ||
    !Number.isInteger(queryTimeoutMs) ||
    !queryTimeoutMs ||
    queryTimeoutMs <= statementTimeoutMs ||
    queryTimeoutMs > 120_000
  ) {
    throw new Error('NOT_CONFIGURED');
  }
  // Enumerate and snapshot every field: no caller-supplied pool, session options,
  // URL parser, ambient credentials, or mutable connection object is retained.
  // pg 8.x treats empty strings/false as missing for several fields. Use
  // nonempty explicit settings, including the runtime-supported replication
  // startup option (not currently declared in @types/pg).
  const poolConfig: PoolConfig & { replication: string } = {
    host: connection.socketPath,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    port: connection.port,
    ssl: false,
    application_name: 'youlin-owned-reader',
    max: maxConnections,
    connectionTimeoutMillis: connectionTimeoutMs,
    statement_timeout: statementTimeoutMs,
    query_timeout: queryTimeoutMs,
    idle_in_transaction_session_timeout: queryTimeoutMs,
    lock_timeout: 0,
    options: '-c default_transaction_read_only=on',
    sslnegotiation: 'postgres',
    client_encoding: 'utf8',
    replication: 'false',
  };
  const pool = new Pool(poolConfig);
  pool.on('error', () => {
    console.error('[YoulinSecurity] Owned reader idle connection failed');
  });
  let closed = false;
  let active = 0;
  let closing: Promise<void> | undefined;

  const readAuthoritativeState = async (
    subject: Readonly<ExperimentalSubjectRef>,
    signal: AbortSignal,
  ) => {
    signal.throwIfAborted();
    if (closed) throw new Error('READER_CLOSED');
    if (active >= maxConnections) throw new Error('READER_BUSY');
    const binding = { id: subject.id, kind: subject.kind };
    // Includes acquisition, SQL and cleanup. Caller abort does NOT free capacity
    // while underlying IO is still running; excess calls are rejected, not queued.
    active++;
    let client: PoolClient | undefined;
    let reusable = false;
    let clientFailed = false;
    const onClientError = () => {
      clientFailed = true;
      console.error('[YoulinSecurity] Owned reader leased connection failed');
    };
    const check = () => {
      signal.throwIfAborted();
      if (closed || clientFailed) throw new Error('READER_UNAVAILABLE');
    };
    try {
      client = await pool.connect();
      client.on('error', onClientError);
      check();
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');
      check();
      const settings = await client.query<{
        isolation: string;
        read_only: string;
        recovering: boolean;
      }>(
        "SELECT current_setting('transaction_isolation') AS isolation, current_setting('transaction_read_only') AS read_only, pg_is_in_recovery() AS recovering",
      );
      const current = settings.rows[0];
      if (
        !current ||
        current.isolation !== 'read committed' ||
        current.read_only !== 'on' ||
        current.recovering !== false
      ) {
        throw new Error('UNSUPPORTED_READ_CONNECTION');
      }
      check();
      const state = await createExperimentalRevocationReader(drizzle(client))(binding, signal);
      check();
      await client.query('ROLLBACK'); // Read-only transaction; never return an open transaction to the pool.
      reusable = true;
      check();
      return state;
    } finally {
      try {
        if (client) {
          client.removeListener('error', onClientError);
          // Any error/timeout/abort before transaction cleanup destroys the lease.
          client.release(!reusable || clientFailed);
        }
      } finally {
        active--;
      }
    }
  };

  const close = () => {
    closed = true;
    closing ??= pool.end();
    return closing;
  };
  return { close, readAuthoritativeState };
};
