import { describe, it, expect } from 'vitest';
// Placeholder — Wave 1 (plan 08-02) implements lib/acc/dcKnownBots.ts
// Covers requirement DC8-02: drop system-actor rows at parse boundary via known-bot constant.

describe('dcKnownBots', () => {
  it('exports isBotActor that filters known system actors (DC8-02)', () => {
    // Wave 1 will:
    //   import { isBotActor, KNOWN_BOT_NAMES } from './dcKnownBots';
    //   expect(isBotActor({ name: 'Autodesk Cloud Worker' })).toBe(true);
    //   expect(isBotActor({ name: 'Construction Cloud Sync' })).toBe(true);
    //   expect(isBotActor({ name: 'Jane Doe' })).toBe(false);
    expect.fail('NOT YET IMPLEMENTED — Wave 1 plan 08-02 ships lib/acc/dcKnownBots.ts');
  });
});
