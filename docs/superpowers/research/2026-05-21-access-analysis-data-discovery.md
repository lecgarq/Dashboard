# Access Analysis — Data Discovery (real extracted ACC/APS data)

> **Status:** Research artifact. No application code changed.
> **Generated from:** `scripts/scratch/access-analysis-data-discovery.cjs` run on **2026-05-22**
> against the live local Postgres (`AccDc*` snapshot tables + `AccActivity` + `AccFolderPermission`).
> **Machine-readable companion:** [`2026-05-21-access-analysis-data-inventory.json`](./2026-05-21-access-analysis-data-inventory.json)
> **Supersedes the data-audit figures in** `docs/superpowers/specs/2026-05-20-access-graph-dimension-model-design.md`
> (activity counts there were ~15× too low; internal/external was never validated).

Node model (locked): **visible node = UserProjectInstance**, `nodeId = userId::projectId`.
Authoritative user/instance source is the Data Connector snapshot (`AccDc*`); the live
`AccProjectMember` table is effectively empty.

---

## 0. Headline numbers (verified 2026-05-22)

| Metric | Value | Source |
|---|---|---|
| **UserProjectInstances (graph nodes)** | **16,942** | `AccDcProjectUser` row count |
| Distinct users | 3,367 | `AccDcProjectUser.userId` / `AccDcUser` |
| Distinct projects (with members) | 428 | `AccDcProjectUser.projectId` |
| Multi-project users (drive same-user edges) | 1,610 | `AccDcProjectUser` |
| Activity events | 226,190 | `AccActivity` |
| Distinct raw actions / normalized categories | 132 / 7 | `AccActivity.rawAction` |
| Folder-permission rows | 986,697 | `AccFolderPermission` |
| Distinct roles | ~80 | `AccRole` via `AccDcProjectUserRole` |
| Distinct companies/firms | 319 | `AccDcCompany` |
| Internal users (hermosillo.com) | 1,265 | `AccDcUser.email` |

> ⚠️ **Node-count drift:** the e2e harness pins `EXPECTED_NODE_COUNT = 16,934`; live data is now
> **16,942** (+8). The graph node set grows as the DC ingest runs. The e2e constant will need a
> follow-up update — out of scope for this research phase, flagged here.

---

## 1. Top defects & surprises (read this first)

1. **🔴 The internal/external dimension is 100% degenerate today.**
   The `@lecg.com` rule is hardcoded in **two** sites, and **`@lecg.com` matches 0 of 3,367 users**:
   - `featureSnapshot.ts` — inline SQL `CASE WHEN LOWER(...) LIKE '%@lecg.com' THEN FALSE ELSE TRUE END AS is_external`.
   - `dataLayer.ts` — `INTERNAL_DOMAINS = new Set(["lecg.com"])`, used by `normalize()`.

   Every node is therefore labelled *external*. The real internal domain is
   **`hermosillo.com` (1,265 users)**. The `isExternal` slider, the `external` color mode, and the
   External filter are all effectively no-ops / mislabels right now.
   → Replace **both** sites with a single configurable `internalDomains` allowlist
   (canonical: `hermosillo.com`). See §6.

2. **🟠 Activity is ~15× larger than the prior spec assumed.** 226,190 events across 887 actors and
   152 projects (prior `2026-05-20` doc said ~15,571 / 83 users). Activity is now a genuinely useful
   dimension — but still covers only **26% of users** and a **~38-day window** (2026-04-14 → 2026-05-22).

3. **🟠 Per-instance sign-in is unavailable.** `AccDcProjectUser.lastSignIn` is **100% null**
   (0 / 16,942). Sign-in recency exists only at the *user* level (`AccDcUser.lastSignIn`, 66% null).
   The `signin` dimension is therefore a UserIdentity attribute with ~34% coverage, not a per-node one.

4. **🟢 `addedOn` (membership age) is 100% populated per instance and currently unused.**
   `AccDcProjectUser.addedOn` has 0 nulls, range 2021-03-26 → 2026-05-22. This is the single best
   *per-instance temporal* signal available and is not yet a dimension.

