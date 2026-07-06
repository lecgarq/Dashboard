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
 *    Model Coordination is IN the donut (owner-directed, 2026-07-06 drill-down
 *    regroup: "in model coordination we can do views, create clashes") — the
 *    earlier redirect of its catalog actions to Data Management is removed; the
 *    collection verbs land in Model Coordination's "Views" group.
 *  - Permission / membership / admin actions (everything the excel files under
 *    Preconstruction) form a dedicated "Admin Actions" module. Preconstruction is
 *    KEPT (empty) for future takeoff/cost activity; AutoSpecs / Design likewise.
 *  - EXTRA_ACTIONS covers the handful of DB actions absent from the excel:
 *    `add-version-to-set` -> Build (Sheets version-set family, owner-directed);
 *    `create-set` / `calibrate-entity` -> Data Management; `create-project` /
 *    `add-member` / `setting-update` -> Admin Actions; `add-folder-naming-standard`
 *    -> Datum (naming-standard family). See EXTRA_ACTIONS' own comment for the
 *    2026-07-06 owner-delegated mapping review that moved several of these.
 *
 * Two axes: the MODULE (which ACC product) and the GROUP (which tool tab inside
 * that product — Files / Reviews / Sheets / RFIs / …). The group axis replaced
 * the excel action-category axis (content change / workflow / read / …) per the
 * owner's 2026-07-06 direction: the drill-down must mirror the real ACC left-rail
 * tools of each product, not generic verb categories. Issues stay in Build
 * (its "Issues" group) — ASSUMED from the 21.1-04 owner-approved taxonomy; the
 * owner's Docs tab list also names Issues, so flipping them to Data Management
 * is a one-line change in toolGroup() if directed.
 */
import { getActionsByModule, getModules, getAction, resolveActionId } from "@/app/(dashboard)/users/access-analysis/accTaxonomy";
import { normalizeActionId } from "@/app/(dashboard)/users/access-analysis/accNormalize";

const ADMIN_ACTIONS_ID = "adminActions";
const ADMIN_ACTIONS_LABEL = "Admin Actions";
const MODEL_COORDINATION_ID = "modelCoordination";
const DATA_MANAGEMENT_ID = "dataManagement";
const BUILD_ID = "build";
const DESIGN_COLLABORATION_ID = "designCollaboration";
const DATUM_ID = "datum";

/** Bucket id for any raw action with no mapping at all. Not a real module. */
export const UNMAPPED_MODULE = "unmapped";

/** Fallback group for actions no tool-tab rule recognizes. */
export const OTHER_GROUP = "Other";

/**
 * Display order for the drill-down's tool groups (owner-directed, 2026-07-06):
 * each module's groups are the real ACC left-rail tools of that product, listed
 * here product-by-product. Groups are distinct across modules, so one global
 * order suffices for the per-module drill-down sort.
 */
export const GROUP_ORDER: readonly string[] = [
  // Data Management (Docs)
  "Files", "Specifications", "Reviews", "Transmittals", "Boards",
  // Build
  "Sheets", "Issues", "Forms", "Photos", "RFIs", "Submittals", "Schedule",
  // Design Collaboration
  "Changes", "Create packages", "Consume packages",
  // Model Coordination
  "Views", "Clashes",
  // Admin Actions
  "Members & access", "Projects & settings",
  // Datum
  "Naming standards", "Custom attributes",
  OTHER_GROUP,
];

/**
 * Resolve the ACC tool group (the product's left-rail tab) for an action id
 * within its FINAL module. Called after module resolution (incl. service
 * overrides/rescues), so a rescued raw id and a canonical catalog id both work —
 * rules are substring/prefix patterns on the kebab-case id.
 */
