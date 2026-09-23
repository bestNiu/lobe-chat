/** Experimental K01 subset; not the canonical enterprise identity registry. */
export type ExperimentalSubjectKind = 'service' | 'user';

export interface ExperimentalSubjectRef {
  id: string;
  kind: ExperimentalSubjectKind;
}

export interface ExperimentalRevocationState {
  authEpoch: number;
  disabled: boolean;
  sourceVersion: number;
  subjectRef: ExperimentalSubjectRef;
}