5. **🟠 Folder-permission coverage is project-sparse.** Only **~85 of 1,143 projects** are crawled
   (`ok` 84, `partial` 1; `never` 1,030, `inaccessible` 28). `permTier` is knowable only for nodes in
   those projects → the `permissionCoverage` flag (`known`/`partial`/`unknown`) is load-bearing.

6. **🟢 Permission/category value sets are clean and small** — no surprise enum values. Folder
   `permType` has exactly 5 values; activity normalizes to 7 categories; products to 9 per-user keys.

---

## 2. Activity inventory (`AccActivity`)

- **Totals:** 226,190 rows · 887 distinct actors (`autodeskId`) · 152 distinct projects ·
  range **2026-04-14 → 2026-05-22** (~38 days).
- **`sourceFile`:** `project` 225,938 · `admin` 252.
- **`service` is mostly null** (187,502 / 226,190 rows). The reliable signal is the
  **normalized category derived from `rawAction`** via `lib/acc/activityCategories.ts`, not the
  stored `service` column.

### 2a. Normalized category rollup (132 raw actions → 7 categories)

| Category | Events | Distinct raw actions | Visual use |
|---|---:|---:|---|
| view | 106,630 | 13 | scalar slider, color, badge, detail metric |
| projectEvent | 59,442 | 66 | filter, color, detail metric |
| upload | 43,741 | 11 | scalar slider, color, detail metric |
| edit | 14,477 | 28 | scalar slider, color, detail metric |
| delete | 1,448 | 8 | filter, risk badge, detail metric |
| memberEvent | 451 | 5 | edge type (who-added-whom), risk badge |
| other | 1 | 1 | — |

### 2b. Service buckets (where populated)

| service | events | actors | projects |
|---|---:|---:|---:|
| (null) | 187,502 | 817 | 134 |
| docs | 24,865 | 469 | 97 |
| issues | 13,353 | 83 | 15 |
| rfis | 176 | 22 | 11 |
| sheets | 157 | 8 | 7 |
| submittals | 101 | 4 | 3 |
| admin | 36 | 9 | 1 |

### 2c. Highest-volume raw actions (top 12 of 132)

| rawAction | events | actors | projects |
|---|---:|---:|---:|
| view-entity | 90,231 | 813 | 141 |
| upload-entity | 36,183 | 272 | 74 |
| issue-view | 22,244 | 179 | 25 |
| issue-edit | 14,977 | 45 | 16 |
| download-entity | 9,360 | 579 | 104 |
| lock-entity | 4,015 | 63 | 35 |
| unlock-entity | 3,979 | 61 | 33 |
| issue-attachment-add | 3,748 | 39 | 9 |
| view-existing-review | 3,727 | 113 | 23 |
| set-approval-status | 3,154 | 22 | 17 |
| issue-due-date | 2,707 | 21 | 8 |
| create-entity | 2,630 | 132 | 61 |

> Admin actions (`assign-member`, `assign-admin`, `remove-member`, `edit-project`) carry
> `projectId = ''` (empty sentinel) → they show `projects = 0`. They are the raw material for the
> **who-added-whom / member-event edge** but are *not* per-project attributable as-is.

- **`UnresolvedAttribution`:** 0 rows — attribution is currently clean (no unmatched activity).

**Can become:** view/upload/edit counts → **scalar sliders + color modes + detail metrics**;
category → **filter**; delete/memberEvent → **risk badges**; member events → **edge type**.
**Confidence:** Medium (rich but 26% user coverage, 38-day window, `service` mostly null).

---

## 3. Module / product inventory (`AccDcProjectUserProduct`)

| productKey | rows | users | projects | admin rows | user rows | role |
|---|---:|---:|---:|---:|---:|---|
| insight | 13,689 | 2,659 | 426 | 4,624 | 9,065 | universal baseline |
| docs | 13,689 | 2,669 | 427 | 4,615 | 9,074 | universal baseline |
| build | 8,814 | 1,948 | 375 | 3,238 | 5,576 | primary differentiator |
| modelCoordination | 2,128 | 333 | 302 | 1,758 | 370 | mostly admin |
| designCollaboration | 1,318 | 352 | 229 | 953 | 365 | mostly admin |
| cost | 300 | 45 | 126 | 284 | 16 | sparse, admin-heavy |
| takeoff | 127 | 67 | 35 | 41 | 86 | sparse |
| forma | 115 | 31 | 60 | 113 | 2 | sparse |
| autoSpecs | 14 | 10 | 11 | 12 | 2 | very sparse |

