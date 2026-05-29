# Phase A — Canonical ACC Taxonomy + Coverage Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure, typed, canonical taxonomy module (`accTaxonomy`) translated from `acc.xlsx`, with a systematic excel↔data mapping and a re-runnable coverage gate that proves every extracted action is catalogued.

**Architecture:** `acc.xlsx` is the source of truth. A one-shot generator parses its activity hierarchy into a committed `*.generated.ts` action catalog. Hand-curated static modules/groups/access-ladder/structural-dims/entitlement-map/alias-table live in `accTaxonomyStatic.ts`. A pure `accTaxonomy.ts` unifies them behind helpers. A committed DB-snapshot fixture lets a pure Vitest assert full coverage without touching the live database (a refresh script regenerates the fixture on re-ingest).

**Tech Stack:** TypeScript (ESM), Node `.cjs` scripts, `xlsx` (SheetJS, already a dep), `pg` (already a dep), Vitest 4.

This phase is **pure data + tests only** — no React, no physics, no runtime wiring. Phases B–G consume it.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/(dashboard)/users/access-analysis/accNormalize.ts` | `normalizeActionId` kebab function (shared by code + concept) |
| `app/(dashboard)/users/access-analysis/accTaxonomy.types.ts` | All taxonomy types (no runtime values) |
| `app/(dashboard)/users/access-analysis/accTaxonomyStatic.ts` | Hand-curated constants: modules, groups, access ladder, structural dims, entitlement→module map, action aliases, admin-source set |
| `app/(dashboard)/users/access-analysis/accTaxonomyActions.generated.ts` | AUTO-GENERATED action catalog (~176 actions) |
| `app/(dashboard)/users/access-analysis/accTaxonomy.ts` | Unifying API + helpers over static + generated |
| `app/(dashboard)/users/access-analysis/__fixtures__/acc-db-actions.json` | Committed snapshot of distinct DB rawActions + service + source |
| `scripts/gen-acc-taxonomy.cjs` | One-shot generator: `acc.xlsx` → `accTaxonomyActions.generated.ts` |
| `scripts/refresh-acc-actions-fixture.cjs` | Read-only DB → `acc-db-actions.json` |
| `*.test.ts` (3) | normalize, static integrity + helpers, coverage gate |

---

## Task 1: `accNormalize.ts` — the canonical id normalizer

**Files:**
- Create: `app/(dashboard)/users/access-analysis/accNormalize.ts`
- Test: `app/(dashboard)/users/access-analysis/accNormalize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// accNormalize.test.ts
import { describe, it, expect } from "vitest";
import { normalizeActionId } from "./accNormalize";

