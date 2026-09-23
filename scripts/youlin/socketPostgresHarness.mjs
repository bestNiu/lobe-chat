// Container-only SQL transport. Owns no Docker API, service or volume lifecycle.
import { runProcess } from './postgresHarness.mjs';

export const createSocketPostgresHarness = async () => {
  const socket = process.env.YOULIN_NODEPG_SOCKET;
  const runId = process.env.YOULIN_NODEPG_RUN;
  if (
    !socket ||
    !/^\/tmp\/youlin-nodepg-[a-f0-9-]{36}\/socket$/.test(socket) ||
    !runId ||
    !/^[a-f0-9-]{36}$/.test(runId)
  )
    throw new Error('Dedicated synthetic socket environment required');
  const query = (sql, params = {}, signal) => {
    const values = Object.entries(params).map(([key, value]) => {
      if (!/^[a-z_]+$/.test(key)) throw new Error('Invalid fixture parameter name');
      return `--set=${key}=${String(value)}`;
    });
    return runProcess(
      'env',
      [
        '-i',
        'PATH=/usr/bin:/bin',
        'PGPASSWORD=synthetic-only',
        'PGCONNECT_TIMEOUT=2',
        'PGOPTIONS=-c statement_timeout=5000 -c lock_timeout=3000',
        'PGAPPNAME=youlin-sql-suite',
        'psql',
        '-X',
        '-qAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-h',
        socket,
        '-U',
        'postgres',
        '-d',
        'youlin_nodepg',
        ...values,
      ],
      sql,
      signal,
    );
  };
  if (
    (await query('SELECT run_id::text FROM youlin_security_spike.test_environment_marker;')) !==
    runId
  )
    throw new Error('Synthetic environment marker mismatch');
  return {
    query,
    json: async (sql, params, signal) => {
      const output = await query(sql, params, signal);
      return output === '' ? null : JSON.parse(output);
    },
    // Child processes are awaited per query; service destruction is the coordinator's job.
    cleanup: async () => {
      console.log('SQL workload complete; Docker service cleanup belongs to coordinator');
    },
  };
};
