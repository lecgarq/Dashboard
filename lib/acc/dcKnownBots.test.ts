import { describe, it, expect } from 'vitest';
import {
  isBotActor,
  KNOWN_BOT_NAMES,
  KNOWN_BOT_AUTODESK_IDS,
} from './dcKnownBots';

// Covers requirement DC8-02: drop system-actor rows at parse boundary via known-bot constant.

describe('dcKnownBots', () => {
  it('returns true for Autodesk Cloud Worker', () => {
    expect(isBotActor({ name: 'Autodesk Cloud Worker' })).toBe(true);
  });

  it('returns true for Construction Cloud Sync', () => {
    expect(isBotActor({ name: 'Construction Cloud Sync' })).toBe(true);
  });

  it('returns true for BIM 360 System', () => {
    expect(isBotActor({ name: 'BIM 360 System' })).toBe(true);
  });

  it('returns true for ACC System', () => {
    expect(isBotActor({ name: 'ACC System' })).toBe(true);
  });

  it('returns false for a real human name (Luis Cortes)', () => {
    expect(isBotActor({ name: 'Luis Cortes' })).toBe(false);
  });

  it('returns false when name is null and no autodeskId match', () => {
    expect(isBotActor({ name: null })).toBe(false);
  });

  it('returns true when autodeskId is in KNOWN_BOT_AUTODESK_IDS', () => {
    KNOWN_BOT_AUTODESK_IDS.add('BOT123');
    try {
      expect(isBotActor({ autodeskId: 'BOT123', name: null })).toBe(true);
    } finally {
      KNOWN_BOT_AUTODESK_IDS.delete('BOT123');
    }
  });

  it('returns false when autodeskId is unknown and name is human', () => {
    expect(isBotActor({ autodeskId: 'USER456', name: 'Luis Cortes' })).toBe(false);
  });

  it('KNOWN_BOT_NAMES contains at least 6 bootstrap entries', () => {
    expect(KNOWN_BOT_NAMES.size).toBeGreaterThanOrEqual(6);
  });
});