function toolGroup(moduleId: string, id: string): string {
  switch (moduleId) {
    case DATA_MANAGEMENT_ID:
      if (id.includes("transmittal")) return "Transmittals";
      // notify-final-members: review-workflow step whose id lacks the substring.
      if (id.includes("review") || id.includes("approval") || id === "notify-final-members") return "Reviews";
      if (id.includes("spec")) return "Specifications";
      if (id.includes("board")) return "Boards";
      return "Files"; // entity file ops, links, sets, versions, calibration, office files
    case BUILD_ID:
      if (id.startsWith("issue-")) return "Issues";
      if (id.includes("sheet") || id.includes("version-set") || id === "add-version-to-set") return "Sheets";
      if (id.startsWith("rfi-") || id.startsWith("response-") || id.startsWith("comment-")) return "RFIs";
      if (id.startsWith("submittal")) return "Submittals";
      if (id.includes("form")) return "Forms";
      if (id.includes("photo")) return "Photos";
      if (id.includes("schedule")) return "Schedule";
      return OTHER_GROUP;
    case DESIGN_COLLABORATION_ID:
      if (id.startsWith("receive-") || id.includes("consume")) return "Consume packages";
      if (id.includes("package") || id.startsWith("send-entity")) return "Create packages";
      return "Changes"; // publish-entity: the Revit publish that drives the Changes feed
    case MODEL_COORDINATION_ID:
      if (id.includes("clash")) return "Clashes";
      return "Views"; // collection verbs: coordination spaces feeding model views
    case ADMIN_ACTIONS_ID:
      if (id.includes("project") || id.includes("setting")) return "Projects & settings";
      return "Members & access"; // member/admin/permission verbs
    case DATUM_ID:
      if (/naming.?standard/.test(id)) return "Naming standards";
      if (id.includes("attribute")) return "Custom attributes";
      return OTHER_GROUP;
    default:
      return OTHER_GROUP;
  }
}

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
 * DB actions absent from the excel catalog. Keyed by normalized id ->
 * { module, label, category }. Researched 2026-06-05 (see file header).
 *
 * Owner-delegated mapping review (21.1-04 checkpoint, 2026-07-06): the version-set
 * family (`add-version-to-set` here; `create-version-set`/`rename-version-set`/
 * `update-version-set` are catalog actions, see MODULE_OVERRIDES below) moved to
 * Build with the rest of the Sheets cluster (owner-directed final-look verdict:
 * Sheets is an ACC Build tool, so its version-set features follow the tool).
 * `restore-version` and `create-set` are Docs file-versioning/Sets features and were
 * deliberately NOT moved. `add-folder-naming-standard` is a DB action absent from the
 * excel catalog (was Unmapped, rescued to Data Management via the `docs` umbrella);
 * given an explicit Datum mapping to unify with `apply-naming-standard` /
 * `add-attribute-to-naming-standard`.
 */
const EXTRA_ACTIONS: Readonly<Record<string, { module: string; label: string }>> = {
  "add-version-to-set": { module: BUILD_ID, label: "Add Version to Set" },
  "create-set": { module: DATA_MANAGEMENT_ID, label: "Create Set" },
  "calibrate-entity": { module: DATA_MANAGEMENT_ID, label: "Calibrate Entity" },
  "create-project": { module: ADMIN_ACTIONS_ID, label: "Create Project" },
  "add-member": { module: ADMIN_ACTIONS_ID, label: "Add Member" },
  "setting-update": { module: ADMIN_ACTIONS_ID, label: "Setting Update" },
  "add-folder-naming-standard": { module: DATUM_ID, label: "Add Folder Naming Standard" },
};

/**
 * Module reassignments for catalog actions whose excel-derived `moduleId` the
 * owner-delegated mapping review (21.1-04 checkpoint, 2026-07-06) corrected.
 * Checked BEFORE the ADMIN_ACTION_IDS (Preconstruction -> Admin Actions) routing,
 * so it can pull a Preconstruction-tagged action (`notify-final-members`) out of
 * Admin Actions into a different module.
 *  - Sheets cluster -> Build (OWNER-DIRECTED, final-look verdict 2026-07-06:
 *    "approved BUT move sheets and friends to the Build module"): the sheet verbs
 *    (`view-sheet`, `publish-sheet`, `export-sheet`, `delete-sheet`, `print-sheet`,
 *    `shared-with-recipients-for-sheets`) and the version-set family
 *    (`create-version-set`, `rename-version-set`, `update-version-set`; plus
 *    `add-version-to-set` in EXTRA_ACTIONS) are ACC Sheets tool features — Sheets
 *    lives in ACC Build, so the whole cluster follows the tool.
 *  - `publish-entity` STAYS Design Collaboration: it is the docs-tagged Revit
 *    model publish (Design Collaboration's publish workflow), not a Sheets action.
 *    `send-entity-to-project` likewise stays Design Collaboration via the catalog.
 *  - `notify-final-members`: catalog files this under Preconstruction (->
 *    Admin Actions), but it's a Docs review-workflow step; its siblings
 *    (`notify-reviewers`, `submit-review`, `claim-review-task`) are Data
 *    Management, so route it there too.
 */
