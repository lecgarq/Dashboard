/**
 * dcKnownBots — DC8-02 known-bot filter applied at the CSV parse boundary.
 *
 * Pure module: no Prisma, no fetch, no fs. Plan 08-04 (dcActivityCsvIngest)
 * imports `isBotActor` to drop system-actor rows before they pollute Activity widgets.
 *
 * Bootstrap names per RESEARCH.md Example 2. KNOWN_BOT_AUTODESK_IDS starts empty —
 * operators may extend at runtime when an APS-side bot user is identified by ID
 * but ships under a varying display name.
 */

export const KNOWN_BOT_NAMES: Set<string> = new Set([
  'Autodesk Cloud Worker',
  'Construction Cloud Sync',
  'BIM 360 System',
  'ACC System',
  'Autodesk Insight',
  'Autodesk Service Account',
]);

export const KNOWN_BOT_AUTODESK_IDS: Set<string> = new Set();

export interface BotActorCandidate {
  name?: string | null;
  autodeskId?: string | null;
}

export function isBotActor(actor: BotActorCandidate): boolean {
  if (actor.autodeskId && KNOWN_BOT_AUTODESK_IDS.has(actor.autodeskId)) {
    return true;
  }
  if (actor.name && KNOWN_BOT_NAMES.has(actor.name)) {
    return true;
  }
  return false;
}
