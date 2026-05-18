/**
 * Phase 09 LIST-04: pure parser for AccProjectMember.products JSON.
 *
 * Contract:
 *   - INPUT: arbitrary `unknown` (raw JSON from Prisma).
 *   - OUTPUT: `ProductTier[]` — empty on parse failure. NEVER throws. NEVER returns raw JSON.
 *
 * Renderer responsibility (LIST-04 lock from CONTEXT.md):
 *   - Raw JSON rendering forbidden.
 *   - Unknown module keys must surface with `isUnknownModule:true` so the UI can show
 *     a warning icon + tooltip "Unknown module from APS".
 *   - Tier values not in the known {administrator,member,none} set pass through verbatim
 *     into `tier` AND `tierLabel` (no canonicalization).
 *
 * Module label resolution delegates to `moduleLabel()` in `lib/acc/modules.ts` so we do
 * NOT re-implement the snake_case/camelCase normalization here.
 */

import { z } from "zod";
import { moduleLabel } from "@/lib/acc/modules";

const TierEnum = z.enum(["administrator", "member", "none"]);
const ProductsSchema = z.record(z.string(), z.union([TierEnum, z.string()]));

export interface ProductTier {
  /** Raw key from APS (preserved for unknown-module diagnostics). */
  module: string;
  /** Display label via `moduleLabel(key)`; falls through to raw key for unknowns. */
  label: string;
  /** Tier as parsed — known values are the TierEnum literals; unknowns pass through. */
  tier: "administrator" | "member" | "none" | string;
  /** Display label: "Administrator" | "Member" | "None" or pass-through. */
  tierLabel: string;
  /** True iff the module key is NOT in the documented 8-module set. */
  isUnknownModule: boolean;
}

/**
 * Module keys we expect to see. Matches `ACC_MODULE_LABELS` from
 * `lib/acc/modules.ts` (both snake_case and camelCase variants are recognized).
 * Anything outside this set surfaces with `isUnknownModule:true`.
 */
const KNOWN_MODULES = new Set<string>([
  // snake_case (HQ Admin API)
  "docs",
  "design_collaboration",
  "model_coordination",
  "preconstruction",
  "autospecs",
  "build",
  "insight",
  "design",
  // camelCase variants (legacy)
  "documentManagement",
  "designCollaboration",
  "modelCoordination",
  "autoSpecs",
  // Additional documented modules referenced in product surfaces
  "cost",
  "assets",
  "projectAdministration",
]);

const TIER_LABEL: Record<string, string> = {
  administrator: "Administrator",
  member: "Member",
  none: "None",
};

export function parseProductsJson(raw: unknown): ProductTier[] {
  const parsed = ProductsSchema.safeParse(raw);
  if (!parsed.success) return [];
  return Object.entries(parsed.data).map(([key, tier]) => ({
    module: key,
    label: moduleLabel(key),
    tier,
    tierLabel: TIER_LABEL[String(tier)] ?? String(tier),
    isUnknownModule: !KNOWN_MODULES.has(key),
  }));
}
