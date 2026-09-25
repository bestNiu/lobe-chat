/** Administrator-maintained admission vocabulary; this is not an HR snapshot or IdP account. */
export const youlinManualEnrollmentStatuses = ['pending', 'active', 'disabled'] as const;
export type YoulinManualEnrollmentStatus = (typeof youlinManualEnrollmentStatuses)[number];

export type YoulinManualEnrollmentReservation = {
  /** Canonical, uppercase ASCII identifier. Reserved permanently within the enterprise. */
  employeeNumber: string;
} & ({ userId: string } | { displayName?: string; email: string });

export type YoulinManualProviderWorkClaim =
  | { kind: 'claimed'; workId: string }
  | { kind: 'completed'; principalId: string; subjectId: string };

/** Internal current-state projection; not a grant or an authentication result. */
export interface YoulinManualProvisioningState {
  activeBindingCount: number;
  authEpoch: number;
  authorityVersion: number;
  externalSubject: string;
  idpRevocationConfirmedEpoch: number | null;
  issuer: string;
  nativeAccountMatches: boolean;
  status: 'active' | 'disabled' | 'pending';
  subjectId: string;
}

export interface YoulinManualEnrollmentAuthorityChange {
  expectedAuthEpoch: number;
  expectedAuthorityVersion: number;
  subjectId: string;
}