const MODULE_OVERRIDES: Readonly<Record<string, string>> = {
  "publish-entity": DESIGN_COLLABORATION_ID,
  "view-sheet": BUILD_ID,
  "publish-sheet": BUILD_ID,
  "export-sheet": BUILD_ID,
  "delete-sheet": BUILD_ID,
  "print-sheet": BUILD_ID,
  "shared-with-recipients-for-sheets": BUILD_ID,
  "create-version-set": BUILD_ID,
  "rename-version-set": BUILD_ID,
  "update-version-set": BUILD_ID,
  "notify-final-members": DATA_MANAGEMENT_ID,
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
 * Modules the activity donut can show: all 9 excel modules (incl. Model
 * Coordination, restored 2026-07-06 owner-directed) plus Admin Actions,
 * inserted right after Preconstruction for a sensible reading order.
 */
export function donutModules(): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  for (const m of getModules()) {
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
 *  - umbrella: docs/sheets/bridge -> their rescue-target module. These are coarse
 *    buckets that our verb taxonomy already refines into Design Collaboration /
 *    Datum / Admin Actions in specific cases (e.g. ~8,107 docs-serviceGroup rows
 *    are a deliberate permission-verb override to Admin Actions, not a bug) -- so
 *    an umbrella service NEVER overrides a verb result that already resolved to
 *    a real module; it only rescues an otherwise-Unmapped verb result. `sheets`
 *    rescues to Build (owner-directed final-look verdict, 21.1-04 checkpoint,
 *    2026-07-06: the whole Sheets cluster belongs to ACC Build): every verb-mapped
 *    sheets action resolves there via MODULE_OVERRIDES (view-sheet, publish-sheet,
 *    export-sheet, delete-sheet, print-sheet, shared-with-recipients-for-sheets),
 *    so the rescue path for unmapped sheets actions (view-sheet-public-link,
 *    create-public-link-for-sheets) must land in the same module.
 */
const SERVICE_TO_MODULE: Readonly<Record<string, string>> = {
  issues: BUILD_ID,
  submittals: BUILD_ID,
  rfis: BUILD_ID,
  admin: ADMIN_ACTIONS_ID,
  docs: DATA_MANAGEMENT_ID,
  sheets: BUILD_ID,
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
): { moduleId: string; label: string; group: string; attributedBy: "service" | "verb" } {
  const norm = normalizeActionId(rawAction);
  // Compute the verb-based module/label exactly as before. `gid` is the id the
  // tool-group rules run on: the canonical catalog id when the action resolved,
  // else the normalized raw id (rescue/unmapped paths).
  let verbResult: { moduleId: string; label: string };
  let gid = norm;
  const coord = COORDINATION_ISSUE_LABELS[norm];
  if (coord) {
    verbResult = { moduleId: BUILD_ID, label: coord };
  } else {
    const extra = EXTRA_ACTIONS[norm];
    if (extra) {
      verbResult = { moduleId: extra.module, label: extra.label };
    } else {
      const action = getAction(resolveActionId(rawAction));
      if (!action) {
        verbResult = { moduleId: UNMAPPED_MODULE, label: rawAction };
      } else {
        const moduleId = MODULE_OVERRIDES[action.id]
          ?? (ADMIN_ACTION_IDS.has(action.id) ? ADMIN_ACTIONS_ID : action.moduleId);
        verbResult = { moduleId, label: action.label };
        gid = action.id;
      }
    }
  }

  // Normalize + resolve the service tag. Absent/unrecognized -> verb result stands.
  // The tool group is always resolved against the FINAL module, so a service
  // override/rescue regroups the action within its destination product.
  const svc = service?.trim().toLowerCase();
  const svcModule = svc ? SERVICE_TO_MODULE[svc] : undefined;
  if (!svcModule) {
    return { ...verbResult, group: toolGroup(verbResult.moduleId, gid), attributedBy: "verb" };
  }

  // Unmapped rescue: a recognized service resolves a verb result that had none.
  if (verbResult.moduleId === UNMAPPED_MODULE) {
    return { moduleId: svcModule, label: rawAction, group: toolGroup(svcModule, norm), attributedBy: "service" };
  }

  // Decisive service (not umbrella) disagreeing with the verb module -> service wins,
  // keeping the verb result's label.
  if (!UMBRELLA_SERVICES.has(svc!) && svcModule !== verbResult.moduleId) {
    return { moduleId: svcModule, label: verbResult.label, group: toolGroup(svcModule, gid), attributedBy: "service" };
  }

  // Otherwise (umbrella service deferring to an already-mapped verb refinement, or
  // service and verb already agree) -- keep the verb module/label. Service was
  // populated and recognized, so it still counts as service-attributed for the
  // caveat's live split.
  return { ...verbResult, group: toolGroup(verbResult.moduleId, gid), attributedBy: "service" };
}
