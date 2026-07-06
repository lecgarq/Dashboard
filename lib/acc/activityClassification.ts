/**
 * NOTE: The `accTaxonomy` and `accNormalize` imports below are a known
 * spatial-graph-coupled `lib->app` edge (accTaxonomy/accNormalize live under
 * the /users/access-analysis route surface). This edge is DOCUMENTED-DEFERRED
 * per BND-03 (see 10-03). Do not attempt to fix it here.
 */

/**
 * Activity-donut classification — the single source of truth for turning a raw
 * AccActivity.rawAction into { module, label, category }. It layers a few domain
 * decisions on top of the canonical excel taxonomy, applied at QUERY TIME (the
 * donut maps the lossless rawAction, so this holds for every Data Connector
 * extraction past and future — no ingest change needed; normalizeActionId folds
 * any casing/separator variant to one id before lookup).
 *
 * Mapping decisions (researched against Autodesk help, 2026-06-05):
 *  - Coordination issues are recorded as issue-* events; they belong to Build
 *    (ACC Build tracks issues). Not in the excel catalog, so mapped explicitly here.
 *    Model Coordination is intentionally excluded from the donut entirely: any
 *    catalog action the excel maps to modelCoordination is redirected to Data Management.
 *  - Permission / membership / admin actions (everything the excel files under
 *    Preconstruction) form a dedicated "Admin Actions" module. Preconstruction is
 *    KEPT (empty) for future takeoff/cost activity; AutoSpecs / Design likewise.
 *  - EXTRA_ACTIONS covers the handful of DB actions absent from the excel:
 *    Sheets version-set + Docs calibration -> Data Management (service=docs, and
 *    `create-version-set` is already Data Management); create-project / add-member
 *    / setting-update -> Admin Actions.
 *
 * Two axes of "category": the MODULE (which ACC product) and the action CATEGORY
 * (read / content change / workflow / access / delete) from the excel groupId.
 */
import { getActionsByModule, getModules, getAction, resolveActionId } from "@/app/(dashboard)/users/access-analysis/accTaxonomy";
import { normalizeActionId } from "@/app/(dashboard)/users/access-analysis/accNormalize";

const ADMIN_ACTIONS_ID = "adminActions";
const ADMIN_ACTIONS_LABEL = "Admin Actions";
const MODEL_COORDINATION_ID = "modelCoordination";
const DATA_MANAGEMENT_ID = "dataManagement";
const BUILD_ID = "build";

/** Bucket id for any raw action with no mapping at all. Not a real module. */
export const UNMAPPED_MODULE = "unmapped";

/** Friendly names for the excel groupId action categories. */
export const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  contentChange: "Content changes",
  workflowChange: "Workflow",
  accessChange: "Access & permissions",
  read: "Viewing & exports",
  delete: "Deletions",
  unknown: "Other",
};
const CAT = CATEGORY_LABELS;

/** Display order for category groups in the drill-down. */
export const CATEGORY_ORDER: readonly string[] = [
  CAT.contentChange, CAT.workflowChange, CAT.accessChange, CAT.read, CAT.delete, CAT.unknown,
];

/** Coordination issue events -> Build. Keyed by normalized id -> label. */
const COORDINATION_ISSUE_LABELS: Readonly<Record<string, string>> = {
  "issue-attach": "Issue Attach",
  "issue-work-completed": "Issue Work Completed",
  "issue-ready-to-inspect": "Issue Ready to Inspect",
  "issue-suggestion-generated": "Issue Suggestion Generated",
  "issue-detach": "Issue Detach",
  "issue-respond": "Issue Respond",
  "issue-answered": "Issue Answered",
  "issue-void": "Issue Void",
};

/**
 * Category refinements for catalog actions whose excel groupId is "unknown".
 * Keyed by canonical action id (post-alias). Keeps the drill-down's "Other"
 * bucket empty for the actions we understand.
 */
const CATEGORY_OVERRIDES: Readonly<Record<string, string>> = {
  "receive-entity-from-project-with-automation": CAT.contentChange,
  "add-resources-to-package": CAT.contentChange,
  "review-entity": CAT.workflowChange,
  "review-step-back": CAT.workflowChange,
  "update-folder-properties": CAT.contentChange,
  "upsert-custom-attribute-constraint": CAT.contentChange,
  "upgrade-version": CAT.contentChange,
  "attach-custom-attribute": CAT.contentChange,
  "detach-custom-attribute": CAT.contentChange,
  "update-custom-attribute": CAT.contentChange,
  "add-attribute-to-naming-standard": CAT.contentChange,
  "apply-naming-standard": CAT.contentChange,
};

/**
 * DB actions absent from the excel catalog. Keyed by normalized id ->
 * { module, label, category }. Researched 2026-06-05 (see file header).
 */
const EXTRA_ACTIONS: Readonly<Record<string, { module: string; label: string; category: string }>> = {
  "add-version-to-set": { module: DATA_MANAGEMENT_ID, label: "Add Version to Set", category: CAT.contentChange },
  "create-set": { module: DATA_MANAGEMENT_ID, label: "Create Set", category: CAT.contentChange },
  "calibrate-entity": { module: DATA_MANAGEMENT_ID, label: "Calibrate Entity", category: CAT.contentChange },
  "create-project": { module: ADMIN_ACTIONS_ID, label: "Create Project", category: CAT.workflowChange },
  "add-member": { module: ADMIN_ACTIONS_ID, label: "Add Member", category: CAT.accessChange },
  "setting-update": { module: ADMIN_ACTIONS_ID, label: "Setting Update", category: CAT.workflowChange },
};

