/** Experimental K01 subset; not the canonical enterprise identity registry. */
export type ExperimentalSubjectKind = 'service' | 'user';

export interface ExperimentalSubjectRef {
  id: string;
  kind: ExperimentalSubjectKind;
}

/** Local socket experiment only; all connection fields and budgets are explicit. */
export interface ExperimentalOwnedReaderOptions {
  connection?: {
    database: string;
    password: string;
    port: number;
    socketPath: string;
    user: string;
  };
  connectionTimeoutMs?: number;
  enabled?: boolean;
  maxConnections?: number;
  queryTimeoutMs?: number;
  statementTimeoutMs?: number;
}

export interface ExperimentalRevocationState {
  authEpoch: number;
  disabled: boolean;
  sourceVersion: number;
  subjectRef: ExperimentalSubjectRef;
}