- `AccDcProjectProduct` (project-level): 5,432 rows, **15 distinct productKeys**, 427 projects —
  i.e. 6 product keys exist at project level that never appear in per-user assignments (sparse/unused).
- **`insight` and `docs` are near-universal** → low discriminating power as a dimension; the
  *non-baseline* product set (build / modelCoordination / designCollaboration / cost / takeoff /
  forma / autoSpecs) is the meaningful **multi-hot module signature**.

**Can become:** module multi-hot → **shared-module edge type** + **advanced module slider** +
**filter**; `accessLevel = project_admin` → **risk/admin badge** + color. **Confidence:** High.

---

## 4. Role inventory (`AccDcProjectUserRole` ⋈ `AccRole`)

- ~80 distinct roles; **all roleIds resolve** to `AccRole` (no unmapped IDs).
- **Roles per node:** 1 → 13,132 nodes · 2 → 263 · 3 → 12 · 4 → 3 · 5 → 1 · 8 → 1.
  Multi-role nodes = **280** (~2% of role-bearing nodes). Role is effectively single-valued per node.
- `AccProjectRole` access levels (21,624 rows): `docsAccessLevel` null 15,316 / admin 246 / user 6,062;
  `projectAdminAccessLevel` set on 6,612.

### Role shape (representative)

| role | assignments | users | projects | shape note |
|---|---:|---:|---:|---|
| Architect | 2,531 | 229 | 315 | broad professional role |
| VDC Innovacion | 1,649 | 26 | 424 | few users, ~all projects → service/automation-like |
| Presupuestos | 1,409 | 130 | 193 | functional dept |
| Owner | 682 | 446 | 115 | many users, fewer projects |
| Residente De Obra | 634 | 294 | 93 | many users |
| Gerente De Desarrollo | 226 | 6 | 200 | org-wide, tiny user set |
| Marketing | 27 | 1 | 27 | 1 user across 27 projects |
| …long tail | 1–20 | 1–16 | 1–12 | ~40 sparse roles |

> ⚠️ **Clique-explosion risk:** "same role" edges on broad roles (Architect 229 users; Owner 446
> users) would create huge cliques. Org-wide/automation roles (VDC Innovacion, Gerente De Desarrollo,
> Marketing) span ~all projects with few users — they are *grouping* signals, not co-membership ones.
> Same-role edges must be hub/top-k/threshold capped (see engine strategy §edge taxonomy).

**Can become:** role → **categorical slider** (already is) + **color** + **filter**;
high-privilege roles → **risk badge**; role-combination → **edge** (capped). **Confidence:** High.

---

## 5. Company / firm inventory (`AccDcProjectUserCompany` ⋈ `AccDcCompany`)

- 319 distinct companies · 2,540 users with a company · 13,616 instance-company rows.
- **Hermosillo dominates:** 1,078 users · 428 projects · **10,569 instances (78% of company rows)**.
- Long tail of external firms: Global Mechanical (50u), P&G (44u), Mercado Libre (39u), CEBSA (36u),
  MM-Engineers (33u), DEMEK (33u), Hitachi Energy (30u), Cushman & Wakefield (25u), Caterpillar (24u)…
- Multi-company users: **67** (a user appearing under >1 company across instances).

> The "Hermosillo" *company* (1,078) and the "hermosillo.com" *email domain* (1,265) are close but
> not identical — some hermosillo.com users have no company row, some Hermosillo-company users use
> other emails. **Email domain is the authoritative internal signal; company is secondary** (§6).

**Can become:** company → **color** + **filter** + **firm-affiliation edge** (Hermosillo is too big
for direct edges → hub node); external firm → **risk context**. **Confidence:** High.

---

## 6. Internal vs external (`AccDcUser.email`) — the headline correction

**Rule (approved):** internal = email domain ∈ `internalDomains` allowlist (canonical
`["hermosillo.com"]`); unknown = missing/empty/malformed email; external = valid domain not in
allowlist. Email is authoritative; company only as fallback when email is missing.

