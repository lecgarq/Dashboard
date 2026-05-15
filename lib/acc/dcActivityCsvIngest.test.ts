import { describe, it, expect } from 'vitest';
// Placeholder — Wave 1 (plan 08-04) implements lib/acc/dcActivityCsvIngest.ts
// Covers requirements:
//   DC8-01: ingest 9 activities_<module>_activities.csv files into AccActivity with service=<module>
//   DC8-03: unknown-module guard (10th module appears → log + skip + record in run.unknownModulesSeen)

describe('dcActivityCsvIngest', () => {
  it('exports parseModuleFromFilename + ingestActivityCsv (DC8-01, DC8-03)', () => {
    // Wave 1 will:
    //   import { parseModuleFromFilename, KNOWN_MODULES } from './dcActivityCsvIngest';
    //   expect(parseModuleFromFilename('activities_docs_activities.csv')).toBe('docs');
    //   expect(parseModuleFromFilename('activities_xenoplasm_activities.csv')).toBe('xenoplasm');
    //   expect(parseModuleFromFilename('admin_users.csv')).toBe(null);
    //   ingestActivityCsv must record unknown module in runLog.unknownModulesSeen, NOT insert rows.
    expect.fail('NOT YET IMPLEMENTED — Wave 1 plan 08-04 ships lib/acc/dcActivityCsvIngest.ts');
  });
});
