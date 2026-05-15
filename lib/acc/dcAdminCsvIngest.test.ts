import { describe, it, expect } from 'vitest';
// Placeholder — Wave 1 (plan 08-05) implements lib/acc/dcAdminCsvIngest.ts
// Covers requirements:
//   DC8-05: new AccDc* Prisma models (16 admin/permission snapshot tables)
//   DC8-06: full-replace per snapshot in a single Prisma $transaction

describe('dcAdminCsvIngest', () => {
  it('exports ingestAdminCsvSnapshot that wraps full-replace in $transaction (DC8-05, DC8-06)', () => {
    // Wave 1 will:
    //   import { ingestAdminCsvSnapshot } from './dcAdminCsvIngest';
    //   - mocked Prisma tx: deleteMany + createMany invoked for each of 16 AccDc* tables
    //   - throwing inside the tx (anomaly) rolls back ALL 16 tables (no partial snapshot)
    //   - dashboard never sees an empty intermediate state
    expect.fail('NOT YET IMPLEMENTED — Wave 1 plan 08-05 ships lib/acc/dcAdminCsvIngest.ts');
  });
});
