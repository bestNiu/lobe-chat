/** Enterprise identity vocabulary. No provider token or employee profile belongs in these types. */
export const youlinSubjectKinds = ['user', 'service'] as const;
export type YoulinSubjectKind = (typeof youlinSubjectKinds)[number];

export const youlinSubjectStatuses = ['pending', 'active', 'disabled'] as const;
export type YoulinSubjectStatus = (typeof youlinSubjectStatuses)[number];

export const youlinEmploymentStatuses = ['active', 'ended'] as const;
export type YoulinEmploymentStatus = (typeof youlinEmploymentStatuses)[number];

export const youlinBindingStatuses = ['active', 'revoked'] as const;
export type YoulinBindingStatus = (typeof youlinBindingStatuses)[number];

export const youlinIdentityPermissions = [
  'identity:provision',
  'identity:bind',
  'identity:review',
  'identity:revoke',
  'identity:activate',
  'identity:read',
  'identity:manage-service',
] as const;
export type YoulinIdentityPermission = (typeof youlinIdentityPermissions)[number];

export const youlinBindingCaseStatuses = ['pending', 'approved', 'rejected'] as const;
export type YoulinBindingCaseStatus = (typeof youlinBindingCaseStatuses)[number];

export const youlinBindingConflictReasons = [
  'principal_in_use',
  'employee_key_in_use',
  'account_in_use',
  'cross_enterprise',
  'parallel_employment',
] as const;
export type YoulinBindingConflictReason = (typeof youlinBindingConflictReasons)[number];

export const youlinOutboxStatuses = ['pending', 'leased', 'delivered', 'dead'] as const;
export type YoulinOutboxStatus = (typeof youlinOutboxStatuses)[number];

export interface YoulinSubjectRef {
  id: string;
  kind: YoulinSubjectKind;
}

/** Constructed by server authentication, never deserialized from a request's actor fields. */
export interface YoulinIdentityActor {
  authEpoch: number;
  subjectId: string;
}

export interface YoulinEmploymentStageInput {
  effectiveFrom?: string;
  effectiveTo?: string;
  employeeNumber: string;
  legalEntityCode: string;
  /** Stable stage key supplied by the trusted HR adapter, not inferred from employee number. */
  sourceStageKey: string;
  status: YoulinEmploymentStatus;
}

export interface YoulinEmploymentSnapshot {
  /** Stable person key in the configured HR source. Same name/email never establishes equality. */
  personKey: string;
  /** Canonical per-person revision, normalized by the trusted adapter without truncation. */
  sourceVersion: number;
  /** Complete stage set for this person at sourceVersion, not an unordered delta. */
  stages: YoulinEmploymentStageInput[];
}

export type YoulinIdentityCommandResult =
  | { status: 'created'; subjectId: string }
  | { bindingId: string; status: 'linked'; subjectId: string }
  | { caseId: string; status: 'conflict' }
  | { authEpoch: number; status: 'revoked' | 'employment_updated' | 'activated'; subjectId: string }
  | { caseId: string; decision: 'approved' | 'rejected'; status: 'reviewed' };

export interface YoulinBindingProposal {
  externalSubject: string;
  issuer: string;
  legalEntityCode: string;
  personKey: string;
  subjectId: string;
}

/** Minimal identifiers only; full source HR records, tokens and passwords are excluded. */
export interface YoulinIdentityAuditDetail {
  authEpoch?: number;
  bindingId?: string;
  caseId?: string;
  needsCredentialRevocation?: boolean;
  previousSubjectId?: string;
  reason?: string;
  sourceVersion?: number;
}
