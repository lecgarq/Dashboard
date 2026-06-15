# Forma Proposal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/forma-proposal` tab where the owner drafts per-role folder permissions for the ACC Template MTY folder tree, stored client-side, exportable, never written to ACC.

**Architecture:** A Next.js App Router server page loads the 206-folder tree from `AccFolder` and hands it to a client component. All draft state lives in `localStorage` as a sparse matrix of explicit overrides; inheritance and the effective matrix are computed by pure, unit-tested helpers. The role-first UI is one selected role at a time over the full collapsible tree, with apply-to-subtree and JSON/CSV export.

**Tech Stack:** Next.js (App Router, RSC), React client components, Prisma (`@/server/db`), Vitest (`globals: true`, colocated `*.test.ts`), shadcn UI primitives in `components/ui/`, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-06-15-forma-proposal-design.md`

---

## ⚠️ Branch hygiene (read first)

`feat/access-analysis-redesign` carries heavy uncommitted WIP. For **every** commit:
1. Run `git diff --cached --name-only` first — it must be empty or only the files you intend.
2. Stage by **explicit path only**: `git add -- path/a path/b`. Never `git add -A` or `git add .`.
3. Commit with an explicit pathspec: `git commit -m "..." -- path/a path/b`.

Files are LF in repo; Git may warn "LF will be replaced by CRLF" — that warning is expected and harmless on this Windows checkout.

---

## File Structure

**New pure libs (TDD core — `lib/forma/`)**
- `lib/forma/tiers.ts` — `FormaTier` (6 ACC tiers + `"No access"`), order, short labels, colors, `TIER_ACTIONS` (derived from `TIER_DEFINITIONS`).
- `lib/forma/defaultRoles.ts` — `FormaRole` type, `FORMA_GROUPS` order, `DEFAULT_FORMA_ROLES` (25 roles).
- `lib/forma/inheritance.ts` — `FormaFolder`, `ExplicitMap`, `buildFolderIndex`, `resolveEffectiveTier`, `applyToSubtree`, `countExplicit`.
- `lib/forma/draftStorage.ts` — `FormaDraft`, `DRAFT_VERSION`, `storageKey`, `emptyDraft`, `parseDraft`, `serializeDraft` (pure; no `localStorage`/`Date` calls).
- `lib/forma/exportProposal.ts` — `buildEffectiveMatrix`, `toJson`, `toCsv`.

**New server loader**
- `lib/server/formaFolderTree.ts` — `loadFormaFolderTree()` → `{ templateId, templateName, folders: FormaFolder[] }`.

**New route + client (`app/(dashboard)/forma-proposal/`)**
- `page.tsx` — server: load tree, render client.
- `components/useFormaDraft.ts` — client hook: localStorage load/save + mutators.
- `components/FormaProposalClient.tsx` — layout + orchestration.
- `components/RoleRail.tsx` — grouped role selector + coverage counts + add.
- `components/FolderTreeAssign.tsx` — collapsible tree + per-row picker/subtree/clear.
- `components/TierPicker.tsx` — color-coded tier dropdown.
- `components/RoleManagerDialog.tsx` — add/rename/delete a role.

**Modified**
- `components/layout/navigation.ts` — add the `/forma-proposal` entry.

**New e2e**
- `e2e/forma-proposal.spec.ts` — smoke (open, assign, subtree, reload-persist, export).

---

## Task 1: Tier model

**Files:**
- Create: `lib/forma/tiers.ts`
- Test: `lib/forma/tiers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/forma/tiers.test.ts
import { describe, it, expect } from "vitest";
import { FORMA_TIERS, NO_ACCESS, TIER_ACTIONS, TIER_SHORT, TIER_COLOR } from "./tiers";
import { TIER_DEFINITIONS } from "@/lib/acc/permissionMapping";

