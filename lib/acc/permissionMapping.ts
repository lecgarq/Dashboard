/**
 * permissionMapping.ts
 *
 * Single source of truth for ACC `actions[]` → UI tier label.
 * Pure module — no I/O, no React, no DB imports.
 *
 * Consumed by:
 *  - lib/acc/folderCrawl.ts  (Plan 04): calls mapActions() at ingest
 *  - FolderPermissionsWidget  (Plan 06): imports PermTier for cell rendering
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Aligned to ACC's actual folder-permission picker (View / Create / Edit / Manage
// groups), including the "Publish markups" level. Classification stays
// "highest-capability" (NOT strict subset nesting) so real-world rows that hold
// upload/edit without an explicit PUBLISH_MARKUP keep their true level.
export type PermTier =
  | "View Only"
  | "View+Download"
  | "View+Download+Publish markups"
  | "View+Download+Publish markups+Upload"
  | "View+Download+Publish markups+Upload+Edit"
  | "Full administrative controls";

export interface MapActionsResult {
  /** The best-match tier, or null when no tier can be satisfied. */
  tier: PermTier | null;
  /** True when one or more KNOWN actions in the input are NOT part of the matched tier. */
  extended: boolean;
  /** Known actions present in the input that exceed the matched tier's required set. */
  extendedActions: string[];
  /** Actions not recognised in KNOWN_ACTIONS (ignored during mapping). */
  unknownActions: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Complete set of actions documented by the ACC Folder Permissions API.
 * Any action NOT in this set is treated as unknown and logged as a warning.
 */
const KNOWN_ACTIONS = new Set([
  "VIEW",
  "DOWNLOAD",
  "COLLABORATE",
  "PUBLISH",
  "PUBLISH_MARKUP",
  "EDIT",
  "CONTROL",
]);

/**
 * Tier definitions ordered highest → lowest.
 *
 * mapActions() iterates this array and picks the FIRST tier whose entire
 * action set is covered by the input's known actions (round-down semantics).
 */
export const TIER_DEFINITIONS: ReadonlyArray<{
  tier: PermTier;
  actions: ReadonlySet<string>;
}> = [
  {
    tier: "Full administrative controls",
    actions: new Set(["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH", "EDIT", "CONTROL"]),
  },
  {
    tier: "View+Download+Publish markups+Upload+Edit",
    actions: new Set(["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH", "EDIT"]),
  },
  {
    tier: "View+Download+Publish markups+Upload",
    actions: new Set(["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH"]),
  },
  {
    // Markups (PUBLISH_MARKUP) granted, but no upload (PUBLISH).
    tier: "View+Download+Publish markups",
    actions: new Set(["VIEW", "DOWNLOAD", "COLLABORATE", "PUBLISH_MARKUP"]),
  },
  {
    tier: "View+Download",
    actions: new Set(["VIEW", "DOWNLOAD", "COLLABORATE"]),
  },
  {
    tier: "View Only",
    actions: new Set(["VIEW", "COLLABORATE"]),
  },
] as const;

// ---------------------------------------------------------------------------
// Pure mapping function
// ---------------------------------------------------------------------------

/**
 * Maps a raw ACC `actions` array to the best-matching UI permission tier.
 *
 * Rules:
 * 1. Unknown actions are logged (console.warn) and discarded.
 * 2. The highest tier whose full action set is covered by the known inputs wins.
 * 3. Any known input actions beyond the matched tier → extended=true.
 * 4. If no tier matches (e.g. empty input, or only unrecognised action), tier=null.
 *
 * This function never throws.
 */
export function mapActions(rawActions: string[]): MapActionsResult {
  // --- Step 1: Partition into known / unknown ---
  const known: string[] = [];
  const unknown: string[] = [];

  for (const action of rawActions) {
    if (KNOWN_ACTIONS.has(action)) {
      known.push(action);
    } else {
      unknown.push(action);
    }
  }

  // --- Step 2: Warn on unknown actions ---
  if (unknown.length > 0) {
    console.warn(
      `[permission-mapping] Unknown ACC actions (ignored): ${unknown.join(", ")}`
    );
  }

  // --- Step 3: Build a Set for O(1) lookup ---
  const knownSet = new Set(known);

  // --- Step 4: Find first tier fully covered by knownSet (highest → lowest) ---
  for (const def of TIER_DEFINITIONS) {
    let allPresent = true;
    for (const required of def.actions) {
      if (!knownSet.has(required)) {
        allPresent = false;
        break;
      }
    }

    if (allPresent) {
      // Compute extended actions: known inputs NOT in this tier's required set
      const extendedActions = known.filter((a) => !def.actions.has(a));
      return {
        tier: def.tier,
        extended: extendedActions.length > 0,
        extendedActions,
        unknownActions: unknown,
      };
    }
  }

  // --- Step 5: No tier matched ---
  return {
    tier: null,
    extended: false,
    extendedActions: [],
    unknownActions: unknown,
  };
}
