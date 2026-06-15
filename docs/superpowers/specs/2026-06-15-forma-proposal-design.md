# Forma Proposal — design spec

**Date:** 2026-06-15
**Status:** Approved (brainstorming complete; awaiting spec review → plan)
**Branch:** feat/access-analysis-redesign

## 1. Goal

Add a new top-level tab, **Forma Proposal**, that lets the owner draft a folder-access
plan for the **ACC Template MTY** project. For each role, the owner assigns a permission
tier to each folder in the template's folder tree. The entire proposal is a **client-side
draft** stored in the browser cache — it is a planning canvas and is **never written back
to ACC**.

The template project is `def5fdea-8035-4b56-be60-66b36ba45149` ("ACC Template MTY"),
the same project shown at
`https://acc.autodesk.com/project-admin/template-settings/projects/def5fdea-8035-4b56-be60-66b36ba45149`.

## 2. Decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Role columns | Seed with the 26 curated roles from the owner's image (10 groups), **editable** — add / rename / delete in the UI, persisted in the draft |
| Folder rows | **All 206 folders** of the template, as a collapsible tree |
| Assignment UX | **Role-first walk**: pick one role, then assign tiers down the folder tree |
| Start state | **Blank** — every folder starts at "No access" |
| Inheritance | **Inherit + Apply-to-subtree** (see §6) |
| Export | **In v1** — download the full proposal as JSON and CSV |
| Persistence | `localStorage`, one draft per template, schema-versioned |
| ACC writes | **None.** Draft-only, ever. |

## 3. Data foundation (already in our DB)

- **Folders:** `AccFolder` already holds **206 rows** for the template project
  (`id`, `name`, `parentId`, `fullPath`). They form a real nested tree
  (`Project Files / 00_Client Documents / 01_Diseño Preconstrucción / …`).
  The page loads these server-side; no live ACC call is needed.
- **Permission tiers:** reuse `lib/acc/permissionMapping.ts`. The six real ACC tiers,
  highest → lowest, with their underlying `actions[]`:

  | Tier | ACC actions |
  | --- | --- |
  | Full Controller | VIEW, DOWNLOAD, COLLABORATE, PUBLISH, EDIT, CONTROL |
  | View+Download+Upload+Edit | VIEW, DOWNLOAD, COLLABORATE, PUBLISH, EDIT |
  | View+Download+Upload | VIEW, DOWNLOAD, COLLABORATE, PUBLISH |
  | Upload Only | PUBLISH |
  | View+Download | VIEW, DOWNLOAD, COLLABORATE |
  | View Only | VIEW, COLLABORATE |

  The UI adds one non-ACC sentinel state, **No access**, for an unassigned cell.
- **Roles:** the image roles are a **curated taxonomy**, *not* our raw `AccRole`
  list, so they are shipped as a built-in default seed (§4), not queried from the DB.

## 4. Default role taxonomy (seed)

