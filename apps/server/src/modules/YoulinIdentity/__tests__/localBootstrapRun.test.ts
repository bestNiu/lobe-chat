// Ceremonial runner for the PRIVATE offline first-administrator bootstrap.
// Skipped everywhere except the bounded, read-only container started by
// scripts/youlin/deployment/localInstance.mjs bootstrap; it is not a regression test
// and never runs against a synthetic fixture database.
import { describe, expect, it } from 'vitest';

import { main } from '../localBootstrapCli';

describe.skipIf(process.env.YOULIN_BOOTSTRAP_RUN !== '1')('local bootstrap ceremony', () => {
  it('initializes the trust root, provisions the first administrator and retires the bootstrap service', async () => {
    const outcome = await main();
    // The password is never returned, logged or written outside its 0600 source file.
    expect(JSON.stringify(outcome)).not.toContain('initialPassword');
    expect(outcome.privatePasswordPrinted).toBe(false);
    expect(outcome.browserLoginVerified).toBe(false);
    expect(['assigned', 'completed']).toContain(outcome.result);
  }, 240_000);
});
