import { rankForTier } from "./folderTerrainModel";

/**
 * folderInheritance.ts
 *
 * ACC stores a folder permission's `actions` only on the folder where it is
 * EXPLICITLY set. A subfolder that merely INHERITS its parent's permission comes
 * back from the permissions API as a role entry with an EMPTY actions array — so
 * the crawl floors it to "View Only" (`mapActions([]).tier ?? "View Only"`). That
 * makes inherited folders read as View-Only even when the role is, say, a Full
 * Controller on the parent ("Project Files").
 *
 * `resolveEffectiveTier` restores the real, inherited level for display: an
 * empty-actions cell defers to its parent's explicit grant; an explicit grant
 * (actions present) always keeps its own tier, since that is a deliberate
 * per-folder override — even when it is lower than the parent.
 *
 * Pure (no I/O), so the inheritance rule stays unit-testable independent of the
 * DB-backed terrain view that calls it.
 */

export interface TierGrant {
  permType: string;
  /** Number of raw ACC actions backing this grant. 0 ⇒ inherited (no explicit set). */
  actionCount: number;
}

export interface EffectiveTier {
  tier: string;
  rank: number;
  /** True when the tier was taken from the parent because this cell inherits. */
  inherited: boolean;
}

export function resolveEffectiveTier(own: TierGrant, parent: TierGrant | undefined): EffectiveTier {
  // Explicit grant on this folder — a deliberate override; never replaced.
  if (own.actionCount > 0) {
    return { tier: own.permType, rank: rankForTier(own.permType), inherited: false };
  }
  // Inherited cell (empty actions): adopt the parent's explicit grant if it has one.
  if (parent && parent.actionCount > 0) {
    return { tier: parent.permType, rank: rankForTier(parent.permType), inherited: true };
  }
  // No explicit grant anywhere up the chain we can see — keep the View-Only floor.
  return { tier: own.permType, rank: rankForTier(own.permType), inherited: false };
}
