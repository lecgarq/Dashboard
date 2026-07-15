/**
 * Action dimensions — one ordinal slider per taxonomy action (~176), generated from
 * accTaxonomy. Pure. `extract` returns the raw per-instance count; Phase D buckets it
 * (none/low/med/high) via per-action quantiles + the ordinal ramp. `available` is false
 * for actions with no data (greyed).
 */
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { getActions } from "./accTaxonomy";

/** Action ids that have ≥1 event across the node set (drives the greyed/disabled flag). */
export function buildActionAvailability(features: readonly NodeFeatureSnapshot[]): Set<string> {
  const live = new Set<string>();
  for (const f of features) {
    const counts = f.actionCounts;
    if (!counts) continue;
    for (const id in counts) if ((counts[id] ?? 0) > 0) live.add(id);
  }
  return live;
}

export function buildActionDimensions(availableActionIds?: ReadonlySet<string>): CatalogDimension[] {
  return getActions().map((a) => {
    const available = availableActionIds ? availableActionIds.has(a.id) : true;
    return {
      id: a.id,
      label: a.label,
      family: "activity" as const,
      moduleId: a.moduleId,
      groupId: a.groupId,
      kind: "ordinal" as const,
      source: a.source === "admin"
        ? "AccActivity rawAction (admin, actor-attributed)"
        : "AccActivity rawAction count",
      note: availableActionIds && !available ? "No matching activity in the loaded graph." : undefined,
      confidence: a.source === "admin" ? ("low" as const) : ("medium" as const),
      available,
      surfaces: ["slider", "color"] as ("slider" | "color")[],
      colorScale: "ordered" as const,
      extract: (f: NodeFeatureSnapshot): number => f.actionCounts?.[a.id] ?? 0,
    };
  });
}
