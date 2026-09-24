/** Server-side domain types. bigint amounts are USD millionths, never floating point dollars.
 * These are NOT browser DTOs. A persistent adapter must serialize money explicitly.
 */
export interface YoulinModelPrice {
  cachedInputMicroUsdPerMillion: bigint;
  inputMicroUsdPerMillion: bigint;
  outputMicroUsdPerMillion: bigint;
  requestMicroUsd: bigint;
  version: string;
}

export interface YoulinModelGrant {
  maxInputTokens: number;
  maxOutputTokens: number;
  modelId: string;
  /** Missing price means unavailable, not free. Explicit zero rates are allowed. */
  price?: Readonly<YoulinModelPrice>;
}

export interface YoulinModelAccessPolicy {
  enabled: boolean;
  enterpriseId: string;
  models: readonly Readonly<YoulinModelGrant>[];
  /** Authoritative user-scoped freeze, surviving calendar rollover. */
  spendingFrozen: boolean;
  userId: string;
}

export interface YoulinModelBudgetAccount {
  enterpriseId: string;
  frozen: boolean;
  limitMicroUsd: bigint;
  period: string;
  reservedMicroUsd: bigint;
  spentMicroUsd: bigint;
  userId: string;
}

export interface YoulinModelReservationRequest {
  id: string;
  /** Trusted upper bound including all system/tool/history input, NOT a client estimate. */
  inputTokenBound: number;
  maxOutputTokens: number;
  modelId: string;
  /** Server-generated digest of the effective request, including model, tools and limits. */
  payloadDigest: string;
}

export interface YoulinModelUsage {
  /** Included in inputTokens, not additional tokens. */
  cachedInputTokens: number;
  inputTokens: number;
  /** Includes all billed output, including reasoning when applicable. */
  outputTokens: number;
}

export type YoulinModelReservationState =
  'reserved' | 'in_flight' | 'uncertain' | 'settled' | 'cancelled';

export interface YoulinModelReservation extends YoulinModelReservationRequest {
  chargedMicroUsd?: bigint;
  enterpriseId: string;
  heldMicroUsd: bigint;
  period: string;
  price: Readonly<YoulinModelPrice>;
  state: YoulinModelReservationState;
  usage?: Readonly<YoulinModelUsage>;
  userId: string;
}

export const YOULIN_DEFAULT_MONTHLY_BUDGET_MICRO_USD = 20_000_000n;
