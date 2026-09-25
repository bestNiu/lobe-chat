import type { YoulinManualProviderWorkClaim, YoulinManualProvisioningState } from '@lobechat/types';
import { z } from 'zod';

import type { CreateKeycloakUserInput } from './keycloakAdministration';

const version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const provisionSchema = z
  .object({
    displayName: z.string().trim().min(1).max(255).optional(),
    email: z
      .email()
      .max(320)
      .transform((value) => value.toLowerCase()),
    employeeNumber: z.string().regex(/^[A-Z0-9][A-Z0-9._:-]{0,127}$/),
    idempotencyKey: z.string().min(1).max(80),
    initialPassword: z.string().min(12).max(1024),
  })
  .strict();
const disableSchema = z
  .object({
    expectedAuthEpoch: version,
    expectedAuthorityVersion: version,
    idempotencyKey: z.string().min(1).max(80),
    subjectId: z.uuid(),
  })
  .strict();

interface CommandResult {
  authEpoch?: number;
  revocationEventId?: string;
  status: string;
  subjectId: string;
}

interface ManualEnrollmentPort {
  activate: (key: string, input: unknown) => Promise<CommandResult>;
  disable: (key: string, input: unknown) => Promise<CommandResult>;
  reserve: (key: string, input: unknown) => Promise<CommandResult>;
}

interface PrincipalLinkPort {
  link: (
    key: string,
    input: unknown,
  ) => Promise<{ bindingId: string; status: string; subjectId: string }>;
}

interface CleanupCompletionPort {
  recordCompletion: (key: string, input: unknown) => Promise<CommandResult>;
}

interface KeycloakAdministrationPort {
  cleanupSessions: (id: string) => Promise<void>;
  createDisabledUser: (input: CreateKeycloakUserInput) => Promise<{ created: boolean; id: string }>;
  getUser: (id: string) => Promise<{ enabled?: boolean; id: string }>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
}

export type ManualProvisioningState = YoulinManualProvisioningState;

export interface ManualProvisioningServiceOptions {
  cleanup: CleanupCompletionPort;
  enrollment: ManualEnrollmentPort;
  idp: KeycloakAdministrationPort;
  issuer: string;
  link: PrincipalLinkPort;
  readState: (subjectId: string) => Promise<ManualProvisioningState | null>;
  work: {
    begin: (key: string, intent: unknown) => Promise<YoulinManualProviderWorkClaim>;
    complete: (
      key: string,
      input: { principalId: string; subjectId: string; workId: string },
    ) => Promise<unknown>;
  };
}

export class ManualProvisioningError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ManualProvisioningError';
  }
}

/**
 * Local-test orchestration only. Authentication supplies both actors to the injected repositories;
 * this service creates neither actors nor sessions and is not crash-recovery infrastructure.
 * A retry must carry the original password: a tagged IdP replay never changes credentials.
 */
export class ManualProvisioningService {
  constructor(private readonly dependencies: ManualProvisioningServiceOptions) {}

