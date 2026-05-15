import { describe, it, expect } from 'vitest';
// Placeholder — Wave 2 (plan 08-06) implements lib/acc/dcIngest.ts
// Covers requirement DC8-10: kill-switch flag file `.dc-ingest.disabled` at project root.

describe('dcIngest', () => {
  it('exports runDcIngest that early-exits when kill-switch file exists (DC8-10)', () => {
    // Wave 2 will:
    //   import { runDcIngest } from './dcIngest';
    //   - mock fs.existsSync('.dc-ingest.disabled') → true
    //   - runDcIngest() returns immediately with status='skipped', no APS calls
    //   - mock false → orchestrator proceeds through admin + activity ingest
    expect.fail('NOT YET IMPLEMENTED — Wave 2 plan 08-06 ships lib/acc/dcIngest.ts');
  });
});
