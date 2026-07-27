/**
 * activityTaxonomyLabels.ts — universe labels speak the /access-analysis taxonomy.
 *
 * The payload dicts are raw pipeline strings: verbs are kebab ids
 * ("assign-member") and the module dict is Autodesk's coarse `service_group` tag
 * ("docs", "issues", "(none)"). Every other surface names ACC products and
 * catalog labels ("Data Management", "Assign Member"), so the same corpus read
 * two different ways depending on which page you were on.
 *
 * Both dimensions resolve here through the ONE classifier the donut already uses
 * (`classifyActivity`), applied at the (verb, service) PAIR level — 116 x 7
 * pairs, not 4.9M rows. Pair-level matters: a flat service→product rename would
 * keep the ~8k docs-tagged permission verbs in Data Management, while the
 * taxonomy files them under Admin Actions. Going through the classifier means
 * the universe inherits every verb refinement, service rescue and override, so
 * its buckets equal the donut's by construction rather than by coincidence.
 *
 * Module slot 0 is the honest data-quality bucket: rows whose verb resolves to
 * nothing AND whose service tag says nothing (the DC-sourced slice carries no
 * service for many rows). It keeps a real label, never an invented product.
 *
 * Pure — no React/DOM/IO.
 */

import { classifyActivity, donutModules, UNMAPPED_MODULE } from "@/lib/acc/activityClassification";

/** Slot-0 module label: verb unmapped AND service tag unusable. */
export const UNMAPPED_MODULE_LABEL = "Unmapped";

/**
 * Slot-0 object-type label. Two different absences share this bucket and neither
 * is a data bug: Autodesk attaches no object to issue-* events (the issue IS the
 * object), and the DC-sourced backfill rows predate the accds schema, which is
 * where objectType comes from. "No object" states that without guessing why.
 */
export const NO_OBJECT_TYPE_LABEL = "No object";

/** The pipeline's "value was NULL/empty" dict entry, shared by every dict. */
const NONE = "(none)";

/**
 * Autodesk's object-type tokens are namespaced URN fragments
 * ("items:autodesk.bim360:TitleBlock", "folders:autodesk.bim360:Folder") mixed
 * with bare camelCase ids ("approvalWorkflowReview"). Both name the same thing —
 * the ENTITY CLASS that was acted on, never the file format — so this drops the
 * namespace and spaces the words instead of maintaining a lookup table that a
 * new Autodesk type would silently fall out of.
 *
 * NOTE for the format question this label always raises: the extension lives in
 * AccActivityAccds.objectName, which the payload does not carry. A real "file
 * format" dimension needs a pipeline column, not a relabel.
 */
export function objectTypeLabel(raw: string): string {
  if (raw === NONE) return NO_OBJECT_TYPE_LABEL;
  const leaf = raw.slice(raw.lastIndexOf(":") + 1);
  const spaced = leaf
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // URNItem → URN Item
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // TitleBlock → Title Block
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : raw;
}

export interface ActivityTaxonomy {
  /** Catalog labels index-aligned to the payload's verbId column. */
  verbLabels: string[];
  /** New module dict: slot 0 = Unmapped, then the donut's module order. */
  moduleLabels: string[];
  /**
   * Lookup table over (verbId, rawModuleId) → new module slot, laid out
   * `verbId * rawModuleCount + rawModuleId`. Built once per payload load.
   */
  moduleSlotByPair: Uint16Array;
  /** Column count the pair table was built against — the remap's stride. */
  rawModuleCount: number;
}

/**
 * Resolve the payload's raw verb + service dicts into taxonomy labels plus the
 * (verb, service) → module lookup the column remap rides on.
 */
export function buildActivityTaxonomy(
  verbDict: readonly string[],
  moduleDict: readonly string[],
): ActivityTaxonomy {
  const moduleLabels = [UNMAPPED_MODULE_LABEL, ...donutModules().map((m) => m.label)];
  const slotByModuleId = new Map<string, number>(
    donutModules().map((m, i) => [m.id, i + 1]),
  );

  const rawModuleCount = moduleDict.length;
  const moduleSlotByPair = new Uint16Array(verbDict.length * rawModuleCount);
  const verbLabels: string[] = [];

  for (let v = 0; v < verbDict.length; v++) {
    const rawVerb = verbDict[v];
    // The verb label is service-independent (service can move a row's module,
    // never rename its action), so one classify per verb answers the label.
    verbLabels.push(classifyActivity(rawVerb).label);
    for (let m = 0; m < rawModuleCount; m++) {
      const rawService = moduleDict[m] === NONE ? null : moduleDict[m];
      const { moduleId } = classifyActivity(rawVerb, rawService);
      moduleSlotByPair[v * rawModuleCount + m] =
        moduleId === UNMAPPED_MODULE ? 0 : (slotByModuleId.get(moduleId) ?? 0);
    }
  }

  return { verbLabels, moduleLabels, moduleSlotByPair, rawModuleCount };
}

/**
 * Rewrite the moduleId column into taxonomy slots — one table lookup per row.
 * Out-of-range ids (a dict/column pair that drifted) fall to slot 0 rather than
 * reading past the table, matching the defensive clamp the color/legend paths use.
 */
export function remapModuleIds(
  verbIds: ArrayLike<number>,
  moduleIds: ArrayLike<number>,
  taxonomy: ActivityTaxonomy,
): Uint16Array {
  const { moduleSlotByPair, rawModuleCount } = taxonomy;
  const n = moduleIds.length;
  const out = new Uint16Array(n);
  if (rawModuleCount === 0) return out;
  const verbCount = moduleSlotByPair.length / rawModuleCount;
  for (let i = 0; i < n; i++) {
    const v = verbIds[i];
    const m = moduleIds[i];
    if (v >= verbCount || m >= rawModuleCount) continue; // slot 0
    out[i] = moduleSlotByPair[v * rawModuleCount + m];
  }
  return out;
}
