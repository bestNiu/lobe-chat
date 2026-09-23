import { and, eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import { experimentalSubjectStates as states } from './schema';
import type { ExperimentalRevocationState, ExperimentalSubjectRef } from './types';

/**
 * Internal read-only prototype. Caller derives subject from verified identity.
 * A DB primary/current-snapshot connection is required; this function cannot
 * establish replica freshness or turn a request-body subject into a trusted one.
 * No production schema export, route or Session wiring exists.
 */
export const createExperimentalRevocationReader =
  <T extends PgQueryResultHKT>(db: Pick<PgDatabase<T>, 'select'>) =>
  async (
    subject: Readonly<ExperimentalSubjectRef>,
    signal: AbortSignal,
  ): Promise<ExperimentalRevocationState | null> => {
    signal.throwIfAborted();
    // Snapshot the binding before asynchronous IO. Never cache a successful read.
    const { id, kind } = subject;
    const [row] = await db
      .select({
        authEpoch: states.authEpoch,
        disabled: states.disabled,
        sourceVersion: states.sourceVersion,
        subjectId: states.subjectId,
        subjectKind: states.subjectKind,
      })
      .from(states)
      .where(and(eq(states.subjectKind, kind), eq(states.subjectId, id)))
      .limit(1);
    signal.throwIfAborted();
    if (!row) return null;
    if (
      row.subjectId !== id ||
      row.subjectKind !== kind ||
      !Number.isSafeInteger(row.authEpoch) ||
      row.authEpoch < 0 ||
      !Number.isSafeInteger(row.sourceVersion) ||
      row.sourceVersion < 0 ||
      typeof row.disabled !== 'boolean'
    ) {
      throw new Error('Invalid authoritative revocation state');
    }
    return {
      authEpoch: row.authEpoch,
      disabled: row.disabled,
      sourceVersion: row.sourceVersion,
      subjectRef: { id: row.subjectId, kind: row.subjectKind },
    };
  };
