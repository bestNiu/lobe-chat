// Dependency-free fallback only; does not replace Vitest/lint/type checks.
import { test } from 'node:test';

import { registerRevocationGateTests } from '../../apps/server/src/modules/YoulinSecurity/__tests__/revocationGate.cases.mjs';

registerRevocationGateTests(test);