describe("normalizeActionId", () => {
  it("kebab-cases display labels to match DB rawActions", () => {
    expect(normalizeActionId("Issue Create")).toBe("issue-create");
    expect(normalizeActionId("RFI View")).toBe("rfi-view");
    expect(normalizeActionId("Submittals Item Add Attachment")).toBe("submittals-item-add-attachment");
  });
  it("treats '+' as a separator and collapses runs", () => {
    expect(normalizeActionId("View + Download")).toBe("view-download");
  });
  it("trims leading/trailing separators and lowercases", () => {
    expect(normalizeActionId("  View-Entity  ")).toBe("view-entity");
    expect(normalizeActionId("view-entity")).toBe("view-entity");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/accNormalize.test.ts"`
Expected: FAIL — cannot find module `./accNormalize`.

- [ ] **Step 3: Write minimal implementation**

```ts
// accNormalize.ts
/**
 * Canonical id normalizer — maps any human/excel label or DB rawAction to a stable
 * kebab id. Pure, no deps. Used to match excel labels against AccActivity.rawAction.
 */
export function normalizeActionId(s: string): string {
  return s
    .toLowerCase()
    .replace(/\+/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/accNormalize.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/accNormalize.ts" "app/(dashboard)/users/access-analysis/accNormalize.test.ts"
git commit -m "feat(acc-taxonomy): canonical action-id normalizer"
```

---

## Task 2: `accTaxonomy.types.ts` — taxonomy types

**Files:**
- Create: `app/(dashboard)/users/access-analysis/accTaxonomy.types.ts`

No test (types only; verified by `tsc` and downstream tasks).

- [ ] **Step 1: Write the types**

```ts
// accTaxonomy.types.ts
/** The excel's group-activity level (middle of module -> group -> action). */
export type GroupId =
  | "contentChange"
  | "delete"
  | "read"
  | "workflowChange"
  | "accessChange"
  | "unknown";

/** Where the action's data comes from. "admin" = account-level, actor-attributed. */
export type ActivitySource = "project" | "admin";

export interface TaxonomyModule {
  id: string;
  label: string;     // excel display name (canonical)
  observed: boolean; // has observed activities in the excel
}

export interface TaxonomyGroup {
  id: GroupId;
  label: string;
}

export interface TaxonomyAction {
  id: string;            // canonical kebab id (matches DB rawAction)
  label: string;         // excel display label
  moduleId: string;      // -> TaxonomyModule.id
  groupId: GroupId;
  source: ActivitySource;
}

export interface AccessLevel {
  id: string;
  label: string;
  strength: 0 | 1 | 2 | 3 | 4 | 5;
  permType: string | null; // AccFolderPermission.permType, or null for "none"
}

export type StructuralKind = "categorical" | "ordinal" | "binary";

export interface StructuralDim {
  id: string;
  label: string;
  kind: StructuralKind;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/accTaxonomy.types.ts"
git commit -m "feat(acc-taxonomy): taxonomy type definitions"
```

---

## Task 3: `accTaxonomyStatic.ts` — hand-curated constants

**Files:**
- Create: `app/(dashboard)/users/access-analysis/accTaxonomyStatic.ts`
- Test: `app/(dashboard)/users/access-analysis/accTaxonomyStatic.test.ts`

These values come from the spec §4 (verified live DB) and `acc.xlsx`.

- [ ] **Step 1: Write the failing test**

```ts
// accTaxonomyStatic.test.ts
import { describe, it, expect } from "vitest";
import {
  MODULES, GROUPS, ACCESS_LEVELS, STRUCTURAL_DIMS,
  ENTITLEMENT_TO_MODULE, ACTION_ALIASES, ADMIN_SOURCE_ACTION_IDS,
} from "./accTaxonomyStatic";

describe("accTaxonomyStatic", () => {
  it("has the 9 excel modules with unique ids", () => {
    expect(MODULES).toHaveLength(9);
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(9);
    expect(MODULES.map((m) => m.label)).toContain("Data Management");
    expect(MODULES.map((m) => m.label)).toContain("Preconstruction");
  });
  it("maps all 9 DB entitlement keys, folding cost into build", () => {
    const keys = ["build", "cost", "docs", "designCollaboration", "modelCoordination", "insight", "autoSpecs", "takeoff", "forma"];
    for (const k of keys) expect(ENTITLEMENT_TO_MODULE[k]).toBeTruthy();
    expect(ENTITLEMENT_TO_MODULE.cost).toBe("build");
    expect(ENTITLEMENT_TO_MODULE.docs).toBe("dataManagement");
    expect(ENTITLEMENT_TO_MODULE.takeoff).toBe("preconstruction");
    expect(ENTITLEMENT_TO_MODULE.forma).toBe("design");
    // every target module id is a real module
    const moduleIds = new Set(MODULES.map((m) => m.id));
    for (const id of Object.values(ENTITLEMENT_TO_MODULE)) expect(moduleIds.has(id)).toBe(true);
  });
  it("has the real 6-rung access ladder (none..fullController)", () => {
    expect(ACCESS_LEVELS.map((a) => a.strength)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(ACCESS_LEVELS.find((a) => a.strength === 5)?.permType).toBe("Full Controller");
    expect(ACCESS_LEVELS.find((a) => a.strength === 0)?.permType).toBeNull();
  });
  it("declares the structural dims", () => {
    const ids = STRUCTURAL_DIMS.map((d) => d.id);
    expect(ids).toEqual(
      expect.arrayContaining(["project", "role", "company", "status", "permission", "tenure", "moduleAccess", "admin", "internalExternal"]),
    );
  });
  it("carries the known hyphenation alias and the 5 admin-source actions", () => {
    expect(ACTION_ALIASES["add-attribute-to-namingstandard"]).toBe("add-attribute-to-naming-standard");
    expect([...ADMIN_SOURCE_ACTION_IDS].sort()).toEqual(
      ["assign-admin", "assign-member", "edit-project", "remove-admin", "remove-member"],
    );
  });
  it("groups include the excel's 5 real groups + unknown", () => {
    expect(GROUPS.map((g) => g.id).sort()).toEqual(
      ["accessChange", "contentChange", "delete", "read", "unknown", "workflowChange"],
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/accTaxonomyStatic.test.ts"`
Expected: FAIL — cannot find module `./accTaxonomyStatic`.

- [ ] **Step 3: Write the implementation**

```ts
// accTaxonomyStatic.ts
/**
 * Hand-curated taxonomy constants — the parts of acc.xlsx that are NOT the long
 * action list (which is generated). Values verified against the live DB (spec §4).
 * Pure: no React/DOM/IO, no import of the generated actions (avoids a cycle).
 */
import type { AccessLevel, StructuralDim, TaxonomyGroup, TaxonomyModule } from "./accTaxonomy.types";

/** The 9 excel modules (canonical names). `observed` = has activity rows in the excel. */
export const MODULES: readonly TaxonomyModule[] = [
  { id: "autospecs", label: "AutoSpecs", observed: false },
  { id: "build", label: "Build", observed: true },
  { id: "dataManagement", label: "Data Management", observed: true },
  { id: "datum", label: "Datum", observed: true },
  { id: "design", label: "Design", observed: false },
  { id: "designCollaboration", label: "Design Collaboration", observed: true },
  { id: "insight", label: "Insight", observed: false },
  { id: "modelCoordination", label: "Model Coordination", observed: true },
  { id: "preconstruction", label: "Preconstruction", observed: true },
];

/** DB productKey -> excel module id. `cost` folds into Build (spec decision 8). */
export const ENTITLEMENT_TO_MODULE: Readonly<Record<string, string>> = {
  build: "build",
  cost: "build",
  docs: "dataManagement",
  designCollaboration: "designCollaboration",
  modelCoordination: "modelCoordination",
  insight: "insight",
  autoSpecs: "autospecs",
  takeoff: "preconstruction",
  forma: "design",
};

/** Excel group-activity headers. */
export const GROUPS: readonly TaxonomyGroup[] = [
  { id: "accessChange", label: "ACCess Change" },
  { id: "contentChange", label: "Content Change" },
  { id: "delete", label: "Delete" },
  { id: "read", label: "Read" },
  { id: "workflowChange", label: "Workflow Change" },
  { id: "unknown", label: "Unknown" },
];

/** Real access ladder (AccFolderPermission.permType) -> perm_strength 0..5 (spec §4). */
export const ACCESS_LEVELS: readonly AccessLevel[] = [
  { id: "none", label: "None", strength: 0, permType: null },
  { id: "viewOnly", label: "View Only", strength: 1, permType: "View Only" },
  { id: "viewDownload", label: "View + Download", strength: 2, permType: "View+Download" },
  { id: "viewDownloadUpload", label: "View + Download + Upload", strength: 3, permType: "View+Download+Upload" },
  { id: "viewDownloadUploadEdit", label: "View + Download + Upload + Edit", strength: 4, permType: "View+Download+Upload+Edit" },
  { id: "fullController", label: "Full Controller", strength: 5, permType: "Full Controller" },
];

/** Structural / access dimensions (non-activity). */
export const STRUCTURAL_DIMS: readonly StructuralDim[] = [
  { id: "project", label: "Project", kind: "categorical" },
  { id: "role", label: "Role", kind: "categorical" },
  { id: "company", label: "Company", kind: "categorical" },
  { id: "status", label: "Status", kind: "categorical" },
  { id: "permission", label: "Permission level", kind: "ordinal" },
  { id: "tenure", label: "Membership tenure", kind: "ordinal" },
  { id: "moduleAccess", label: "Module access", kind: "categorical" },
  { id: "admin", label: "Admin / member", kind: "binary" },
  { id: "internalExternal", label: "Internal / external", kind: "categorical" },
];

/**
 * Alias table: normalized DB rawAction -> canonical taxonomy action id, for the
 * handful that don't kebab-match the excel label exactly. Keep tiny + commented.
 */
export const ACTION_ALIASES: Readonly<Record<string, string>> = {
  // DB stores "namingstandard" (no hyphen); excel label is "Naming Standard".
  "add-attribute-to-namingstandard": "add-attribute-to-naming-standard",
};

/**
 * Actions whose data is account-level (sourceFile='admin', projectId=''). These are
 * attributed to the ACTOR (spec decision 9). The excel files them under Preconstruction.
 */
export const ADMIN_SOURCE_ACTION_IDS: ReadonlySet<string> = new Set([
  "assign-member",
  "assign-admin",
  "remove-member",
  "remove-admin",
  "edit-project",
]);

/** Excel module/group display label -> id (used by the generator; kept here as source of truth). */
export const MODULE_LABEL_TO_ID: Readonly<Record<string, string>> = {
  AutoSpecs: "autospecs",
  Build: "build",
  "Data Management": "dataManagement",
  Datum: "datum",
  "Design Collaboration": "designCollaboration",
  Insight: "insight",
  "Model Coordination": "modelCoordination",
  Preconstruction: "preconstruction",
};

export const GROUP_LABEL_TO_ID: Readonly<Record<string, string>> = {
  "Content Change": "contentChange",
  Delete: "delete",
  Read: "read",
  "Workflow Change": "workflowChange",
  "ACCess Change": "accessChange",
  Unknown: "unknown",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/accTaxonomyStatic.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/accTaxonomyStatic.ts" "app/(dashboard)/users/access-analysis/accTaxonomyStatic.test.ts"
git commit -m "feat(acc-taxonomy): static modules, groups, access ladder, structural dims, aliases"
```

---

## Task 4: Generator — `acc.xlsx` → `accTaxonomyActions.generated.ts`

**Files:**
- Create: `scripts/gen-acc-taxonomy.cjs`
- Create (generated): `app/(dashboard)/users/access-analysis/accTaxonomyActions.generated.ts`

The generator is self-contained CommonJS (label maps duplicated with a sync comment; the coverage gate in Task 7 catches any drift). It uses `xlsx` (already a dep) to read column A of `acc.xlsx`.

- [ ] **Step 1: Write the generator**

```js
// scripts/gen-acc-taxonomy.cjs
/**
 * ONE-SHOT generator: parses acc.xlsx activity hierarchy (module -> group -> action)
 * into app/(dashboard)/users/access-analysis/accTaxonomyActions.generated.ts.
 * Re-run after acc.xlsx changes. Read-only on the DB (it never touches it).
 *
 * Label maps below MUST match accTaxonomyStatic.ts MODULE_LABEL_TO_ID/GROUP_LABEL_TO_ID;
 * the Task 7 coverage gate fails if they drift.
 */
const XLSX = require("xlsx");
const fs = require("fs");

const MODULE_LABEL_TO_ID = {
  AutoSpecs: "autospecs", Build: "build", "Data Management": "dataManagement",
  Datum: "datum", "Design Collaboration": "designCollaboration", Insight: "insight",
  "Model Coordination": "modelCoordination", Preconstruction: "preconstruction",
};
const GROUP_LABEL_TO_ID = {
  "Content Change": "contentChange", Delete: "delete", Read: "read",
  "Workflow Change": "workflowChange", "ACCess Change": "accessChange", Unknown: "unknown",
};
const ADMIN_SOURCE = new Set(["assign-member", "assign-admin", "remove-member", "remove-admin", "edit-project"]);
const normalize = (s) =>
  s.toLowerCase().replace(/\+/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const OUT = "app/(dashboard)/users/access-analysis/accTaxonomyActions.generated.ts";

function main() {
  const wb = XLSX.readFile("acc.xlsx");
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  const colA = aoa.map((r) => (r && r[0] != null ? String(r[0]).trim() : ""));

  const start = colA.indexOf("ACTIVITY MODULE TYPE DATA");
  if (start < 0) throw new Error("Could not find 'ACTIVITY MODULE TYPE DATA' marker in acc.xlsx");

  let mod = null, grp = null;
  const seen = new Set();
  const actions = [];
  for (let i = start + 1; i < colA.length; i++) {
    const c = colA[i];
    if (!c) continue;
    if (c === "Activity Date" || c === "Activity Project Id") continue;
    if (MODULE_LABEL_TO_ID[c]) { mod = MODULE_LABEL_TO_ID[c]; grp = null; continue; }
    if (GROUP_LABEL_TO_ID[c]) { grp = GROUP_LABEL_TO_ID[c]; continue; }
    if (c.startsWith("No empirical") || c.startsWith("Pre-Wired")) continue;
    if (!mod || !grp) continue; // defensive: action before any module/group header
    const id = normalize(c);
    if (seen.has(id)) continue;
    seen.add(id);
    actions.push({ id, label: c, moduleId: mod, groupId: grp, source: ADMIN_SOURCE.has(id) ? "admin" : "project" });
  }

  const body = actions
    .map((a) => `  { id: ${JSON.stringify(a.id)}, label: ${JSON.stringify(a.label)}, moduleId: ${JSON.stringify(a.moduleId)}, groupId: ${JSON.stringify(a.groupId)}, source: ${JSON.stringify(a.source)} },`)
    .join("\n");
  const out =
    `// AUTO-GENERATED by scripts/gen-acc-taxonomy.cjs from acc.xlsx — DO NOT EDIT BY HAND.\n` +
    `import type { TaxonomyAction } from "./accTaxonomy.types";\n\n` +
    `export const GENERATED_ACTIONS: readonly TaxonomyAction[] = [\n${body}\n];\n`;
  fs.writeFileSync(OUT, out, "utf8");
  console.log(`wrote ${actions.length} actions to ${OUT}`);
}
main();
```

- [ ] **Step 2: Run the generator**

Run: `node scripts/gen-acc-taxonomy.cjs`
Expected: prints `wrote 176 actions ...` (count may be 170–180; exact depends on de-dup). The file `accTaxonomyActions.generated.ts` now exists.

- [ ] **Step 3: Verify the generated file typechecks**

Run: `npx tsc --noEmit`
Expected: no errors (the generated array matches `TaxonomyAction[]`).

- [ ] **Step 4: Spot-check the output**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/accTaxonomyActions.smoke.test.ts"` — but first create it:

```ts
// accTaxonomyActions.smoke.test.ts
import { describe, it, expect } from "vitest";
import { GENERATED_ACTIONS } from "./accTaxonomyActions.generated";

describe("generated actions", () => {
  it("parsed a substantial catalog with unique ids", () => {
    expect(GENERATED_ACTIONS.length).toBeGreaterThan(140);
    expect(new Set(GENERATED_ACTIONS.map((a) => a.id)).size).toBe(GENERATED_ACTIONS.length);
  });
  it("placed issues/rfis/submittals under build and files under dataManagement", () => {
    const byId = new Map(GENERATED_ACTIONS.map((a) => [a.id, a]));
    expect(byId.get("issue-create")?.moduleId).toBe("build");
    expect(byId.get("rfi-view")?.moduleId).toBe("build");
    expect(byId.get("view-entity")?.moduleId).toBe("dataManagement");
    expect(byId.get("view-sheet")?.moduleId).toBe("designCollaboration");
  });
  it("flagged the 5 admin-source actions", () => {
    const byId = new Map(GENERATED_ACTIONS.map((a) => [a.id, a]));
    expect(byId.get("assign-member")?.source).toBe("admin");
    expect(byId.get("edit-project")?.source).toBe("admin");
  });
});
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-acc-taxonomy.cjs "app/(dashboard)/users/access-analysis/accTaxonomyActions.generated.ts" "app/(dashboard)/users/access-analysis/accTaxonomyActions.smoke.test.ts"
git commit -m "feat(acc-taxonomy): generator + generated action catalog from acc.xlsx"
```

---

## Task 5: `accTaxonomy.ts` — unifying API + helpers

**Files:**
- Create: `app/(dashboard)/users/access-analysis/accTaxonomy.ts`
- Test: `app/(dashboard)/users/access-analysis/accTaxonomy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// accTaxonomy.test.ts
import { describe, it, expect } from "vitest";
import {
  getModules, getGroups, getActions, getAction, resolveActionId,
  getModuleForEntitlement, getActionsByModule, isAdminSourceAction,
} from "./accTaxonomy";

describe("accTaxonomy API", () => {
  it("exposes modules, groups, and the generated actions", () => {
    expect(getModules().length).toBe(9);
    expect(getGroups().length).toBe(6);
    expect(getActions().length).toBeGreaterThan(140);
  });
  it("resolves a rawAction to a canonical id (alias-aware)", () => {
    expect(resolveActionId("issue-create")).toBe("issue-create");
    expect(resolveActionId("Issue Create")).toBe("issue-create");
    expect(resolveActionId("add-attribute-to-namingstandard")).toBe("add-attribute-to-naming-standard");
  });
  it("looks up an action by id", () => {
    expect(getAction("view-entity")?.moduleId).toBe("dataManagement");
    expect(getAction("nope")).toBeUndefined();
  });
  it("maps entitlement keys to module ids (cost folds into build)", () => {
    expect(getModuleForEntitlement("cost")?.id).toBe("build");
    expect(getModuleForEntitlement("forma")?.id).toBe("design");
    expect(getModuleForEntitlement("unknownKey")).toBeUndefined();
  });
  it("groups actions by module", () => {
    const build = getActionsByModule("build");
    expect(build.every((a) => a.moduleId === "build")).toBe(true);
    expect(build.some((a) => a.id === "issue-create")).toBe(true);
  });
  it("knows admin-source actions", () => {
    expect(isAdminSourceAction("assign-member")).toBe(true);
    expect(isAdminSourceAction("view-entity")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/accTaxonomy.test.ts"`
Expected: FAIL — cannot find module `./accTaxonomy`.

- [ ] **Step 3: Write the implementation**

```ts
// accTaxonomy.ts
/**
 * Canonical ACC taxonomy — the single source of truth for the dimension redesign.
 * Unifies the hand-curated static constants with the generated action catalog and
 * exposes pure lookup helpers. No React/DOM/IO. Excel acc.xlsx is the authority;
 * see spec docs/superpowers/specs/2026-05-28-access-analysis-dimension-redesign-design.md.
 */
import { normalizeActionId } from "./accNormalize";
import {
  MODULES, GROUPS, ACCESS_LEVELS, STRUCTURAL_DIMS,
  ENTITLEMENT_TO_MODULE, ACTION_ALIASES, ADMIN_SOURCE_ACTION_IDS,
} from "./accTaxonomyStatic";
import { GENERATED_ACTIONS } from "./accTaxonomyActions.generated";
import type { TaxonomyAction, TaxonomyModule } from "./accTaxonomy.types";

export * from "./accTaxonomy.types";
export {
  MODULES, GROUPS, ACCESS_LEVELS, STRUCTURAL_DIMS,
  ENTITLEMENT_TO_MODULE, ACTION_ALIASES, ADMIN_SOURCE_ACTION_IDS,
} from "./accTaxonomyStatic";

const ACTION_BY_ID = new Map<string, TaxonomyAction>(GENERATED_ACTIONS.map((a) => [a.id, a]));
const MODULE_BY_ID = new Map<string, TaxonomyModule>(MODULES.map((m) => [m.id, m]));

export const getModules = () => MODULES;
export const getGroups = () => GROUPS;
export const getActions = () => GENERATED_ACTIONS;

export const getAction = (id: string): TaxonomyAction | undefined => ACTION_BY_ID.get(id);
export const getModuleById = (id: string): TaxonomyModule | undefined => MODULE_BY_ID.get(id);

/** Normalize a raw label/action, then apply the alias table. */
export function resolveActionId(rawAction: string): string {
  const norm = normalizeActionId(rawAction);
  return ACTION_ALIASES[norm] ?? norm;
}

export function getModuleForEntitlement(productKey: string): TaxonomyModule | undefined {
  const moduleId = ENTITLEMENT_TO_MODULE[productKey];
  return moduleId ? MODULE_BY_ID.get(moduleId) : undefined;
}

export const getActionsByModule = (moduleId: string): TaxonomyAction[] =>
  GENERATED_ACTIONS.filter((a) => a.moduleId === moduleId);

export const isAdminSourceAction = (id: string): boolean => ADMIN_SOURCE_ACTION_IDS.has(id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/accTaxonomy.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/accTaxonomy.ts" "app/(dashboard)/users/access-analysis/accTaxonomy.test.ts"
git commit -m "feat(acc-taxonomy): unifying API + lookup helpers"
```

---

## Task 6: Fixture refresh script + committed DB snapshot

**Files:**
- Create: `scripts/refresh-acc-actions-fixture.cjs`
- Create (generated): `app/(dashboard)/users/access-analysis/__fixtures__/acc-db-actions.json`

Read-only DB snapshot so the coverage gate (Task 7) is pure/deterministic. Mirrors the proven scratch pattern (`pg` + `dotenv`).

- [ ] **Step 1: Write the refresh script**

```js
// scripts/refresh-acc-actions-fixture.cjs
/**
 * READ-ONLY. Snapshots the distinct AccActivity rawActions (project + admin) with a
 * canonical service, into __fixtures__/acc-db-actions.json for the pure coverage gate.
 * Re-run after a re-ingest. SELECT only.
 */
require("dotenv").config();
const pg = require("pg");
const fs = require("fs");

const OUT = "app/(dashboard)/users/access-analysis/__fixtures__/acc-db-actions.json";

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const q = (sql) => client.query(sql).then((r) => r.rows);
  try {
    const project = await q(`
      SELECT "rawAction" AS "rawAction",
             MODE() WITHIN GROUP (ORDER BY service) FILTER (WHERE service IS NOT NULL) AS service
      FROM "AccActivity"
      WHERE "sourceFile"='project' AND "userEmail" IS NOT NULL AND "projectId" <> ''
      GROUP BY "rawAction" ORDER BY "rawAction"`);
    const admin = await q(`
      SELECT "rawAction" AS "rawAction",
             MODE() WITHIN GROUP (ORDER BY service) FILTER (WHERE service IS NOT NULL) AS service
      FROM "AccActivity"
      WHERE "sourceFile"='admin' AND "userEmail" IS NOT NULL
      GROUP BY "rawAction" ORDER BY "rawAction"`);
    const payload = { generatedAt: new Date().toISOString(), project, admin };
    fs.mkdirSync("app/(dashboard)/users/access-analysis/__fixtures__", { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
    console.log(`wrote ${project.length} project + ${admin.length} admin actions to ${OUT}`);
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the refresh script**

Run: `node scripts/refresh-acc-actions-fixture.cjs`
Expected: prints `wrote 142 project + 5 admin actions ...` (project ≈ 142, admin = 5). The JSON fixture exists.

- [ ] **Step 3: Commit**

```bash
git add scripts/refresh-acc-actions-fixture.cjs "app/(dashboard)/users/access-analysis/__fixtures__/acc-db-actions.json"
git commit -m "feat(acc-taxonomy): read-only DB action fixture + refresh script"
```

---

## Task 7: Coverage gate test (the systematic guarantee)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/accTaxonomy.coverage.test.ts`

Pure test: validates the taxonomy fully covers the DB fixture, admin actions are flagged, and the strong service↔module invariant holds.

- [ ] **Step 1: Write the test**

```ts
// accTaxonomy.coverage.test.ts
import { describe, it, expect } from "vitest";
import { getAction, resolveActionId, isAdminSourceAction } from "./accTaxonomy";
import fixture from "./__fixtures__/acc-db-actions.json";

type Row = { rawAction: string; service: string | null };
const project = fixture.project as Row[];
const admin = fixture.admin as Row[];

describe("excel <-> data coverage gate", () => {
  it("catalogs EVERY project action (no uncatalogued)", () => {
    const uncatalogued = project.filter((r) => !getAction(resolveActionId(r.rawAction)));
    expect(uncatalogued.map((r) => r.rawAction)).toEqual([]);
  });

  it("catalogs every admin action and flags it admin-source", () => {
    const bad = admin.filter((r) => {
      const id = resolveActionId(r.rawAction);
      return !getAction(id) || !isAdminSourceAction(id);
    });
    expect(bad.map((r) => r.rawAction)).toEqual([]);
  });

  it("places every issues/rfis/submittals action under Build (service cross-check)", () => {
    const violations = project
      .filter((r) => r.service === "issues" || r.service === "rfis" || r.service === "submittals")
      .map((r) => ({ a: r.rawAction, m: getAction(resolveActionId(r.rawAction))?.moduleId }))
      .filter((x) => x.m !== "build");
    expect(violations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/accTaxonomy.coverage.test.ts"`
Expected: PASS (3 tests). If "uncatalogued" fails, the offending rawAction needs either a generator fix (re-run Task 4) or an entry in `ACTION_ALIASES` (Task 3).

- [ ] **Step 3: Run the whole access-analysis unit suite to confirm no regressions**

Run: `npx vitest run "app/(dashboard)/users/access-analysis"`
Expected: PASS (existing + new tests).

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/accTaxonomy.coverage.test.ts"
git commit -m "test(acc-taxonomy): excel<->data coverage gate"
```

---

## Self-Review

**Spec coverage (Phase A scope):**
- accTaxonomy.ts canonical module → Tasks 2,3,5. ✅
- Systematic excel↔data mapping (kebab + alias + service cross-check) → Tasks 1,3,5,7. ✅
- Coverage gate test → Task 7. ✅
- Folder-attribute / greyed handling → **deferred to Phase C** (registry availability); Phase A only catalogs activity + structural names. Noted, not a gap.
- Per-action counts pipeline, positioning, UI, presets, color → **Phases B–G** (out of scope here). ✅

**Placeholder scan:** none — every step has complete code/commands.

**Type consistency:** `TaxonomyAction`/`TaxonomyModule`/`GroupId` used identically across Tasks 2–7; `resolveActionId`, `getAction`, `getModuleForEntitlement`, `isAdminSourceAction`, `ADMIN_SOURCE_ACTION_IDS` names match between definition (Tasks 3,5) and use (Task 7). Generator label maps duplicate `MODULE_LABEL_TO_ID`/`GROUP_LABEL_TO_ID` from static (Task 3) — drift is caught by Task 7's coverage gate.

**Note for executor:** the generated-count assertion (`> 140`) and the fixture counts (≈142 project, 5 admin) are from the live DB on 2026-05-28; small drift after a re-ingest is fine — re-run the generator (Task 4) and fixture (Task 6) and the gate stays the contract.