/**
 * Action ids the excel files under Preconstruction — in our data all
 * permission/membership/admin actions, reclassified to Admin Actions. Derived
 * from the catalog so it stays in sync if the excel changes.
 */
const ADMIN_ACTION_IDS: ReadonlySet<string> = new Set(
  getActionsByModule("preconstruction").map((a) => a.id),
);

/**
 * Modules the activity donut can show: the 9 excel modules plus Admin Actions,
 * inserted right after Preconstruction for a sensible reading order.
 */
export function donutModules(): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  for (const m of getModules()) {
    if (m.id === MODEL_COORDINATION_ID) continue;
    out.push({ id: m.id, label: m.label });
    if (m.id === "preconstruction") out.push({ id: ADMIN_ACTIONS_ID, label: ADMIN_ACTIONS_LABEL });
  }
  return out;
}

/**
 * Autodesk's own coarse `service`/`serviceGroup` tag -> module, for the handful
 * of modules a service tag can actually speak to (21.1-RESEARCH.md: serviceGroup
 * has only 4 values, service has 7 -- neither can resolve Preconstruction, Cost
 * Management, Design/Forma, AutoSpecs, Datum, or Model Coordination nuances, so
 * this is a NARROW override, never a full replacement of the verb taxonomy below).
 *  - decisive: issues/submittals/rfis -> Build, admin -> Admin Actions. These
 *    values are unambiguous about which module they mean.
 *  - umbrella: docs/sheets/bridge -> Data Management. These are coarse buckets
 *    that our verb taxonomy already refines into Design Collaboration / Datum /
 *    Admin Actions in specific cases (e.g. ~8,107 docs-serviceGroup rows are a
 *    deliberate permission-verb override to Admin Actions, not a bug) -- so an
 *    umbrella service NEVER overrides a verb result that already resolved to a
 *    real module; it only rescues an otherwise-Unmapped verb result.
 */
const SERVICE_TO_MODULE: Readonly<Record<string, string>> = {
  issues: BUILD_ID,
  submittals: BUILD_ID,
  rfis: BUILD_ID,
  admin: ADMIN_ACTIONS_ID,
  docs: DATA_MANAGEMENT_ID,
  sheets: DATA_MANAGEMENT_ID,
  bridge: DATA_MANAGEMENT_ID,
};
/** Umbrella services never override an already-mapped verb result (only rescue Unmapped). */
const UMBRELLA_SERVICES: ReadonlySet<string> = new Set(["docs", "sheets", "bridge"]);

/** Classify a raw action into its module, display label, and action category.
 *
 * `service` is an OPTIONAL Autodesk service tag (AccActivity.service /
 * AccActivityAccds.serviceGroup). When omitted/unrecognized, behavior is
 * byte-identical to the service-unaware classifier this function used to be
 * (`attributedBy: "verb"`). When present and recognized, service can narrowly
 * override or rescue the verb result per the precedence below (21.1-RESEARCH.md).
 */
export function classifyActivity(
  rawAction: string,
  service?: string | null,
): { moduleId: string; label: string; category: string; attributedBy: "service" | "verb" } {
  const norm = normalizeActionId(rawAction);
  // Compute the verb-based result exactly as before -- zero changes to this logic.
  let verbResult: { moduleId: string; label: string; category: string };
  const coord = COORDINATION_ISSUE_LABELS[norm];
  if (coord) {
    verbResult = { moduleId: BUILD_ID, label: coord, category: CAT.workflowChange };
  } else {
    const extra = EXTRA_ACTIONS[norm];
    if (extra) {
      verbResult = { moduleId: extra.module, label: extra.label, category: extra.category };
    } else {
      const action = getAction(resolveActionId(rawAction));
      if (!action) {
        verbResult = { moduleId: UNMAPPED_MODULE, label: rawAction, category: CAT.unknown };
      } else {
        let moduleId = ADMIN_ACTION_IDS.has(action.id) ? ADMIN_ACTIONS_ID : action.moduleId;
        if (moduleId === MODEL_COORDINATION_ID) moduleId = DATA_MANAGEMENT_ID;
        const category = CATEGORY_OVERRIDES[action.id] ?? CAT[action.groupId] ?? CAT.unknown;
        verbResult = { moduleId, label: action.label, category };
      }
    }
  }

  // Normalize + resolve the service tag. Absent/unrecognized -> verb result stands.
  const svc = service?.trim().toLowerCase();
  const svcModule = svc ? SERVICE_TO_MODULE[svc] : undefined;
  if (!svcModule) return { ...verbResult, attributedBy: "verb" };

  // Unmapped rescue: a recognized service resolves a verb result that had none.
  if (verbResult.moduleId === UNMAPPED_MODULE) {
    return { moduleId: svcModule, label: rawAction, category: CAT.unknown, attributedBy: "service" };
  }

  // Decisive service (not umbrella) disagreeing with the verb module -> service wins,
  // keeping the verb result's label/category.
  if (!UMBRELLA_SERVICES.has(svc!) && svcModule !== verbResult.moduleId) {
    return { moduleId: svcModule, label: verbResult.label, category: verbResult.category, attributedBy: "service" };
  }

  // Otherwise (umbrella service deferring to an already-mapped verb refinement, or
  // service and verb already agree) -- keep the verb module/label/category. Service
  // was populated and recognized, so it still counts as service-attributed for the
  // caveat's live split.
  return { ...verbResult, attributedBy: "service" };
}
