import { describe, expect, it } from 'vitest';

import {
  bindingProposalSchema,
  employmentSnapshotSchema,
  identityActorSchema,
  identityCommandResultSchema,
  identityVersionSchema,
  registerPersonSchema,
} from '../contracts';

const subjectId = '00000000-0000-4000-8000-000000000001';
const stage = {
  employeeNumber: 'YY2026001',
  legalEntityCode: 'synthetic-entity',
  sourceStageKey: 'synthetic-stage-1',
  status: 'active',
} as const;

describe('identity transport/storage contracts', () => {
  it('does not infer identity from an employee-number format or employee email', () => {
    expect(
      registerPersonSchema.parse({ personKey: 'hr-stable-person', userId: 'app-user' }),
    ).toEqual({ personKey: 'hr-stable-person', userId: 'app-user' });
    expect(
      registerPersonSchema.safeParse({ email: 'same@example.invalid', userId: 'app-user' }).success,
    ).toBe(false);
  });

  it('rejects forged actor permissions and non-numeric epochs', () => {
    expect(
      identityActorSchema.safeParse({ authEpoch: 0, roles: ['admin'], subjectId }).success,
    ).toBe(false);
    expect(identityActorSchema.safeParse({ authEpoch: '0', subjectId }).success).toBe(false);
    expect(identityActorSchema.parse({ authEpoch: 0, subjectId }).subjectId).toBe(subjectId);
  });

  it('preserves the safe-integer epoch/revision boundary', () => {
    for (const value of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])
      expect(identityVersionSchema.safeParse(value).success).toBe(false);
    expect(identityVersionSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('requires the explicit HR/legal-entity anchor for a human principal binding', () => {
    const proposal = {
      externalSubject: 'idp-subject',
      issuer: 'https://idp.example.invalid/realms/synthetic',
      legalEntityCode: 'synthetic-entity',
      personKey: 'hr-stable-person',
      subjectId,
    };
    expect(bindingProposalSchema.parse(proposal)).toEqual(proposal);
    expect(
      bindingProposalSchema.safeParse({ ...proposal, legalEntityCode: undefined }).success,
    ).toBe(false);
    expect(
      bindingProposalSchema.safeParse({ ...proposal, email: 'same@example.invalid' }).success,
    ).toBe(false);
  });

  it('bounds UTF-8 issuer size before a composite database index is written', () => {
    expect(
      bindingProposalSchema.safeParse({
        externalSubject: 'subject',
        issuer: `https://example.invalid/${'汉'.repeat(400)}`,
        legalEntityCode: 'entity',
        personKey: 'person',
        subjectId,
      }).success,
    ).toBe(false);
  });

  it('accepts an empty complete stage set but rejects duplicate stage keys', () => {
    expect(
      employmentSnapshotSchema.parse({ personKey: 'person', sourceVersion: 1, stages: [] }).stages,
    ).toEqual([]);
    expect(
      employmentSnapshotSchema.safeParse({
        personKey: 'person',
        sourceVersion: 1,
        stages: [stage, stage],
      }).success,
    ).toBe(false);
  });

  it('rejects inverted employment intervals and oversized snapshots', () => {
    const inverted = {
      ...stage,
      effectiveFrom: '2026-02-01T00:00:00Z',
      effectiveTo: '2026-01-01T00:00:00Z',
    };
    expect(
      employmentSnapshotSchema.safeParse({
        personKey: 'person',
        sourceVersion: 1,
        stages: [inverted],
      }).success,
    ).toBe(false);
    const stages = Array.from({ length: 65 }, (_, i) => ({
      ...stage,
      sourceStageKey: `stage-${i}`,
    }));
    expect(
      employmentSnapshotSchema.safeParse({ personKey: 'person', sourceVersion: 1, stages }).success,
    ).toBe(false);
  });

  it('does not accept invented allow receipts or secrets in persisted command results', () => {
    expect(identityCommandResultSchema.safeParse({ status: 'allow', subjectId }).success).toBe(
      false,
    );
    expect(
      identityCommandResultSchema.safeParse({ secret: 'synthetic', status: 'created', subjectId })
        .success,
    ).toBe(false);
    expect(
      identityCommandResultSchema.parse({ authEpoch: 2, status: 'revoked', subjectId }),
    ).toEqual({ authEpoch: 2, status: 'revoked', subjectId });
  });
});