| Classification | Current code (`@lecg.com`) | Proposed (`hermosillo.com` allowlist) |
|---|---:|---:|
| Internal | **0** | **1,265** |
| External | **3,367** (incl. would-be unknowns) | 2,102 |
| Unknown | 0 (null→external bug) | 0 |
| **Total** | 3,367 | 3,367 |

- **Classification changes:** 1,265 users flip *external → internal* under the proposed rule
  (0 flip the other way; 0 become unknown — every `AccDcUser` has a parseable email today).
- **High-privilege users mislabeled:** **328** hermosillo.com users hold `project_admin` product
  access and are currently shown as external.
- **Genuinely external admins (real risk signal):** **27** users on non-allowlist domains hold
  `project_admin` access.

### Email-domain distribution (top of 60+)

| domain | users | likely class |
|---|---:|---|
| hermosillo.com | 1,265 | **internal** |
| gmail.com | 228 | external/personal (ambiguous) |
| tec.mx | 56 | external |
| mercadolibre.com.mx | 50 | external |
| globalmechanical.com.mx | 48 | external |
| hotmail.com | 42 | external/personal |
| pg.com | 40 | external |
| autodesk.com | 15 | external (vendor) |
| outlook.com | 27 | external/personal |
| …200+ corporate/personal domains | 1–37 | external |

> **Recommendation:** replace the hardcoded `@lecg.com` checks in **both** `featureSnapshot.ts`
> (inline SQL `is_external` CASE) **and** `dataLayer.ts` (`INTERNAL_DOMAINS = Set(["lecg.com"])`)
> with a single configurable `internalDomains` setting (default `["hermosillo.com"]`). Personal-mail domains
> (gmail/hotmail/outlook ≈ 297 users) are *external* under the allowlist but are candidates for a
> distinct **"unaffiliated/personal"** sub-class if the product wants three-way coloring.
> **Confidence:** High (clean emails, unambiguous dominant domain).

---

## 7. Folder permission inventory (`AccFolderPermission`)

| permType | rows | folders | roles | risk |
|---|---:|---:|---:|---|
| View Only | 978,804 | 56,085 | 61 | low |
| View+Download+Upload+Edit | 3,887 | 906 | 50 | medium-high |
| View+Download | 3,187 | 592 | 53 | low-medium |
| View+Download+Upload | 678 | 354 | 33 | medium |
| Full Controller | 141 | 103 | 16 | **high** |

- **Exactly 5 permType values** (no surprises). Permissions are **role-based** (`roleId`), not
  per-user — per-node tier requires joining `role → AccDcProjectUserRole`.
- **Full Controller** is concentrated: 141 rows, 103 folders, **16 roles** → a tight high-risk set.
- **Crawl coverage:** `ok` 84 · `partial` 1 · `inaccessible` 28 · `never` 1,030 projects.
  Folders: 63,437 across 88 projects. **~93% of projects have no folder data.**

**Derived signals:** folder breadth (folders per role), permission strength (max tier per node),
controller/admin access (Full Controller reach), mixed profiles (role with multiple tiers).
**Can become:** permTier → **scalar slider** + **color** + **risk badge** + **edge** (shared
folder+tier); Full Controller → **high-risk badge**. **Confidence:** Medium (project-sparse coverage).

---

## 8. Temporal inventory

| field | source | populated | range | usable as |
|---|---|---|---|---|
| user last sign-in | `AccDcUser.lastSignIn` | 34% (1,134 / 3,367) | 2020-09-12 → 2026-05-18 | slider, color, risk badge (user-level) |
| **instance sign-in** | `AccDcProjectUser.lastSignIn` | **0%** (0 / 16,942) | — | ❌ unavailable |
| **membership age** | `AccDcProjectUser.addedOn` | **100%** (0 null) | 2021-03-26 → 2026-05-22 | ✅ **per-instance slider/color (untapped)** |
| activity recency | `AccActivity.createdAt` | 887 actors | 2026-04-14 → 2026-05-22 | scalar slider, color |
| snapshot freshness | `AccDc*.ingestedAt` | 100% | per ingest | cache invalidation only |

### Sign-in recency buckets (`AccDcUser.lastSignIn`)