describe("forma tiers", () => {
  it("lists No access first, then the 6 ACC tiers low→high", () => {
    expect(FORMA_TIERS[0]).toBe(NO_ACCESS);
    expect(FORMA_TIERS).toHaveLength(7);
    expect(FORMA_TIERS[FORMA_TIERS.length - 1]).toBe("Full Controller");
  });

  it("No access maps to zero ACC actions", () => {
    expect(TIER_ACTIONS[NO_ACCESS]).toEqual([]);
  });

  it("each ACC tier's actions match the canonical TIER_DEFINITIONS", () => {
    for (const def of TIER_DEFINITIONS) {
      expect([...TIER_ACTIONS[def.tier]].sort()).toEqual([...def.actions].sort());
    }
  });

  it("every tier has a short label and a color", () => {
    for (const t of FORMA_TIERS) {
      expect(TIER_SHORT[t]).toBeTruthy();
      expect(TIER_COLOR[t]).toMatch(/^#/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/forma/tiers.test.ts`
Expected: FAIL — cannot find module `./tiers`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/forma/tiers.ts
// Forma permission tiers = the six canonical ACC tiers plus a UI-only "No access"
// sentinel for an unassigned cell. Action sets are DERIVED from the canonical
// permissionMapping so they can never drift out of sync.
import { TIER_DEFINITIONS, type PermTier } from "@/lib/acc/permissionMapping";

export const NO_ACCESS = "No access" as const;
export type FormaTier = PermTier | typeof NO_ACCESS;

/** UI order: lowest access first. */
export const FORMA_TIERS: readonly FormaTier[] = [
  NO_ACCESS,
  "View Only",
  "View+Download",
  "Upload Only",
  "View+Download+Upload",
  "View+Download+Upload+Edit",
  "Full Controller",
];

export const TIER_SHORT: Record<FormaTier, string> = {
  "No access": "—",
  "View Only": "View",
  "View+Download": "View+DL",
  "Upload Only": "Upload",
  "View+Download+Upload": "+Upload",
  "View+Download+Upload+Edit": "Edit",
  "Full Controller": "Full",
};

export const TIER_COLOR: Record<FormaTier, string> = {
  "No access": "#52525b",            // zinc-600
  "View Only": "#0e7490",            // cyan-700
  "View+Download": "#0d9488",        // teal-600
  "Upload Only": "#7c3aed",          // violet-600
  "View+Download+Upload": "#2563eb", // blue-600
  "View+Download+Upload+Edit": "#d97706", // amber-600
  "Full Controller": "#dc2626",      // red-600
};

/** tier → real ACC actions[]. Derived from canonical defs; "No access" = []. */
export const TIER_ACTIONS: Record<FormaTier, readonly string[]> = {
  [NO_ACCESS]: [],
  ...(Object.fromEntries(
    TIER_DEFINITIONS.map((d) => [d.tier, [...d.actions]]),
  ) as Record<PermTier, string[]>),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/forma/tiers.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git diff --cached --name-only   # must be empty
git add -- lib/forma/tiers.ts lib/forma/tiers.test.ts
git commit -m "feat(forma): tier model derived from canonical ACC tiers" -- lib/forma/tiers.ts lib/forma/tiers.test.ts
```

---

## Task 2: Default role seed

**Files:**
- Create: `lib/forma/defaultRoles.ts`
- Test: `lib/forma/defaultRoles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/forma/defaultRoles.test.ts
import { describe, it, expect } from "vitest";
import { DEFAULT_FORMA_ROLES, FORMA_GROUPS } from "./defaultRoles";

describe("default forma roles", () => {
  it("has 25 roles", () => {
    expect(DEFAULT_FORMA_ROLES).toHaveLength(25);
  });

  it("every role has a unique slug id", () => {
    const ids = DEFAULT_FORMA_ROLES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("every role's group is one of the declared FORMA_GROUPS", () => {
    for (const r of DEFAULT_FORMA_ROLES) expect(FORMA_GROUPS).toContain(r.group);
  });

  it("covers all 9 groups", () => {
    expect(new Set(DEFAULT_FORMA_ROLES.map((r) => r.group)).size).toBe(9);
    expect(FORMA_GROUPS).toHaveLength(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/forma/defaultRoles.test.ts`
Expected: FAIL — cannot find module `./defaultRoles`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/forma/defaultRoles.ts
// Curated role taxonomy from the owner's "ACC Roles" image (typos corrected).
// This is the immutable seed; a draft stores its own editable copy.
export interface FormaRole {
  id: string;     // stable slug
  label: string;  // display name
  group: string;  // one of FORMA_GROUPS
}

export const FORMA_GROUPS = [
  "BIM",
  "Commercial / Cost",
  "Design",
  "Engineering",
  "Governance",
  "Lean",
  "External",
  "Administration",
  "Safety",
] as const;

export const DEFAULT_FORMA_ROLES: FormaRole[] = [
  { id: "aps-specialist", label: "APS Specialist", group: "BIM" },
  { id: "modeler-specialist", label: "Modeler Specialist", group: "BIM" },
  { id: "vdc-specialist", label: "VDC Specialist", group: "BIM" },
  { id: "estimator-specialist", label: "Estimator Specialist", group: "Commercial / Cost" },
  { id: "procurement-specialist", label: "Procurement Specialist", group: "Commercial / Cost" },
  { id: "site-specialist", label: "Site Specialist", group: "Commercial / Cost" },
  { id: "architect", label: "Architect", group: "Design" },
  { id: "civil-engineer", label: "Civil Engineer", group: "Engineering" },
  { id: "electrical-engineer", label: "Electrical Engineer", group: "Engineering" },
  { id: "fire-protection-engineer", label: "Fire Protection Engineer", group: "Engineering" },
  { id: "hvac-engineer", label: "HVAC Engineer", group: "Engineering" },
  { id: "mechanical-engineer", label: "Mechanical Engineer", group: "Engineering" },
  { id: "plumbing-engineer", label: "Plumbing Engineer", group: "Engineering" },
  { id: "site-engineer", label: "Site Engineer", group: "Engineering" },
  { id: "special-systems-engineer", label: "Special Systems Engineer", group: "Engineering" },
  { id: "structural-engineer", label: "Structural Engineer", group: "Engineering" },
  { id: "telecommunications-engineer", label: "Telecommunications Engineer", group: "Engineering" },
  { id: "core-member", label: "Core Member", group: "Governance" },
  { id: "executive-manager", label: "Executive Manager", group: "Governance" },
  { id: "lean-specialist", label: "Lean Specialist", group: "Lean" },
  { id: "contractor", label: "Contractor", group: "External" },
  { id: "owner", label: "Owner", group: "External" },
  { id: "project-administrator", label: "Project Administrator", group: "Administration" },
  { id: "document-controller", label: "Document Controller", group: "Administration" },
  { id: "safety-manager", label: "Safety Manager", group: "Safety" },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/forma/defaultRoles.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git diff --cached --name-only   # must be empty
git add -- lib/forma/defaultRoles.ts lib/forma/defaultRoles.test.ts
git commit -m "feat(forma): 25-role / 9-group default taxonomy seed" -- lib/forma/defaultRoles.ts lib/forma/defaultRoles.test.ts
```

---

## Task 3: Inheritance engine

**Files:**
- Create: `lib/forma/inheritance.ts`
- Test: `lib/forma/inheritance.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/forma/inheritance.test.ts
import { describe, it, expect } from "vitest";
import {
  buildFolderIndex,
  resolveEffectiveTier,
  applyToSubtree,
  countExplicit,
  type FormaFolder,
} from "./inheritance";

// tree:  root → a → a1, a2 ;  root → b
const FOLDERS: FormaFolder[] = [
  { id: "root", parentId: null, name: "Project Files", fullPath: "/Project Files" },
  { id: "a", parentId: "root", name: "A", fullPath: "/Project Files/A" },
  { id: "a1", parentId: "a", name: "A1", fullPath: "/Project Files/A/A1" },
  { id: "a2", parentId: "a", name: "A2", fullPath: "/Project Files/A/A2" },
  { id: "b", parentId: "root", name: "B", fullPath: "/Project Files/B" },
];

describe("inheritance", () => {
  it("default (no explicit) resolves to No access, not inherited", () => {
    const { byId } = buildFolderIndex(FOLDERS);
    expect(resolveEffectiveTier("a1", {}, byId)).toEqual({
      tier: "No access", inherited: false, sourceId: null,
    });
  });

  it("a child inherits the nearest ancestor's explicit tier", () => {
    const { byId } = buildFolderIndex(FOLDERS);
    const explicit = { a: "View+Download" as const };
    expect(resolveEffectiveTier("a1", explicit, byId)).toEqual({
      tier: "View+Download", inherited: true, sourceId: "a",
    });
  });

  it("an explicit value on the folder itself wins and is not inherited", () => {
    const { byId } = buildFolderIndex(FOLDERS);
    const explicit = { a: "View+Download" as const, a1: "No access" as const };
    expect(resolveEffectiveTier("a1", explicit, byId)).toEqual({
      tier: "No access", inherited: false, sourceId: "a1",
    });
  });

  it("applyToSubtree stamps the folder and every descendant explicitly", () => {
    const index = buildFolderIndex(FOLDERS);
    const next = applyToSubtree("a", "Full Controller", {}, index);
    expect(next).toEqual({ a: "Full Controller", a1: "Full Controller", a2: "Full Controller" });
    // does not touch siblings/root
    expect(next.b).toBeUndefined();
    expect(next.root).toBeUndefined();
  });

  it("applyToSubtree returns a new object (no mutation)", () => {
    const index = buildFolderIndex(FOLDERS);
    const prev = { b: "View Only" as const };
    const next = applyToSubtree("a", "Full Controller", prev, index);
    expect(prev).toEqual({ b: "View Only" });           // unchanged
    expect(next.b).toBe("View Only");                    // preserved
    expect(next.a).toBe("Full Controller");
  });

  it("countExplicit counts set folders", () => {
    expect(countExplicit({ a: "View Only", b: "No access" })).toBe(2);
    expect(countExplicit({})).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/forma/inheritance.test.ts`
Expected: FAIL — cannot find module `./inheritance`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/forma/inheritance.ts
// Pure folder-tree permission resolution. A role's assignments are a sparse map
// of EXPLICIT overrides (folderId → tier, including an explicit "No access").
// A folder with no explicit entry inherits the nearest ancestor that has one.
import { NO_ACCESS, type FormaTier } from "./tiers";

export interface FormaFolder {
  id: string;
  parentId: string | null;
  name: string;
  fullPath: string | null;
}

/** roleId-scoped explicit overrides: folderId → tier. */
export type ExplicitMap = Record<string, FormaTier>;

export interface FolderIndex {
  byId: Map<string, FormaFolder>;
  childrenOf: Map<string | null, FormaFolder[]>;
  roots: FormaFolder[];
}

export function buildFolderIndex(folders: FormaFolder[]): FolderIndex {
  const byId = new Map<string, FormaFolder>();
  const childrenOf = new Map<string | null, FormaFolder[]>();
  for (const f of folders) {
    byId.set(f.id, f);
    const arr = childrenOf.get(f.parentId);
    if (arr) arr.push(f);
    else childrenOf.set(f.parentId, [f]);
  }
  // A folder is a root when it has no parent, or its parent is not in this set.
  const roots = folders.filter((f) => f.parentId === null || !byId.has(f.parentId));
  return { byId, childrenOf, roots };
}

export interface EffectiveTier {
  tier: FormaTier;
  inherited: boolean;
  sourceId: string | null; // folder the value came from, or null for the default
}

export function resolveEffectiveTier(
  folderId: string,
  explicit: ExplicitMap,
  byId: Map<string, FormaFolder>,
): EffectiveTier {
  if (Object.prototype.hasOwnProperty.call(explicit, folderId)) {
    return { tier: explicit[folderId], inherited: false, sourceId: folderId };
  }
  let cur = byId.get(folderId)?.parentId ?? null;
  const guard = new Set<string>(); // cycle safety
  while (cur !== null && !guard.has(cur)) {
    guard.add(cur);
    if (Object.prototype.hasOwnProperty.call(explicit, cur)) {
      return { tier: explicit[cur], inherited: true, sourceId: cur };
    }
    cur = byId.get(cur)?.parentId ?? null;
  }
  return { tier: NO_ACCESS, inherited: false, sourceId: null };
}

export function applyToSubtree(
  folderId: string,
  tier: FormaTier,
  explicit: ExplicitMap,
  index: FolderIndex,
): ExplicitMap {
  const next: ExplicitMap = { ...explicit };
  const stack = [folderId];
  const guard = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (guard.has(id)) continue;
    guard.add(id);
    next[id] = tier;
    for (const child of index.childrenOf.get(id) ?? []) stack.push(child.id);
  }
  return next;
}

export function countExplicit(explicit: ExplicitMap): number {
  return Object.keys(explicit).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/forma/inheritance.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git diff --cached --name-only
git add -- lib/forma/inheritance.ts lib/forma/inheritance.test.ts
git commit -m "feat(forma): pure inheritance + apply-to-subtree engine" -- lib/forma/inheritance.ts lib/forma/inheritance.test.ts
```

---

## Task 4: Draft storage (pure)

**Files:**
- Create: `lib/forma/draftStorage.ts`
- Test: `lib/forma/draftStorage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/forma/draftStorage.test.ts
import { describe, it, expect } from "vitest";
import {
  DRAFT_VERSION, storageKey, emptyDraft, parseDraft, serializeDraft,
} from "./draftStorage";
import { DEFAULT_FORMA_ROLES } from "./defaultRoles";

const NOW = "2026-06-15T00:00:00.000Z";

describe("draftStorage", () => {
  it("storageKey includes template id and version", () => {
    expect(storageKey("tpl")).toBe(`forma-proposal:tpl:v${DRAFT_VERSION}`);
  });

  it("emptyDraft seeds the given roles and empty assignments", () => {
    const d = emptyDraft("tpl", DEFAULT_FORMA_ROLES, NOW);
    expect(d.version).toBe(DRAFT_VERSION);
    expect(d.templateProjectId).toBe("tpl");
    expect(d.roles).toHaveLength(25);
    expect(d.assignments).toEqual({});
    expect(d.updatedAt).toBe(NOW);
  });

  it("serialize → parse round-trips", () => {
    const d = emptyDraft("tpl", DEFAULT_FORMA_ROLES, NOW);
    d.assignments = { architect: { root: "Full Controller" } };
    expect(parseDraft(serializeDraft(d))).toEqual(d);
  });

  it("parseDraft returns null for null / garbage / wrong version", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("not json")).toBeNull();
    expect(parseDraft(JSON.stringify({ version: 999 }))).toBeNull();
    expect(parseDraft(JSON.stringify({ version: DRAFT_VERSION }))).toBeNull(); // missing fields
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/forma/draftStorage.test.ts`
Expected: FAIL — cannot find module `./draftStorage`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/forma/draftStorage.ts
// Pure (de)serialization for the localStorage draft. No localStorage / Date here
// — the React hook supplies "now" and performs the I/O, keeping this testable.
import type { FormaTier } from "./tiers";
import type { FormaRole } from "./defaultRoles";

export const DRAFT_VERSION = 1;

export interface FormaDraft {
  version: number;
  templateProjectId: string;
  roles: FormaRole[];
  /** roleId → folderId → tier (explicit overrides only). */
  assignments: Record<string, Record<string, FormaTier>>;
  updatedAt: string; // ISO
}

export function storageKey(templateProjectId: string): string {
  return `forma-proposal:${templateProjectId}:v${DRAFT_VERSION}`;
}

export function emptyDraft(
  templateProjectId: string,
  roles: FormaRole[],
  nowIso: string,
): FormaDraft {
  return {
    version: DRAFT_VERSION,
    templateProjectId,
    roles: roles.map((r) => ({ ...r })), // own copy
    assignments: {},
    updatedAt: nowIso,
  };
}

export function serializeDraft(draft: FormaDraft): string {
  return JSON.stringify(draft);
}

export function parseDraft(raw: string | null): FormaDraft | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const d = obj as Partial<FormaDraft>;
  if (d.version !== DRAFT_VERSION) return null; // future: migrate instead of drop
  if (typeof d.templateProjectId !== "string") return null;
  if (!Array.isArray(d.roles)) return null;
  if (typeof d.assignments !== "object" || d.assignments === null) return null;
  if (typeof d.updatedAt !== "string") return null;
  return d as FormaDraft;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/forma/draftStorage.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git diff --cached --name-only
git add -- lib/forma/draftStorage.ts lib/forma/draftStorage.test.ts
git commit -m "feat(forma): pure draft (de)serialization + version guard" -- lib/forma/draftStorage.ts lib/forma/draftStorage.test.ts
```

---

## Task 5: Export (JSON + CSV)

**Files:**
- Create: `lib/forma/exportProposal.ts`
- Test: `lib/forma/exportProposal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/forma/exportProposal.test.ts
import { describe, it, expect } from "vitest";
import { buildEffectiveMatrix, toJson, toCsv, type ExportInput } from "./exportProposal";
import type { FormaFolder } from "./inheritance";

const folders: FormaFolder[] = [
  { id: "root", parentId: null, name: "Project Files", fullPath: "/Project Files" },
  { id: "a", parentId: "root", name: "A, B", fullPath: "/Project Files/A, B" }, // comma → CSV quoting
];
const input: ExportInput = {
  templateProjectId: "tpl",
  templateName: "ACC Template MTY",
  roles: [{ id: "architect", label: "Architect", group: "Design" }],
  folders,
  assignments: { architect: { root: "View+Download" } }, // 'a' inherits root
};

describe("exportProposal", () => {
  it("buildEffectiveMatrix resolves inheritance for every role×folder", () => {
    const m = buildEffectiveMatrix(input);
    expect(m.architect.root).toBe("View+Download");
    expect(m.architect.a).toBe("View+Download"); // inherited
  });

  it("toJson includes tierActions and the effective matrix", () => {
    const parsed = JSON.parse(toJson(input));
    expect(parsed.template.name).toBe("ACC Template MTY");
    expect(parsed.matrix.architect.a).toBe("View+Download");
    expect(parsed.tierActions["Full Controller"]).toContain("CONTROL");
  });

  it("toCsv has a header row and quotes fields with commas", () => {
    const csv = toCsv(input);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("Folder Path,Architect");
    // folder 'a' path contains a comma → must be quoted
    expect(lines).toContain('"/Project Files/A, B",View+Download');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/forma/exportProposal.test.ts`
Expected: FAIL — cannot find module `./exportProposal`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/forma/exportProposal.ts
// Resolve the full effective matrix (inheritance applied) and render JSON / CSV.
// Pure — callers wrap the strings in a Blob for download.
import { TIER_ACTIONS, type FormaTier } from "./tiers";
import type { FormaRole } from "./defaultRoles";
import {
  buildFolderIndex, resolveEffectiveTier, type FormaFolder,
} from "./inheritance";

export interface ExportInput {
  templateProjectId: string;
  templateName: string;
  roles: FormaRole[];
  folders: FormaFolder[];
  assignments: Record<string, Record<string, FormaTier>>;
}

/** roleId → folderId → effective tier (inheritance resolved). */
export function buildEffectiveMatrix(
  input: ExportInput,
): Record<string, Record<string, FormaTier>> {
  const { byId } = buildFolderIndex(input.folders);
  const out: Record<string, Record<string, FormaTier>> = {};
  for (const role of input.roles) {
    const explicit = input.assignments[role.id] ?? {};
    const row: Record<string, FormaTier> = {};
    for (const f of input.folders) {
      row[f.id] = resolveEffectiveTier(f.id, explicit, byId).tier;
    }
    out[role.id] = row;
  }
  return out;
}

export function toJson(input: ExportInput): string {
  return JSON.stringify(
    {
      template: { id: input.templateProjectId, name: input.templateName },
      roles: input.roles,
      folders: input.folders.map((f) => ({ id: f.id, path: f.fullPath ?? f.name })),
      matrix: buildEffectiveMatrix(input),
      tierActions: TIER_ACTIONS,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(input: ExportInput): string {
  const matrix = buildEffectiveMatrix(input);
  const header = ["Folder Path", ...input.roles.map((r) => r.label)].map(csvCell).join(",");
  const sorted = [...input.folders].sort((a, b) =>
    (a.fullPath ?? a.name).localeCompare(b.fullPath ?? b.name),
  );
  const rows = sorted.map((f) => {
    const path = f.fullPath ?? f.name;
    const cells = input.roles.map((r) => matrix[r.id][f.id]);
    return [path, ...cells].map(csvCell).join(",");
  });
  return [header, ...rows].join("\n") + "\n";
}
```

> Note: `toJson` calls `new Date().toISOString()` — fine in app code (the ban on `Date.now()` applies only to Workflow scripts). The unit test does not assert on `generatedAt`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/forma/exportProposal.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git diff --cached --name-only
git add -- lib/forma/exportProposal.ts lib/forma/exportProposal.test.ts
git commit -m "feat(forma): effective-matrix JSON/CSV export" -- lib/forma/exportProposal.ts lib/forma/exportProposal.test.ts
```

---

## Task 6: Server folder-tree loader

**Files:**
- Create: `lib/server/formaFolderTree.ts`

(No unit test — thin DB I/O. Verified by `tsc` and by the page rendering folders.)

- [ ] **Step 1: Write the loader**

```ts
// lib/server/formaFolderTree.ts
import "server-only";
import { db } from "@/server/db";
import { TEMPLATE_MTY_ID, TEMPLATE_MTY_NAME } from "@/lib/acc/template-mty";
import type { FormaFolder } from "@/lib/forma/inheritance";

export interface FormaFolderTree {
  templateId: string;
  templateName: string;
  folders: FormaFolder[];
}

/** Load the ACC Template MTY folder tree (id, parentId, name, fullPath). */
export async function loadFormaFolderTree(): Promise<FormaFolderTree> {
  const folders = await db.accFolder.findMany({
    where: { projectId: TEMPLATE_MTY_ID },
    select: { id: true, parentId: true, name: true, fullPath: true },
    orderBy: { fullPath: "asc" },
  });
  return { templateId: TEMPLATE_MTY_ID, templateName: TEMPLATE_MTY_NAME, folders };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git diff --cached --name-only
git add -- lib/server/formaFolderTree.ts
git commit -m "feat(forma): server loader for template folder tree" -- lib/server/formaFolderTree.ts
```

---

## Task 7: Navigation entry

**Files:**
- Modify: `components/layout/navigation.ts`

- [ ] **Step 1: Add the icon import**

In the import block (lines 1-16), add `FolderTree` to the lucide-react import list (alphabetical-ish, next to existing icons):

```ts
  FolderTree,
```

- [ ] **Step 2: Add the nav item**

In `MODULE_NAV_ITEMS`, immediately AFTER the `/template-mty` entry (line 32), add:

```ts
  { href: "/forma-proposal", label: "Forma Proposal", icon: FolderTree, group: "Organization" },
```

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors. (Route doesn't exist yet — that's fine; nav is just data. Build comes after Task 13.)

- [ ] **Step 4: Commit**

```bash
git diff --cached --name-only
git add -- components/layout/navigation.ts
git commit -m "feat(forma): add Forma Proposal nav entry" -- components/layout/navigation.ts
```

---

## Task 8: Draft hook + client state

**Files:**
- Create: `app/(dashboard)/forma-proposal/components/useFormaDraft.ts`

(Client hook. Verified by `tsc` + later e2e. The pure logic it wraps is already tested.)

- [ ] **Step 1: Write the hook**

```ts
// app/(dashboard)/forma-proposal/components/useFormaDraft.ts
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_FORMA_ROLES, type FormaRole } from "@/lib/forma/defaultRoles";
import {
  emptyDraft, parseDraft, serializeDraft, storageKey, type FormaDraft,
} from "@/lib/forma/draftStorage";
import {
  applyToSubtree, buildFolderIndex, type ExplicitMap, type FormaFolder,
} from "@/lib/forma/inheritance";
import type { FormaTier } from "@/lib/forma/tiers";

export function useFormaDraft(templateId: string, folders: FormaFolder[]) {
  const index = useMemo(() => buildFolderIndex(folders), [folders]);
  const [draft, setDraft] = useState<FormaDraft>(() =>
    emptyDraft(templateId, DEFAULT_FORMA_ROLES, "1970-01-01T00:00:00.000Z"),
  );
  const [hydrated, setHydrated] = useState(false);

  // Load once on mount (client only).
  useEffect(() => {
    const saved = parseDraft(localStorage.getItem(storageKey(templateId)));
    setDraft(saved ?? emptyDraft(templateId, DEFAULT_FORMA_ROLES, new Date().toISOString()));
    setHydrated(true);
  }, [templateId]);

  // Persist on change (after hydration so we never clobber the saved draft).
  const skip = useRef(true);
  useEffect(() => {
    if (!hydrated) return;
    if (skip.current) { skip.current = false; return; }
    localStorage.setItem(storageKey(templateId), serializeDraft(draft));
  }, [draft, hydrated, templateId]);

  const touch = (d: FormaDraft): FormaDraft => ({ ...d, updatedAt: new Date().toISOString() });

  const setTier = useCallback((roleId: string, folderId: string, tier: FormaTier) => {
    setDraft((d) => {
      const role: ExplicitMap = { ...(d.assignments[roleId] ?? {}) };
      role[folderId] = tier;
      return touch({ ...d, assignments: { ...d.assignments, [roleId]: role } });
    });
  }, []);

  const clearTier = useCallback((roleId: string, folderId: string) => {
    setDraft((d) => {
      const role: ExplicitMap = { ...(d.assignments[roleId] ?? {}) };
      delete role[folderId];
      return touch({ ...d, assignments: { ...d.assignments, [roleId]: role } });
    });
  }, []);

  const applySubtree = useCallback((roleId: string, folderId: string, tier: FormaTier) => {
    setDraft((d) => {
      const role = applyToSubtree(folderId, tier, d.assignments[roleId] ?? {}, index);
      return touch({ ...d, assignments: { ...d.assignments, [roleId]: role } });
    });
  }, [index]);

  const addRole = useCallback((role: FormaRole) => {
    setDraft((d) => touch({ ...d, roles: [...d.roles, role] }));
  }, []);

  const renameRole = useCallback((roleId: string, label: string) => {
    setDraft((d) => touch({ ...d, roles: d.roles.map((r) => (r.id === roleId ? { ...r, label } : r)) }));
  }, []);

  const deleteRole = useCallback((roleId: string) => {
    setDraft((d) => {
      const assignments = { ...d.assignments };
      delete assignments[roleId];
      return touch({ ...d, roles: d.roles.filter((r) => r.id !== roleId), assignments });
    });
  }, []);

  const reset = useCallback(() => {
    setDraft(emptyDraft(templateId, DEFAULT_FORMA_ROLES, new Date().toISOString()));
  }, [templateId]);

  return {
    draft, hydrated, index,
    setTier, clearTier, applySubtree, addRole, renameRole, deleteRole, reset,
  };
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git diff --cached --name-only
git add -- "app/(dashboard)/forma-proposal/components/useFormaDraft.ts"
git commit -m "feat(forma): useFormaDraft localStorage hook" -- "app/(dashboard)/forma-proposal/components/useFormaDraft.ts"
```

---

## Task 9: TierPicker

**Files:**
- Create: `app/(dashboard)/forma-proposal/components/TierPicker.tsx`

- [ ] **Step 1: Write the component**

```tsx
// app/(dashboard)/forma-proposal/components/TierPicker.tsx
"use client";
import { FORMA_TIERS, TIER_COLOR, TIER_SHORT, type FormaTier } from "@/lib/forma/tiers";

export function TierPicker({
  value, inherited, onChange,
}: {
  value: FormaTier;
  inherited: boolean;
  onChange: (tier: FormaTier) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-sm"
        style={{ backgroundColor: TIER_COLOR[value] }}
      />
      <select
        aria-label="permission tier"
        value={value}
        onChange={(e) => onChange(e.target.value as FormaTier)}
        className={`rounded-md border border-border bg-background px-1.5 py-0.5 text-xs ${
          inherited ? "italic text-muted-foreground" : "text-foreground"
        }`}
      >
        {FORMA_TIERS.map((t) => (
          <option key={t} value={t}>
            {TIER_SHORT[t]}
          </option>
        ))}
      </select>
    </span>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git diff --cached --name-only
git add -- "app/(dashboard)/forma-proposal/components/TierPicker.tsx"
git commit -m "feat(forma): color-coded TierPicker" -- "app/(dashboard)/forma-proposal/components/TierPicker.tsx"
```

---

## Task 10: FolderTreeAssign

**Files:**
- Create: `app/(dashboard)/forma-proposal/components/FolderTreeAssign.tsx`

- [ ] **Step 1: Write the component**

```tsx
// app/(dashboard)/forma-proposal/components/FolderTreeAssign.tsx
"use client";
import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, CornerLeftUp, Layers } from "lucide-react";
import { resolveEffectiveTier, type ExplicitMap, type FolderIndex } from "@/lib/forma/inheritance";
import type { FormaTier } from "@/lib/forma/tiers";
import { TierPicker } from "./TierPicker";

export function FolderTreeAssign({
  index, explicit, onSet, onClear, onApplySubtree,
}: {
  index: FolderIndex;
  explicit: ExplicitMap;
  onSet: (folderId: string, tier: FormaTier) => void;
  onClear: (folderId: string) => void;
  onApplySubtree: (folderId: string, tier: FormaTier) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const sortedRoots = useMemo(
    () => [...index.roots].sort((a, b) => (a.fullPath ?? a.name).localeCompare(b.fullPath ?? b.name)),
    [index.roots],
  );

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  function Row({ id, depth }: { id: string; depth: number }) {
    const folder = index.byId.get(id)!;
    const children = [...(index.childrenOf.get(id) ?? [])].sort((a, b) =>
      (a.fullPath ?? a.name).localeCompare(b.fullPath ?? b.name),
    );
    const hasChildren = children.length > 0;
    const isCollapsed = collapsed.has(id);
    const eff = resolveEffectiveTier(id, explicit, index.byId);

    return (
      <>
        <div
          className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/40"
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggle(id)}
            className="text-muted-foreground"
            aria-label={hasChildren ? (isCollapsed ? "expand" : "collapse") : "leaf"}
          >
            {hasChildren ? (
              isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />
            ) : (
              <span className="inline-block w-[14px]" />
            )}
          </button>
          <span className="flex-1 truncate text-sm" title={folder.fullPath ?? folder.name}>
            {folder.name}
          </span>
          {eff.inherited && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              inherits ⤴
            </span>
          )}
          <TierPicker
            value={eff.tier}
            inherited={eff.inherited}
            onChange={(tier) => onSet(id, tier)}
          />
          <button
            type="button"
            title="Apply this tier to this folder and everything inside it"
            onClick={() => onApplySubtree(id, eff.tier)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="apply to subtree"
          >
            <Layers size={14} />
          </button>
          <button
            type="button"
            title="Clear override (revert to inherited)"
            onClick={() => onClear(id)}
            disabled={eff.inherited || eff.sourceId === null}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="clear override"
          >
            <CornerLeftUp size={14} />
          </button>
        </div>
        {hasChildren && !isCollapsed && children.map((c) => (
          <Row key={c.id} id={c.id} depth={depth + 1} />
        ))}
      </>
    );
  }

  return (
    <div className="divide-y divide-border/40">
      {sortedRoots.map((r) => <Row key={r.id} id={r.id} depth={0} />)}
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git diff --cached --name-only
git add -- "app/(dashboard)/forma-proposal/components/FolderTreeAssign.tsx"
git commit -m "feat(forma): collapsible folder tree with per-row tier assignment" -- "app/(dashboard)/forma-proposal/components/FolderTreeAssign.tsx"
```

---

## Task 11: RoleRail

**Files:**
- Create: `app/(dashboard)/forma-proposal/components/RoleRail.tsx`

- [ ] **Step 1: Write the component**

```tsx
// app/(dashboard)/forma-proposal/components/RoleRail.tsx
"use client";
import { useMemo } from "react";
import { Plus, Pencil } from "lucide-react";
import { FORMA_GROUPS, type FormaRole } from "@/lib/forma/defaultRoles";
import { countExplicit } from "@/lib/forma/inheritance";
import type { FormaTier } from "@/lib/forma/tiers";

export function RoleRail({
  roles, assignments, activeRoleId, onSelect, onAddRole, onManage,
}: {
  roles: FormaRole[];
  assignments: Record<string, Record<string, FormaTier>>;
  activeRoleId: string;
  onSelect: (roleId: string) => void;
  onAddRole: () => void;
  onManage: (roleId: string) => void;
}) {
  const byGroup = useMemo(() => {
    const m = new Map<string, FormaRole[]>();
    for (const r of roles) {
      const arr = m.get(r.group);
      if (arr) arr.push(r);
      else m.set(r.group, [r]);
    }
    return m;
  }, [roles]);

  // Declared groups first (in canonical order), then any custom groups.
  const groupOrder = [
    ...FORMA_GROUPS.filter((g) => byGroup.has(g)),
    ...[...byGroup.keys()].filter((g) => !FORMA_GROUPS.includes(g as never)),
  ];

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Roles
        </span>
        <button
          type="button"
          onClick={onAddRole}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-primary hover:bg-primary/10"
        >
          <Plus size={12} /> Add
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 pb-3">
        {groupOrder.map((group) => (
          <div key={group} className="mb-2">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group}
            </div>
            {(byGroup.get(group) ?? []).map((r) => {
              const count = countExplicit(assignments[r.id] ?? {});
              const active = r.id === activeRoleId;
              return (
                <div
                  key={r.id}
                  className={`group flex items-center gap-1 rounded-md px-2 py-1 text-sm ${
                    active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <button type="button" onClick={() => onSelect(r.id)} className="flex-1 truncate text-left">
                    {r.label}
                  </button>
                  {count > 0 && (
                    <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onManage(r.id)}
                    className="opacity-0 transition group-hover:opacity-100"
                    aria-label="manage role"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git diff --cached --name-only
git add -- "app/(dashboard)/forma-proposal/components/RoleRail.tsx"
git commit -m "feat(forma): grouped role rail with coverage counts" -- "app/(dashboard)/forma-proposal/components/RoleRail.tsx"
```

---

## Task 12: RoleManagerDialog

**Files:**
- Create: `app/(dashboard)/forma-proposal/components/RoleManagerDialog.tsx`

Uses the existing `components/ui/dialog.tsx`, `input.tsx`, `button.tsx`, `label.tsx`.

- [ ] **Step 1: Write the component**

```tsx
// app/(dashboard)/forma-proposal/components/RoleManagerDialog.tsx
"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FORMA_GROUPS, type FormaRole } from "@/lib/forma/defaultRoles";

export type RoleDialogState =
  | { mode: "add" }
  | { mode: "edit"; role: FormaRole }
  | null;

function slugify(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function RoleManagerDialog({
  state, existingIds, onAdd, onRename, onDelete, onClose,
}: {
  state: RoleDialogState;
  existingIds: string[];
  onAdd: (role: FormaRole) => void;
  onRename: (roleId: string, label: string) => void;
  onDelete: (roleId: string) => void;
  onClose: () => void;
}) {
  const open = state !== null;
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState<string>(FORMA_GROUPS[0]);

  useEffect(() => {
    if (state?.mode === "edit") { setLabel(state.role.label); setGroup(state.role.group); }
    else { setLabel(""); setGroup(FORMA_GROUPS[0]); }
  }, [state]);

  const isEdit = state?.mode === "edit";
  const trimmed = label.trim();
  const dupId = !isEdit && existingIds.includes(slugify(trimmed));
  const canSave = trimmed.length > 0 && !dupId;

  function save() {
    if (!canSave) return;
    if (isEdit && state) onRename(state.role.id, trimmed);
    else onAdd({ id: slugify(trimmed), label: trimmed, group });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit role" : "Add role"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="role-label">Name</Label>
            <Input id="role-label" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
            {dupId && <p className="text-xs text-destructive">A role with that name already exists.</p>}
          </div>
          {!isEdit && (
            <div className="space-y-1">
              <Label htmlFor="role-group">Group</Label>
              <select
                id="role-group"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                {FORMA_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          )}
        </div>
        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          {isEdit ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => { if (state) onDelete(state.role.id); onClose(); }}
            >
              Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={!canSave}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors. If `dialog.tsx` does not export `DialogFooter`, replace that import/usage with a plain `<div className="flex justify-end gap-2">`. Confirm exports first:

Run: `npx grep -n "export" components/ui/dialog.tsx` (or open the file). Adjust imports to match actual exports.

- [ ] **Step 3: Commit**

```bash
git diff --cached --name-only
git add -- "app/(dashboard)/forma-proposal/components/RoleManagerDialog.tsx"
git commit -m "feat(forma): add/rename/delete role dialog" -- "app/(dashboard)/forma-proposal/components/RoleManagerDialog.tsx"
```

---

## Task 13: FormaProposalClient (orchestration + export) and page

**Files:**
- Create: `app/(dashboard)/forma-proposal/components/FormaProposalClient.tsx`
- Create: `app/(dashboard)/forma-proposal/page.tsx`

- [ ] **Step 1: Write the client orchestrator**

```tsx
// app/(dashboard)/forma-proposal/components/FormaProposalClient.tsx
"use client";
import { useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import type { FormaFolder } from "@/lib/forma/inheritance";
import { toCsv, toJson, type ExportInput } from "@/lib/forma/exportProposal";
import { FORMA_TIERS, TIER_COLOR, TIER_SHORT } from "@/lib/forma/tiers";
import { useFormaDraft } from "./useFormaDraft";
import { RoleRail } from "./RoleRail";
import { FolderTreeAssign } from "./FolderTreeAssign";
import { RoleManagerDialog, type RoleDialogState } from "./RoleManagerDialog";

function download(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function FormaProposalClient({
  templateId, templateName, folders,
}: {
  templateId: string;
  templateName: string;
  folders: FormaFolder[];
}) {
  const d = useFormaDraft(templateId, folders);
  const [activeRoleId, setActiveRoleId] = useState<string>(d.draft.roles[0]?.id ?? "");
  const [dialog, setDialog] = useState<RoleDialogState>(null);

  // Keep the active role valid as the list changes.
  const activeRole = d.draft.roles.find((r) => r.id === activeRoleId) ?? d.draft.roles[0];
  const activeId = activeRole?.id ?? "";
  const explicit = d.draft.assignments[activeId] ?? {};

  const exportInput = (): ExportInput => ({
    templateProjectId: templateId,
    templateName,
    roles: d.draft.roles,
    folders,
    assignments: d.draft.assignments,
  });

  if (!d.hydrated) {
    return <div className="p-8 text-sm text-muted-foreground">Loading your draft…</div>;
  }

  return (
    <div className="flex h-full min-h-0">
      <RoleRail
        roles={d.draft.roles}
        assignments={d.draft.assignments}
        activeRoleId={activeId}
        onSelect={setActiveRoleId}
        onAddRole={() => setDialog({ mode: "add" })}
        onManage={(roleId) => {
          const role = d.draft.roles.find((r) => r.id === roleId);
          if (role) setDialog({ mode: "edit", role });
        }}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">
              {activeRole?.label ?? "—"}
            </h2>
            <p className="truncate text-xs text-muted-foreground">{templateName} · draft</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => download(`forma-proposal-${templateId}.json`, toJson(exportInput()), "application/json")}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/40"
            >
              <Download size={13} /> JSON
            </button>
            <button
              type="button"
              onClick={() => download(`forma-proposal-${templateId}.csv`, toCsv(exportInput()), "text/csv")}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/40"
            >
              <Download size={13} /> CSV
            </button>
            <button
              type="button"
              onClick={() => { if (confirm("Reset the whole draft to blank?")) d.reset(); }}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
            >
              <RotateCcw size={13} /> Reset
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-2">
          {activeId ? (
            <FolderTreeAssign
              index={d.index}
              explicit={explicit}
              onSet={(folderId, tier) => d.setTier(activeId, folderId, tier)}
              onClear={(folderId) => d.clearTier(activeId, folderId)}
              onApplySubtree={(folderId, tier) => d.applySubtree(activeId, folderId, tier)}
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">Add a role to begin.</p>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span className="font-semibold uppercase tracking-wide">Legend</span>
          {FORMA_TIERS.map((t) => (
            <span key={t} className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: TIER_COLOR[t] }} />
              {TIER_SHORT[t]}
            </span>
          ))}
        </footer>
      </section>

      <RoleManagerDialog
        state={dialog}
        existingIds={d.draft.roles.map((r) => r.id)}
        onAdd={(role) => { d.addRole(role); setActiveRoleId(role.id); }}
        onRename={d.renameRole}
        onDelete={(roleId) => { d.deleteRole(roleId); }}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write the server page**

```tsx
// app/(dashboard)/forma-proposal/page.tsx
import { loadFormaFolderTree } from "@/lib/server/formaFolderTree";
import { FormaProposalClient } from "./components/FormaProposalClient";

export const metadata = { title: "Forma Proposal" };
export const dynamic = "force-dynamic";

export default async function FormaProposalRoute() {
  const { templateId, templateName, folders } = await loadFormaFolderTree();
  return (
    <div className="flex h-full min-h-0 flex-col text-foreground">
      <FormaProposalClient
        templateId={templateId}
        templateName={templateName}
        folders={folders}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify type-check + build**

Run: `npx tsc --noEmit`
Expected: 0 errors.

> Do NOT run `npm run build` against the dist used by the live `:3000` server (it 500s the running app — see project notes). Use the safe rebuild recipe at the end of the plan.

- [ ] **Step 4: Commit**

```bash
git diff --cached --name-only
git add -- "app/(dashboard)/forma-proposal/components/FormaProposalClient.tsx" "app/(dashboard)/forma-proposal/page.tsx"
git commit -m "feat(forma): client orchestrator + route page with export" -- "app/(dashboard)/forma-proposal/components/FormaProposalClient.tsx" "app/(dashboard)/forma-proposal/page.tsx"
```

---

## Task 14: e2e smoke

**Files:**
- Create: `e2e/forma-proposal.spec.ts`

> First open one existing spec under `e2e/` to copy this repo's auth/setup boilerplate (test-cookie minting, base URL `:3100`, the `NEXT_PUBLIC_*` test flags). Match it exactly; the skeleton below shows only the feature assertions.

- [ ] **Step 1: Write the smoke spec**

```ts
// e2e/forma-proposal.spec.ts
import { test, expect } from "@playwright/test";
// ↑ plus this repo's existing auth fixture/import — copy from a sibling spec.

test("forma proposal: assign, apply-to-subtree, persist, export", async ({ page }) => {
  await page.goto("/forma-proposal");

  // role rail shows the seeded roles
  await expect(page.getByText("VDC Specialist")).toBeVisible();

  // pick a role, set the root folder tier
  await page.getByText("VDC Specialist").click();
  const firstTier = page.getByLabel("permission tier").first();
  await firstTier.selectOption("Full Controller");

  // reload → draft persisted from localStorage
  await page.reload();
  await page.getByText("VDC Specialist").click();
  await expect(page.getByLabel("permission tier").first()).toHaveValue("Full Controller");

  // export JSON triggers a download
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "JSON" }).click(),
  ]);
  expect(dl.suggestedFilename()).toContain("forma-proposal");
});
```

- [ ] **Step 2: Run the smoke spec**

Run: `npm run test:e2e -- forma-proposal` (per the project's e2e script; server on `:3100`).
Expected: PASS. If the e2e harness/port is busy (known on the owner's PC), note it and defer to a manual check — do not block the plan on a busy port.

- [ ] **Step 3: Commit**

```bash
git diff --cached --name-only
git add -- e2e/forma-proposal.spec.ts
git commit -m "test(forma): e2e smoke for assign/persist/export" -- e2e/forma-proposal.spec.ts
```

---

## Task 15: Final gates

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run`
Expected: all green (existing suite + the new `lib/forma/*` tests).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Safe rebuild for the owner (manual UAT)**

The dashboard ships by rebuild, not git deploy, and a build against the live dist 500s the running app. Use the side-dist swap (per project notes), e.g.:

```bash
# build into a side directory, then swap and restart on :3000
NEXT_DIST_DIR=.next-new npm run build
# stop the running server, replace .next with .next-new, start
npm start
```

Then open `http://localhost:3000/forma-proposal`, pick a few roles, set tiers, Apply-to-subtree, reload to confirm persistence, and download JSON + CSV. This is the owner-facing visual UAT gate.

- [ ] **Step 4: Update memory**

After UAT passes, add a one-line entry to `C:\Users\luis.cortes\.claude\projects\C--LECG-Dashboard\memory\MEMORY.md` pointing to a new `project_forma_proposal.md` memory describing: the tab, the localStorage-draft model, the 25-role seed, inheritance/apply-to-subtree, export, and "never writes to ACC".

---

## Self-Review (filled in by plan author)

**Spec coverage:**
- New tab / nav → Task 7. ✅
- Editable 25-role / 9-group seed → Task 2 (seed) + Task 8 (add/rename/delete) + Task 12 (dialog). ✅
- All 206 folders as collapsible tree → Task 6 (loader) + Task 10 (tree). ✅
- Role-first walk → Task 11 (rail) + Task 13 (orchestrator selects one role). ✅
- 6 tiers + No access, color-coded → Task 1 + Task 9. ✅
- Inheritance + Apply-to-subtree → Task 3 + Task 10. ✅
- Start blank → Task 4 `emptyDraft` + Task 8 hook. ✅
- localStorage draft, schema-versioned, Reset → Task 4 + Task 8 + Task 13. ✅
- JSON + CSV export carrying tier→actions → Task 5 + Task 13. ✅
- Never writes to ACC → no ACC mutation anywhere; export is Blob-only. ✅
- Single template via `TEMPLATE_MTY_ID` constant → Task 6. ✅

**Placeholder scan:** none — every code step is complete. The only "adapt to repo" notes are Task 12 (confirm `DialogFooter` export) and Task 14 (copy e2e auth boilerplate); both name the exact check to run.

**Type consistency:** `FormaTier`, `FormaRole`, `FormaFolder`, `ExplicitMap`, `FolderIndex`, `FormaDraft`, `ExportInput` are defined once and imported everywhere. Hook mutators (`setTier`, `clearTier`, `applySubtree`, `addRole`, `renameRole`, `deleteRole`, `reset`) match their call sites in Tasks 11–13. `resolveEffectiveTier` returns `{ tier, inherited, sourceId }` and every consumer reads those names.