  async provision(input: unknown) {
    const request = provisionSchema.parse(input);
    const key = request.idempotencyKey;
    const intent = {
      displayName: request.displayName,
      email: request.email,
      employeeNumber: request.employeeNumber,
    };
    const work = await this.dependencies.work.begin(key, intent);
    if (work.kind === 'completed') {
      if (
        !this.matchesActivation(
          await this.dependencies.readState(work.subjectId),
          work.subjectId,
          work.principalId,
        )
      )
        throw new ManualProvisioningError('ACTIVATION_STATE_UNCONFIRMED');
      const provider = await this.dependencies.idp.getUser(work.principalId);
      if (provider.id !== work.principalId || provider.enabled !== true)
        throw new ManualProvisioningError('PROVIDER_STATE_UNCONFIRMED');
      return {
        credentialStatus: 'existing_principal_password_unchanged' as const,
        principalId: work.principalId,
        status: 'activated' as const,
        subjectId: work.subjectId,
      };
    }
    let principalId: string | undefined;
    let activated = false;
    let subjectId: string | undefined;
    try {
      const reservation = await this.dependencies.enrollment.reserve(`${key}:reserve`, intent);
      if (reservation.status !== 'created' || !reservation.revocationEventId)
        throw new ManualProvisioningError('INVALID_RESERVATION_RESULT');
      subjectId = reservation.subjectId;
      const principal = await this.dependencies.idp.createDisabledUser({
        commandId: `${key}:provider`,
        email: request.email,
        employeeNumber: request.employeeNumber,
        initialPassword: request.initialPassword,
        subjectId,
      });
      if (!principal.created) {
        const existing = await this.dependencies.readState(subjectId);
        if (
          existing &&
          (existing.status !== 'pending' ||
            existing.authEpoch !== 0 ||
            existing.authorityVersion !== 0)
        )
          throw new ManualProvisioningError('PROVISIONING_STATE_CHANGED');
      }
      principalId = principal.id;
      await this.dependencies.link.link(`${key}:link`, {
        expectedAuthEpoch: 0,
        expectedAuthorityVersion: 0,
        externalSubject: principal.id,
        issuer: this.dependencies.issuer,
        subjectId,
      });
      await this.dependencies.idp.cleanupSessions(principal.id);
      await this.dependencies.cleanup.recordCompletion(`${key}:cleanup`, {
        expectedAuthEpoch: 0,
        revocationEventId: reservation.revocationEventId,
      });
      await this.dependencies.enrollment.activate(`${key}:activate`, {
        expectedAuthEpoch: 0,
        expectedAuthorityVersion: 0,
        subjectId,
      });
      activated = true;
      const state = await this.dependencies.readState(subjectId);
      if (!this.matchesActivation(state, subjectId, principal.id))
        throw new ManualProvisioningError('ACTIVATION_STATE_UNCONFIRMED');
      await this.dependencies.idp.setEnabled(principal.id, true);
      // Catch revocation committed during provider IO. Process-death/unknown provider outcomes
      // still need receipt-driven reconciliation; native-session authorization remains deny-first.
      if (
        !this.matchesActivation(
          await this.dependencies.readState(subjectId),
          subjectId,
          principal.id,
        )
      )
        throw new ManualProvisioningError('ACTIVATION_STATE_UNCONFIRMED');
      await this.dependencies.work.complete(key, {
        principalId: principal.id,
        subjectId,
        workId: work.workId,
      });
      return {
        credentialStatus: principal.created
          ? ('created_with_initial_password' as const)
          : ('existing_principal_password_unchanged' as const),
        principalId: principal.id,
        status: 'activated' as const,
        subjectId,
      };
    } catch (error) {
      let denyUnconfirmed = false;
      if (activated && subjectId) {
        try {
          await this.dependencies.enrollment.disable(`${key}:enable-failure-deny`, {
            expectedAuthEpoch: 0,
            expectedAuthorityVersion: 1,
            subjectId,
          });
        } catch {
          denyUnconfirmed = true;
        }
      }
      if (principalId) {
        try {
          await this.dependencies.idp.setEnabled(principalId, false);
        } catch {
          throw new ManualProvisioningError('PROVIDER_DISABLE_UNCONFIRMED');
        }
      }
      if (denyUnconfirmed) throw new ManualProvisioningError('DENY_COMPENSATION_UNCONFIRMED');
      throw error;
    }
  }

  private matchesActivation(
    state: ManualProvisioningState | null,
    subjectId: string,
    principalId: string,
  ) {
    return (
      state?.subjectId === subjectId &&
      state.status === 'active' &&
      state.authEpoch === 0 &&
      state.authorityVersion === 1 &&
      state.idpRevocationConfirmedEpoch === 0 &&
      state.activeBindingCount === 1 &&
      state.nativeAccountMatches === true &&
      state.issuer === this.dependencies.issuer &&
      state.externalSubject === principalId
    );
  }

  async disable(input: unknown) {
    const request = disableSchema.parse(input);
    const denied = await this.dependencies.enrollment.disable(`${request.idempotencyKey}:deny`, {
      expectedAuthEpoch: request.expectedAuthEpoch,
      expectedAuthorityVersion: request.expectedAuthorityVersion,
      subjectId: request.subjectId,
    });
    const state = await this.dependencies.readState(request.subjectId);
    if (
      !state ||
      state.status !== 'disabled' ||
      state.authEpoch !== denied.authEpoch ||
      !denied.revocationEventId ||
      state.activeBindingCount !== 1 ||
      state.nativeAccountMatches !== true ||
      state.issuer !== this.dependencies.issuer
    )
      throw new ManualProvisioningError('DENIED_STATE_UNCONFIRMED');
    await this.dependencies.idp.setEnabled(state.externalSubject, false);
    await this.dependencies.idp.cleanupSessions(state.externalSubject);
    await this.dependencies.cleanup.recordCompletion(`${request.idempotencyKey}:disable-cleanup`, {
      expectedAuthEpoch: denied.authEpoch,
      revocationEventId: denied.revocationEventId,
    });
    return {
      authEpoch: denied.authEpoch,
      status: 'disabled' as const,
      subjectId: request.subjectId,
    };
  }
}
