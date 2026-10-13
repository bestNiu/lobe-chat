export interface ModelAccess {
  grants: Array<{
    enabled: boolean;
    model: string;
    monthlyTokenLimit: null | number;
    provider: null | string;
  }>;
  quota: { monthlyTotalTokenLimit: null | number } | null;
  usage: { periodId: string; totalTokens: number };
  userId: string;
}

export interface ManualUser {
  authEpoch: number;
  authorityVersion: number;
  displayName: null | string;
  email: null | string;
  employeeNumber: string;
  status: string;
  subjectId: string;
  userId: string;
}

export interface ManualUserPage {
  canProvision: boolean;
  items: ManualUser[];
  nextCursor: null | string;
}

export interface ProvisionInput {
  displayName?: string;
  email: string;
  employeeNumber: string;
  idempotencyKey: string;
  initialPassword: string;
}

export class AdminRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

const endpoint = '/webapi/youlin/admin/model-access';
const usersEndpoint = '/webapi/youlin/admin/users';

const parse = async <T>(request: Promise<Response>): Promise<T> => {
  const response = await request;
  if (!response.ok) {
    const body: { code?: string } = await response.json();
    throw new AdminRequestError(response.status, body.code ?? 'OPERATION_UNCONFIRMED');
  }
  return response.json() as Promise<T>;
};

export const youlinAdminService = {
  listUsers: (filter: { cursor?: string; employeeNumber?: string; userId?: string } = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filter)) if (value) params.set(key, value);
    return parse<ManualUserPage>(
      fetch(`${usersEndpoint}?${params}`, { credentials: 'same-origin' }),
    );
  },
  createUser: (input: ProvisionInput) =>
    parse<{ status: string; subjectId: string }>(
      fetch(usersEndpoint, {
        body: JSON.stringify({ action: 'create', ...input }),
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    ),
  disableUser: (input: {
    expectedAuthEpoch: number;
    expectedAuthorityVersion: number;
    idempotencyKey: string;
    subjectId: string;
  }) =>
    parse<{ status: string; subjectId: string }>(
      fetch(usersEndpoint, {
        body: JSON.stringify({ action: 'disable', ...input }),
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    ),
  getAccess: (userId?: string) =>
    parse<ModelAccess>(
      fetch(userId ? `${endpoint}?${new URLSearchParams({ userId })}` : endpoint, {
        credentials: 'same-origin',
      }),
    ),
  setGrant: (input: {
    enabled: boolean;
    model: string;
    monthlyTokenLimit: null | number;
    provider?: string;
    userId: string;
  }) => {
    const { userId, ...grant } = input;
    return parse<unknown>(
      fetch(endpoint, {
        body: JSON.stringify({ grant, userId }),
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      }),
    );
  },
  setQuota: (userId: string, monthlyTotalTokenLimit: null | number) =>
    parse<unknown>(
      fetch(endpoint, {
        body: JSON.stringify({ quota: { monthlyTotalTokenLimit }, userId }),
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      }),
    ),
};