26 roles across 10 groups (correcting the image's "Contrator"/"Administartion" typos):

- **BIM:** APS Specialist, Modeler Specialist, VDC Specialist
- **Commercial / Cost:** Estimator Specialist, Procurement Specialist
- **Site:** Site Specialist, Superintendent
- **Design:** Architect
- **Engineering:** Civil Engineer, Electrical Engineer, Fire Protection Engineer,
  HVAC Engineer, Mechanical Engineer, Plumbing Engineer, Site Engineer,
  Special Systems Engineer, Structural Engineer, Telecommunications Engineer
- **Governance:** Core Member, Executive Manager
- **Lean:** Lean Specialist
- **External:** Contractor, Owner
- **Administration:** Project Administrator, Document Controller
- **Safety:** Safety Manager

Each role has a stable `id` (slug), `label`, and `group`. On first open the draft is
seeded with a **full copy** of this list (stored as `draft.roles`); from then on the
draft owns its role list and the user's add/rename/delete edits apply to that copy. This
is the predictable choice for a non-technical owner — their roles never change underneath
them if the default seed is later revised. (Trade-off: a revised seed does not
retroactively reach existing drafts; acceptable for a single-owner planning tool.)

## 5. Data model

One logical matrix `assignment[roleId][folderId] = PermTier`. The role-first screen is a
view into it. Stored shape (only **explicit** assignments are persisted; everything else
is inherited or "No access"):

```ts
interface FormaDraft {
  version: number;            // schema version for migration safety
  templateProjectId: string;  // def5fdea-...
  roles: FormaRole[];         // the editable role list (seeded from default)
  // explicit overrides only — sparse:
  assignments: Record<string /*roleId*/, Record<string /*folderId*/, PermTier>>;
  updatedAt: string;          // ISO, for the "saved" indicator
}

interface FormaRole { id: string; label: string; group: string; }
```

Storing only explicit overrides keeps the cache tiny (hundreds of entries, not ~5,356
cells) and makes inheritance the natural default — the same model ACC itself uses.

## 6. Inheritance & bulk apply

- A folder with no explicit tier shows the **effective** tier inherited from its nearest
  ancestor that has one; with no such ancestor it is "No access". Inherited rows render
  greyed/italic with an "inherits ⤴" hint.
- Setting a folder's picker writes an **explicit override** (solid color) and exposes a
  "clear ↺" affordance to revert to inheriting.
- Each folder offers **Apply to subtree**: writes the chosen tier as an explicit override
  on that folder and every descendant in one action.
- Effective-tier resolution is a pure function over (folderId, explicit map, parent index).

## 7. Screen layout (role-first)

```
┌────────────────┬─────────────────────────────────────────────┐
│ ROLES          │  Role: VDC Specialist   [Export ▾] [Reset]   │
│                │  ───────────────────────────────────────────│
│ ▾ BIM          │  ▾ Project Files .............. [Full Ctrl ▾]│
│   APS Spec.    │     ▾ 00_Client Documents ..... [View+DL  ▾]│
│   Modeler      │        Información Recibida .... inherits ⤴  │
│ ▸ VDC Spec. ◀  │        RFIs ................... [View Only ▾]│
│ ▾ Engineering  │     ▸ 01_Diseño Precon ........ [Full Ctrl ▾]│
│   Civil Eng.   │        … (206 folders, collapsible)          │
│   …            │  ───────────────────────────────────────────│
│ [+ Add role]   │  Legend: ▢No ▢View ▢+DL ▢Upl ▢Edit ▢Full   │
└────────────────┴─────────────────────────────────────────────┘
```

- **Left rail (`RoleRail`)** — roles grouped by the 9 categories, collapsible; click to
  select the active role. Per-role coverage hint (e.g. "12 set"). `[+ Add role]`, rename,
  delete via `RoleManagerDialog`.
- **Main (`FolderTreeAssign`)** — the active role's view of the full folder tree;
  expand/collapse nodes; each row has a `TierPicker` and per-row "Apply to subtree" /
  "clear override".
- **Header** — active role name, **Export** (JSON / CSV), **Reset draft**, a "saved ✓"
  indicator. Tier color legend.

## 8. Export (v1)

A header **Export** menu produces a download of the *effective* matrix (inheritance
resolved) for all roles × all folders:

- **JSON** — `{ template, roles, folders:[{id,path}], matrix:{ [roleId]:{ [folderId]: tier } }, tierActions }`,
  where `tierActions` maps each tier to its ACC `actions[]` (from `TIER_DEFINITIONS`) so
  the file is actionable in ACC later.
- **CSV** — one row per folder (`path`), one column per role, cell = tier label.

Export is pure client-side (Blob download); no server round-trip, no ACC write.

## 9. Module breakdown (small, testable units)

| File | Responsibility | Tested |
| --- | --- | --- |
| `lib/forma/defaultRoles.ts` | the 26-role / 10-group seed (pure data) | unit (integrity) |
| `lib/forma/tiers.ts` | ordered tiers, "No access" sentinel, labels, colors, tier→actions | unit |
| `lib/forma/inheritance.ts` | build parent index, resolve effective tier, applyToSubtree, coverage counts | unit (TDD) |
| `lib/forma/draftStorage.ts` | load/save/migrate the `localStorage` draft | unit (TDD) |
| `lib/forma/exportProposal.ts` | resolve effective matrix → JSON / CSV strings | unit (TDD) |
| `app/(dashboard)/forma-proposal/page.tsx` | server: load 206 folders, build tree, render client | — |
| `…/components/FormaProposalClient.tsx` | state orchestration via a `useFormaDraft` hook | — |
| `…/components/RoleRail.tsx` | grouped role selector + add/rename/delete | — |
| `…/components/FolderTreeAssign.tsx` | tree + per-row picker / subtree / clear | — |
| `…/components/TierPicker.tsx` | tier dropdown (color-coded) | — |
| `…/components/RoleManagerDialog.tsx` | role CRUD modal | — |
| `components/layout/navigation.ts` | add the `/forma-proposal` nav entry (Organization group) | — |

The pure libs (`inheritance`, `draftStorage`, `exportProposal`) carry the risk and get
tests first (TDD). React components are wired on top of the tested hook + libs.

## 10. Scope boundaries (YAGNI)

- **Single template** (`def5fdea-…`) hardcoded as a constant; multi-template picker is a
  later extension (the constant is structured to allow it).
- **One draft** per template (auto-saved) with Reset; multiple named drafts deferred.
- **No ACC writes / no apply-to-ACC** in any form. Export is the only output.
- Roles seed is the image taxonomy only; no import from live `AccRole`.

## 11. Testing & gates

- Unit (vitest): new pure modules green; full suite stays green.
- `tsc` 0 errors.
- e2e (Playwright): one smoke spec — open tab, pick a role, set a folder, apply-to-subtree,
  reload → draft persists, export downloads. (Optional if e2e harness is busy.)
- Manual: owner rebuild + visual UAT (the dashboard ships by rebuild, not git deploy).