| bucket | users |
|---|---:|
| 0–7d | 55 |
| 8–14d | 87 |
| 15–30d | 87 |
| 31–60d | 101 |
| 60d+ | 804 |
| never/unknown | 2,233 |

### Activity by month

| month | events |
|---|---:|
| 2026-04 | 80,716 |
| 2026-05 | 145,474 |

**Confidence:** sign-in Low-Medium (66% null, user-level only); membership-age High (per-instance,
fully populated); activity recency Medium (38-day window).

---

## 9. UserProjectInstance coverage (of 16,942 nodes)

| attribute | nodes with data | coverage |
|---|---:|---:|
| Total instances (nodes) | 16,942 | 100% |
| With ≥1 role | 13,412 | 79% |
| With ≥1 product | 13,701 | 81% |
| With company | 13,616 | 80% |
| With per-instance sign-in | 0 | 0% |
| With user-level sign-in | (1,134 users) | ~34% of users |
| With activity (user via autodeskId) | 879 users | 26% of users |
| Multi-project users (same-user edges) | 1,610 | — |
| Multi-company users | 67 | — |
| Multi-role nodes | 280 | ~2% |

> **Thin-node gap:** ~3,200–3,500 instances (≈19–21%) have **no role, product, or company**. These
> exist in `AccDcProjectUser` but lack enrichment rows — they must still render (organic base
> position, "(unknown)" features) and must not be silently dropped. The current `featureSnapshot.ts`
> already falls back to a safe "(unknown)" snapshot for missing ids — keep that contract.

---

## 10. Confidence summary per data family

| Family | Coverage | Confidence | Notes |
|---|---|---|---|
| UserProjectInstance node set | 100% | **High** | `AccDcProjectUser` is canonical; node-count drifts with ingest |
| Roles | 79% | **High** | clean mapping; broad-role clique risk |
| Products / modules | 81% | **High** | insight/docs are baselines; non-baseline = signature |
| Companies | 80% | **High** | Hermosillo dominates; needs hub for edges |
| Internal/external | 100% (email present) | **High** | current code defect confirmed; hermosillo.com canonical |
| Activity | 26% users / 38d | **Medium** | rich but partial; `service` mostly null |
| Folder permissions | ~85 / 1,143 projects | **Medium** | role-based; project-sparse; coverage flag essential |
| User sign-in | 34% | **Low-Medium** | user-level only; per-instance null |
| Membership age (`addedOn`) | 100% | **High** | untapped per-instance temporal |

---

## 11. Missing / unavailable data

- **Per-instance sign-in** — not provided by DC (`AccDcProjectUser.lastSignIn` all null).
- **Folder permissions for ~93% of projects** — not crawled (`never`/`inaccessible`).
- **Activity history before 2026-04-14** — outside the current ingest window (~38 days).
- **Activity for 74% of users** — only 879 / 3,367 users have any activity rows.
- **Per-user folder permission** — only derivable via role→permission join (no direct user grant).
- **Personal-vs-corporate external distinction** — derivable from domain heuristics, not stored.

---

## 12. Source-field reference

| Concept | Table.field |
|---|---|
| Node identity | `AccDcProjectUser.(projectId, userId)` → `userId::projectId` |
| User identity / email | `AccDcUser.(id, email, name, status, lastSignIn, autodeskId, companyId)` |
| Role assignment | `AccDcProjectUserRole.(projectId, userId, roleId)` ⋈ `AccRole.name` |
| Role access level | `AccProjectRole.(docsAccessLevel, projectAdminAccessLevel)` |
| Product / module | `AccDcProjectUserProduct.(productKey, accessLevel)` |
| Company | `AccDcProjectUserCompany.(companyId)` ⋈ `AccDcCompany.name` |
| Folder permission | `AccFolderPermission.(roleId, permType, actions)` ⋈ `AccFolder.(projectId)` |
| Activity | `AccActivity.(autodeskId, userEmail, projectId, rawAction, service, createdAt, sourceFile)` |
| Membership age | `AccDcProjectUser.addedOn` |
| Crawl coverage | `AccProject.folderCrawlStatus` |
| Normalization | `lib/acc/activityCategories.ts` (`categorize`, `inferActivityService`, `classifyChangeStream`) |
