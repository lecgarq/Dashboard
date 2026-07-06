/**
 * Pure aggregation for the "Module activity" donut. Mirrors `roleCounts.ts`, but
 * the entity is ACTIVITY: each row is a (project, rawAction) count, and slices are
 * the canonical ACC modules sized by total activity volume.
 *
 * The raw action -> { module, label, category } mapping lives in `moduleOverrides`
 * (`classifyActivity`); anything still unknown folds into a single "Unmapped"
 * bucket (the activity analogue of the roles "Unknown" warning). No React/DOM/IO —
 * safe on both server and client.
 */
import { classifyActivity, donutModules } from "./moduleOverrides";

export { UNMAPPED_MODULE } from "./moduleOverrides";
import { UNMAPPED_MODULE } from "./moduleOverrides";
const UNMAPPED_LABEL = "Unmapped";

// Modules the donut can show (9 excel + Admin Actions) and their display labels.
const DONUT_MODULES = donutModules();
const LABEL_BY_ID = new Map<string, string>(DONUT_MODULES.map((m) => [m.id, m.label]));

/** One shipped row: total activity for a (project, rawAction) pair. */
export type { ModuleActivityRow } from "@/lib/acc/moduleCountsTypes";
import type { ModuleActivityRow } from "@/lib/acc/moduleCountsTypes";

/** A single activity type within a module (for the drill-down + tooltip). */
export interface ActivityType {
  label: string; // human label from the taxonomy (or the raw action if unmapped)
  raw: string;
  count: number;
  group: string; // ACC tool group inside the module (Files / Reviews / Sheets / …)
}

export interface ModuleSlice {
  id: string; // ModuleId or UNMAPPED_MODULE
  name: string;
  value: number; // total activities
}

export interface ModuleSummary {
  /** Modules with activity > 0 (plus the Unmapped bucket), sorted by volume desc. */
  slices: ModuleSlice[];
  /** Sum of all slice values (= total activities in scope). */
  total: number;
  /** Count of real modules with activity (excludes the Unmapped bucket). */
  activeModules: number;
  /** Canonical modules with no activity in scope, in canonical order. */
  zeroModules: Array<{ id: string; name: string }>;
  /** moduleId -> its activity types, merged across projects, sorted by count desc. */
  typesByModule: Map<string, ActivityType[]>;
  /** Live attribution split for the TRUTH-03 caveat: activity volume attributed with a
   *  recognized Autodesk service tag vs inferred from the verb taxonomy alone. */
  attribution: { serviceCount: number; verbCount: number };
}

const moduleName = (id: string): string =>
  id === UNMAPPED_MODULE ? UNMAPPED_LABEL : LABEL_BY_ID.get(id) ?? id;

/**
 * Roll activity rows up to module slices + per-module activity-type breakdowns.
 * Slice values sum to `total`, so donut percentages add to 100%. Each rawAction
 * is resolved once; activity types are merged by rawAction across projects so the
 * drill-down shows one line per action regardless of how many projects it spans.
 */
export function summarizeModules(rows: ReadonlyArray<ModuleActivityRow>): ModuleSummary {
  const volume = new Map<string, number>();
  const typesAgg = new Map<string, Map<string, ActivityType>>(); // moduleId -> raw -> type
  let serviceCount = 0;
  let verbCount = 0;

  for (const row of rows) {
    const { moduleId, label, group, attributedBy } = classifyActivity(row.rawAction, row.service);
    volume.set(moduleId, (volume.get(moduleId) ?? 0) + row.count);
    if (attributedBy === "service") serviceCount += row.count;
    else verbCount += row.count;
    // typesByModule stays keyed by rawAction within each module's own map: two rows
    // with the same rawAction but different service values landing in DIFFERENT
    // modules accumulate into their own module's byRaw map (per-module, not global).
    const byRaw = typesAgg.get(moduleId) ?? typesAgg.set(moduleId, new Map()).get(moduleId)!;
    const cur = byRaw.get(row.rawAction);
    if (cur) cur.count += row.count;
    else byRaw.set(row.rawAction, { label, raw: row.rawAction, count: row.count, group });
  }

  const slices: ModuleSlice[] = [...volume.entries()]
    .filter(([, v]) => v > 0)
    .map(([id, value]) => ({ id, name: moduleName(id), value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const activeModules = slices.filter((s) => s.id !== UNMAPPED_MODULE).length;

  const zeroModules = DONUT_MODULES
    .filter((m) => (volume.get(m.id) ?? 0) === 0)
    .map((m) => ({ id: m.id, name: m.label }));

  const typesByModule = new Map<string, ActivityType[]>();
  for (const [id, byRaw] of typesAgg) {
    typesByModule.set(id, [...byRaw.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)));
  }

  return { slices, total, activeModules, zeroModules, typesByModule, attribution: { serviceCount, verbCount } };
}
