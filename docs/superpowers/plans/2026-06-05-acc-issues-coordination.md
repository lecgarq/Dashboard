# ACC Issues Extraction & Model-Coordination Classification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract every ACC issue from every accessible project into the DB, flag Model-Coordination clash issues via a title→description heuristic validated against Autodesk's clash endpoint, and surface an honest coordination count on `/access-analysis`.

**Architecture:** Two pure units (`classifyCoordination`, `reconcileClashes`) behind two Node scripts (Pass 1 = issues + heuristic; Pass 2 = clash validation). New `AccIssue` + `AccIssueFetchRun` Prisma models. Dashboard reads via a server loader passed as an RSC prop (no tRPC).

**Tech Stack:** Next.js 15 RSC, Prisma + Postgres (local PG 18), vitest, ECharts, ACC Issues API (`construction/issues/v1`) + Clash API (`clash/v3`), 3-leg APS auth.

**Spec:** `docs/superpowers/specs/2026-06-05-acc-issues-coordination-design.md`

---

## Conventions for all script tasks

- Scripts are `.cjs`, run with: `node --env-file=.env scripts/<name>.cjs [flags]`.
- Scripts that import TS modules start with `require("tsx/cjs");` then `require("../lib/acc/<x>.ts")`.
- Prisma in scripts: `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL, max: 2 }) })`.
- Known smoke-test target (luis is admin, has clash data): project `13010c62-8128-49a5-a9e1-7e6767735f07`, model set `36dcdc91-6b98-4f8e-9f0b-521b91cbd69f` (from `scripts/mc-list-assigned.cjs`).
- Commit only the explicit paths listed in each task. Before each commit run `git diff --cached --name-only` and confirm it matches the task's file list (this branch has large unrelated WIP).

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `lib/acc/coordinationClassifier.ts` | Pure: `{title,description}` → coordination verdict | 1 |
| `lib/acc/coordinationClassifier.test.ts` | Unit tests (the spec matrix) | 1 |
| `lib/acc/reconcileClashes.ts` | Pure: reconcile stored issues vs clash issueIds | 2 |
| `lib/acc/reconcileClashes.test.ts` | Unit tests | 2 |
| `prisma/schema.prisma` | Add `AccIssue` + `AccIssueFetchRun` | 3 |
| `lib/acc/apsAuth.ts` | Shared 3-leg refresh-token helper | 4 |
| `scripts/acc-issues-backfill.cjs` | Pass 1: fetch issues + heuristic + upsert | 5 |
| `scripts/acc-issues-validate-clashes.cjs` | Pass 2: clash validation + reconcile | 6 |
| `lib/server/coordinationView.ts` | Server loader → `CoordinationSummary` | 9 |
| `app/(dashboard)/access-analysis/components/CoordinationPanel.tsx` | UI widget | 10 |
| `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` | Render panel (modify) | 11 |
| `app/(dashboard)/access-analysis/page.tsx` | Load summary + pass prop (modify) | 11 |

---

## Task 1: Pure coordination classifier (TDD)

**Files:**
- Create: `lib/acc/coordinationClassifier.ts`
- Test: `lib/acc/coordinationClassifier.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/acc/coordinationClassifier.test.ts
import { describe, it, expect } from "vitest";
import { classifyCoordination } from "./coordinationClassifier";

describe("classifyCoordination", () => {
  it("flags a real clash by trailing [clashId] in the title (high)", () => {
    expect(classifyCoordination({ title: "Security Devices, AXIS P3267-LVE and Basic Wall [7256324]" }))
      .toEqual({ isCoordination: true, source: "title", clashId: "7256324", confidence: "high" });
  });

  it("flags a real clash by the auto-filled description (high)", () => {
    const description =
      "1 clash between Security Devices, AXIS P3267-LVE in VYD_PREPATEC_R24_V3.rvt - {3D - luis.cortesWXLY7} " +
      "and ARCH-A-PREPATEC-2024_V3.rvt - {3D - luis.cortesWXLY7}";
    expect(classifyCoordination({ title: "no bracket here", description }))
      .toEqual({ isCoordination: true, source: "description", clashId: null, confidence: "high" });
  });

  it("handles plural 'clashes between'", () => {
    expect(classifyCoordination({ description: "3 clashes between A and B" }).isCoordination).toBe(true);
  });

  it("flags short room-number brackets but tags them low (audit bucket)", () => {
    expect(classifyCoordination({ title: "Door schedule [204]" }))
      .toEqual({ isCoordination: true, source: "title", clashId: "204", confidence: "low" });
  });

  it("does NOT flag hand-typed text containing 'and'", () => {
    expect(classifyCoordination({ title: "Fix door", description: "replace the slab and beam" }).isCoordination).toBe(false);
  });

  it("does NOT flag Spanish auto-text (left to Pass 2)", () => {
    expect(classifyCoordination({ title: "sin corchete", description: "1 conflicto entre A y B" }).isCoordination).toBe(false);
  });

  it("returns all-null on empty input", () => {
    expect(classifyCoordination({}))
      .toEqual({ isCoordination: false, source: null, clashId: null, confidence: null });
  });

  it("requires two {3D - user} markers for the corroborated description rule", () => {
    // 'clash between ... and ...' but no model markers → not enough on its own
    expect(classifyCoordination({ description: "discuss the clash between teams and vendors" }).isCoordination).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run lib/acc/coordinationClassifier.test.ts`
Expected: FAIL — "Failed to resolve import ./coordinationClassifier".

- [ ] **Step 3: Write the implementation**

```ts
// lib/acc/coordinationClassifier.ts
/**
 * Pure classifier: is an ACC issue a Model-Coordination clash issue?
 * Title rule (language-proof) → description rule (English auto-text) → none.
 * No I/O. The authoritative net is Pass 2 (clash endpoint), not this file.
 */
const TITLE_CLASH_RE = /\[(\d+)\]\s*$/; // any trailing [number]
const DESC_LEAD_RE = /^\s*\d+\s+clash(?:es)?\s+between\b/i; // "1 clash between …"
const DESC_BETWEEN_RE = /\bclash(?:es)?\s+between\b[\s\S]*?\band\b/i; // "clash between … and …"
const MODEL_VIEW_RE = /-\s*\{\s*3D\s*-\s*[^}]+\}/gi; // " - {3D - user}"

export interface CoordinationVerdict {
  isCoordination: boolean;
  source: "title" | "description" | null;
  clashId: string | null;
  confidence: "high" | "medium" | "low" | null;
}

export function classifyCoordination(input: {
  title?: string | null;
  description?: string | null;
}): CoordinationVerdict {
  const t = TITLE_CLASH_RE.exec((input.title ?? "").trim());
  if (t) {
    const confidence = t[1].length >= 4 ? "high" : "low";
    return { isCoordination: true, source: "title", clashId: t[1], confidence };
  }
  const d = input.description ?? "";
  if (DESC_LEAD_RE.test(d)) {
    return { isCoordination: true, source: "description", clashId: null, confidence: "high" };
  }
  if (DESC_BETWEEN_RE.test(d) && (d.match(MODEL_VIEW_RE) ?? []).length >= 2) {
    return { isCoordination: true, source: "description", clashId: null, confidence: "medium" };
  }
  return { isCoordination: false, source: null, clashId: null, confidence: null };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run lib/acc/coordinationClassifier.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/acc/coordinationClassifier.ts lib/acc/coordinationClassifier.test.ts
git commit -m "feat(acc-issues): pure Model-Coordination classifier + tests"
```

---

## Task 2: Pure clash reconciler (TDD)

**Files:**
- Create: `lib/acc/reconcileClashes.ts`
- Test: `lib/acc/reconcileClashes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/acc/reconcileClashes.test.ts
import { describe, it, expect } from "vitest";
import { reconcileClashes } from "./reconcileClashes";

describe("reconcileClashes", () => {
  const stored = [
    { id: "a", isCoordination: true },  // matched, heuristic correct
    { id: "b", isCoordination: false }, // matched, heuristic missed → false neg
    { id: "c", isCoordination: true },  // not a clash → false pos
    { id: "d", isCoordination: false }, // not a clash, not flagged → ignored
  ];
  const clashIds = new Set(["a", "b", "e"]); // "e" not among stored

  it("partitions matched / false-neg / false-pos / missing", () => {
    expect(reconcileClashes(stored, clashIds)).toEqual({
      validatedIds: ["a", "b"],
      falseNegIds: ["b"],
      falsePosIds: ["c"],
      missingIds: ["e"],
    });
  });

  it("is empty-safe", () => {
    expect(reconcileClashes([], new Set())).toEqual({
      validatedIds: [], falseNegIds: [], falsePosIds: [], missingIds: [],
    });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run lib/acc/reconcileClashes.test.ts`
Expected: FAIL — cannot resolve `./reconcileClashes`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/acc/reconcileClashes.ts
/**
 * Pure reconciliation of stored issues against the authoritative set of
 * clash-generated issueIds (from clash/v3 .../clashes/assigned). Drives Pass 2's
 * DB updates and telemetry. No I/O.
 */
export interface StoredIssueLite {
  id: string;
  isCoordination: boolean;
}

export interface ReconcileResult {
  validatedIds: string[]; // stored issues confirmed as clash-generated → clashValidated=true
  falseNegIds: string[];  // validated but heuristic had NOT flagged → set isCoordination, source=clash-endpoint
  falsePosIds: string[];  // heuristic flagged but NOT in clash set (on this MC project) → audit
  missingIds: string[];   // clash issueIds with no stored row (deleted/unfetched) → log
}

export function reconcileClashes(
  stored: ReadonlyArray<StoredIssueLite>,
  clashIssueIds: ReadonlySet<string>,
): ReconcileResult {
  const byId = new Map(stored.map((s) => [s.id, s]));
  const validatedIds: string[] = [];
  const falseNegIds: string[] = [];
  const falsePosIds: string[] = [];
  const missingIds: string[] = [];

  for (const s of stored) {
    if (clashIssueIds.has(s.id)) {
      validatedIds.push(s.id);
      if (!s.isCoordination) falseNegIds.push(s.id);
    } else if (s.isCoordination) {
      falsePosIds.push(s.id);
    }
  }
  for (const cid of clashIssueIds) {
    if (!byId.has(cid)) missingIds.push(cid);
  }
  return { validatedIds, falseNegIds, falsePosIds, missingIds };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run lib/acc/reconcileClashes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/acc/reconcileClashes.ts lib/acc/reconcileClashes.test.ts
git commit -m "feat(acc-issues): pure clash reconciler + tests"
```

---

## Task 3: Prisma schema — AccIssue + AccIssueFetchRun

**Files:**
- Modify: `prisma/schema.prisma` (append two models)

- [ ] **Step 1: Append the models to `prisma/schema.prisma`**

```prisma
model AccIssue {
  id             String   @id // ACC issue UUID
  projectId      String // ACC Construction-Admin project GUID (loose; logical join AccProject.id)
  displayId      Int?
  title          String
  description    String?
  status         String?
  issueTypeId    String?
  issueSubtypeId String?
  createdBy      String?
  createdAt      DateTime?
  deleted        Boolean  @default(false)

  isCoordination     Boolean @default(false)
  coordinationSource String? // "title" | "description" | "clash-endpoint"
  confidence         String? // "high" | "medium" | "low"
  clashId            String?
  clashValidated     Boolean @default(false)
  projectMcEnabled   Boolean @default(false)

  rawJson    Json?
  fetchRunId String?
  fetchedAt  DateTime @default(now())

  @@index([projectId])
  @@index([isCoordination])
  @@index([clashId])
  @@index([fetchRunId])
  @@index([projectId, isCoordination])
}

model AccIssueFetchRun {
  id                String    @id @default(cuid())
  startedAt         DateTime  @default(now())
  finishedAt        DateTime?
  projectsTotal     Int?
  projectsOk        Int?
  projectsForbidden Int?
  issuesUpserted    Int?
  coordinationCount Int?
  status            String    @default("running") // running | done | failed
}
```

- [ ] **Step 2: Push schema to DB (no shadow DB → avoids the local pgvector migrate breakage)**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema." Two new tables created.
If `db push` errors on pgvector, fallback: hand-write `CREATE TABLE "AccIssue" (...)` + indexes via `psql`, then `npx prisma db pull` to reconcile.

- [ ] **Step 3: Regenerate the client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 4: Verify the model is queryable**

Run: `node --env-file=.env -e "const{PrismaClient}=require('@prisma/client');const{PrismaPg}=require('@prisma/adapter-pg');const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});p.accIssue.count().then(n=>{console.log('AccIssue rows:',n);return p.$disconnect();})"`
Expected: `AccIssue rows: 0`.

- [ ] **Step 5: Commit (schema only — db push leaves no migration file)**

```bash
git add prisma/schema.prisma
git commit -m "feat(acc-issues): AccIssue + AccIssueFetchRun models"
```

---

## Task 4: Shared APS auth helper

**Files:**
- Create: `lib/acc/apsAuth.ts`

- [ ] **Step 1: Create the helper (rotation-safe — persists the new refresh token)**

```ts
// lib/acc/apsAuth.ts
import "server-only";
import { db } from "@/server/db";

const BASE = "https://developer.api.autodesk.com";
const USER_EMAIL = process.env.APS_USER_EMAIL || "luis.cortes@hermosillo.com";

/**
 * Refresh luis's 3-leg Autodesk access token from the stored Account row and
 * PERSIST the rotated refresh token. APS v2 refresh tokens are single-use; not
 * persisting the rotation breaks dashboard login. Returns a bearer access token.
 */
export async function refreshAndPersistFromDb(scope = "data:read"): Promise<string> {
  const acct = await db.account.findFirst({
    where: { provider: "autodesk", user: { email: USER_EMAIL } },
    select: { id: true, refresh_token: true },
  });
  if (!acct?.refresh_token) throw new Error(`No stored Autodesk refresh_token for ${USER_EMAIL}.`);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: acct.refresh_token,
    client_id: process.env.APS_CLIENT_ID ?? "",
    client_secret: process.env.APS_CLIENT_SECRET ?? "",
    scope,
  });
  const res = await fetch(`${BASE}/authentication/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Token refresh failed (${res.status}): ${JSON.stringify(json)}`);
  }
  await db.account.update({
    where: { id: acct.id },
    data: {
      access_token: json.access_token,
      refresh_token: json.refresh_token ?? acct.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (json.expires_in || 3600),
      scope: json.scope ?? scope,
    },
  });
  return json.access_token;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Note: `import "server-only"` means this is imported by scripts through `tsx`, which is fine for Node execution.)

- [ ] **Step 3: Smoke — confirm a live token refresh works**

Run: `node --env-file=.env -e "require('tsx/cjs');require('./lib/acc/apsAuth.ts').refreshAndPersistFromDb('data:read').then(t=>console.log('token len',t.length)).catch(e=>{console.error(e.message);process.exit(1)})"`
Expected: `token len <some number > 100>`. (If it fails with a login error, recover via `scripts/aps-login.cjs` per the refresh-token memory, then retry.)

- [ ] **Step 4: Commit**

```bash
git add lib/acc/apsAuth.ts
git commit -m "feat(acc-issues): shared rotation-safe APS auth helper"
```

---

## Task 5: Pass 1 — issues backfill script

**Files:**
- Create: `scripts/acc-issues-backfill.cjs`

- [ ] **Step 1: Create the script**

```js
// scripts/acc-issues-backfill.cjs
// Pass 1: fetch all issues per project, classify coordination, upsert AccIssue.
// Flags: --project=<id> (single project), --dry-run (no DB writes).
require("tsx/cjs");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const { classifyCoordination } = require("../lib/acc/coordinationClassifier.ts");
const { refreshAndPersistFromDb } = require("../lib/acc/apsAuth.ts");

const BASE = "https://developer.api.autodesk.com";
const DRY = process.argv.includes("--dry-run");
const ONLY = (process.argv.find((a) => a.startsWith("--project=")) || "").split("=")[1] || null;
const FIELDS = "id,displayId,title,description,status,issueTypeId,issueSubtypeId,createdBy,createdAt,deleted";

function prisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiGet(url, token, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429 || res.status >= 500) { await sleep(1000 * (i + 1)); continue; }
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, ok: res.ok, body };
  }
  return { status: 429, ok: false, body: "retries exhausted" };
}

async function listIssues(token, projectId) {
  const out = [];
  let offset = 0; const limit = 100;
  for (;;) {
    const url = `${BASE}/construction/issues/v1/projects/${projectId}/issues?limit=${limit}&offset=${offset}&fields=${FIELDS}`;
    const { status, ok, body } = await apiGet(url, token);
    if (status === 403) return { forbidden: true, issues: [] };
    if (!ok) throw new Error(`issues-list ${status}: ${JSON.stringify(body).slice(0, 200)}`);
    for (const it of body.results || []) out.push(it);
    const total = body.pagination?.totalResults ?? out.length;
    offset += limit;
    if (offset >= total || !(body.results || []).length) break;
  }
  return { forbidden: false, issues: out };
}

(async () => {
  const db = prisma();
  const token = await refreshAndPersistFromDb("data:read");
  const projects = ONLY
    ? [{ id: ONLY, name: ONLY }]
    : await db.accProject.findMany({ select: { id: true, name: true } });

  const run = DRY ? { id: "dry-run" } : await db.accIssueFetchRun.create({ data: {} });
  let ok = 0, forbidden = 0, upserted = 0, coordination = 0;

  for (const p of projects) {
    let r;
    try { r = await listIssues(token, p.id); }
    catch (e) { console.error(`  ${p.id} ERROR ${e.message}`); continue; }
    if (r.forbidden) { forbidden++; console.log(`  ${p.id} 403 (skipped)`); continue; }
    ok++;
    for (const it of r.issues) {
      const v = classifyCoordination({ title: it.title, description: it.description });
      if (v.isCoordination) coordination++;
      if (DRY) continue;
      await db.accIssue.upsert({
        where: { id: it.id },
        create: {
          id: it.id, projectId: p.id, displayId: it.displayId ?? null, title: it.title ?? "",
          description: it.description ?? null, status: it.status ?? null,
          issueTypeId: it.issueTypeId ?? null, issueSubtypeId: it.issueSubtypeId ?? null,
          createdBy: it.createdBy ?? null, createdAt: it.createdAt ? new Date(it.createdAt) : null,
          deleted: !!it.deleted, isCoordination: v.isCoordination, coordinationSource: v.source,
          confidence: v.confidence, clashId: v.clashId, rawJson: it, fetchRunId: run.id,
        },
        update: {
          title: it.title ?? "", description: it.description ?? null, status: it.status ?? null,
          deleted: !!it.deleted, isCoordination: v.isCoordination, coordinationSource: v.source,
          confidence: v.confidence, clashId: v.clashId, rawJson: it, fetchRunId: run.id, fetchedAt: new Date(),
        },
      });
      upserted++;
    }
    console.log(`  ${p.name?.slice(0, 30) || p.id}: ${r.issues.length} issues`);
  }

  if (!DRY) {
    await db.accIssueFetchRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), projectsTotal: projects.length, projectsOk: ok,
        projectsForbidden: forbidden, issuesUpserted: upserted, coordinationCount: coordination, status: "done" },
    });
  }
  console.log(`\n${DRY ? "[DRY] " : ""}projects ok=${ok} forbidden=${forbidden}  issues upserted=${upserted}  coordination=${coordination}`);
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Build-time verification — run the single-project dry-run**

Run: `node --env-file=.env scripts/acc-issues-backfill.cjs --project=13010c62-8128-49a5-a9e1-7e6767735f07 --dry-run`
Expected: prints the issue count for that project and a non-zero `coordination=` total, with NO DB writes. If `coordination=0`, inspect: the `results`/`pagination` field names may differ — print `JSON.stringify(body).slice(0,500)` once to confirm the payload shape, then adjust.

- [ ] **Step 3: Commit**

```bash
git add scripts/acc-issues-backfill.cjs
git commit -m "feat(acc-issues): Pass 1 issues backfill script (dry-run + per-project)"
```

---

## Task 6: Pass 2 — clash validation script

**Files:**
- Create: `scripts/acc-issues-validate-clashes.cjs`

- [ ] **Step 1: Create the script**

```js
// scripts/acc-issues-validate-clashes.cjs
// Pass 2: per MC-enabled project, collect clash-generated issueIds and reconcile
// against stored AccIssue. Flags: --project=<id>, --dry-run.
require("tsx/cjs");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const { reconcileClashes } = require("../lib/acc/reconcileClashes.ts");
const { refreshAndPersistFromDb } = require("../lib/acc/apsAuth.ts");

const BASE = "https://developer.api.autodesk.com";
const DRY = process.argv.includes("--dry-run");
const ONLY = (process.argv.find((a) => a.startsWith("--project=")) || "").split("=")[1] || null;

function prisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function apiGet(url, token, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429 || res.status >= 500) { await sleep(1000 * (i + 1)); continue; }
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, ok: res.ok, body };
  }
  return { status: 429, ok: false, body: "retries exhausted" };
}

async function listModelSets(token, containerId) {
  const url = `${BASE}/bim360/clash/v3/containers/${containerId}/modelsets`;
  const { status, ok, body } = await apiGet(url, token);
  if (status === 403 || status === 404) return [];
  if (!ok) throw new Error(`modelsets ${status}`);
  return (body.modelSets || body.results || []).map((m) => m.modelSetId || m.id).filter(Boolean);
}
async function assignedIssueIds(token, containerId, modelSetId) {
  const ids = new Set(); let cont = null;
  do {
    const qs = new URLSearchParams({ pageLimit: "100" });
    if (cont) qs.set("continuationToken", cont);
    const url = `${BASE}/bim360/clash/v3/containers/${containerId}/modelsets/${modelSetId}/clashes/assigned?${qs}`;
    const { ok, body } = await apiGet(url, token);
    if (!ok) break;
    for (const g of body.groups || []) if (g.issueId) ids.add(g.issueId);
    cont = body.page?.continuationToken || null;
  } while (cont);
  return ids;
}

(async () => {
  const db = prisma();
  const token = await refreshAndPersistFromDb("data:read");
  const projectIds = ONLY
    ? [ONLY]
    : (await db.accIssue.findMany({ distinct: ["projectId"], select: { projectId: true } })).map((r) => r.projectId);

  let totV = 0, totFN = 0, totFP = 0, mcProjects = 0;
  for (const pid of projectIds) {
    const sets = await listModelSets(token, pid);
    if (!sets.length) continue; // not MC-enabled
    mcProjects++;
    const clashIds = new Set();
    for (const s of sets) for (const id of await assignedIssueIds(token, pid, s)) clashIds.add(id);

    const stored = await db.accIssue.findMany({ where: { projectId: pid }, select: { id: true, isCoordination: true } });
    const r = reconcileClashes(stored, clashIds);
    totV += r.validatedIds.length; totFN += r.falseNegIds.length; totFP += r.falsePosIds.length;
    console.log(`  ${pid}: clash=${clashIds.size} validated=${r.validatedIds.length} falseNeg=${r.falseNegIds.length} falsePos=${r.falsePosIds.length} missing=${r.missingIds.length}`);

    if (DRY) continue;
    await db.accIssue.updateMany({ where: { projectId: pid }, data: { projectMcEnabled: true } });
    if (r.validatedIds.length)
      await db.accIssue.updateMany({ where: { id: { in: r.validatedIds } }, data: { clashValidated: true } });
    if (r.falseNegIds.length)
      await db.accIssue.updateMany({ where: { id: { in: r.falseNegIds } },
        data: { isCoordination: true, coordinationSource: "clash-endpoint" } });
  }
  console.log(`\n${DRY ? "[DRY] " : ""}MC projects=${mcProjects}  validated=${totV}  falseNeg=${totFN}  falsePos=${totFP}`);
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Build-time verification — confirm the modelsets endpoint shape**

Run: `node --env-file=.env scripts/acc-issues-validate-clashes.cjs --project=13010c62-8128-49a5-a9e1-7e6767735f07 --dry-run`
Expected: `clash=<n>` non-zero for the PREPATEC project, and validated/falseNeg/falsePos printed. If `clash=0`, the `modelsets` response key differs — print the raw body once and adjust `listModelSets` (try `body.modelSets` vs `body.results`).

- [ ] **Step 3: Commit**

```bash
git add scripts/acc-issues-validate-clashes.cjs
git commit -m "feat(acc-issues): Pass 2 clash validation + reconcile script"
```

---

## Task 7: GATE — single-project smoke reconciliation (checkpoint, no code)

- [ ] **Step 1: Run both passes (dry-run) on the PREPATEC project and compare**

```bash
node --env-file=.env scripts/acc-issues-backfill.cjs        --project=13010c62-8128-49a5-a9e1-7e6767735f07 --dry-run
node --env-file=.env scripts/acc-issues-validate-clashes.cjs --project=13010c62-8128-49a5-a9e1-7e6767735f07 --dry-run
```

- [ ] **Step 2: Verify against ACC**

Confirm the Pass 1 `coordination=` count and the Pass 2 `validated` count are close, and that the gaps are explainable (edited titles → falseNeg; short-bracket non-clash → falsePos). Cross-check the order of magnitude against what you see in ACC Model Coordination for that project.

- [ ] **STOP — get user sign-off before any full run or DB write.** Do not proceed to Task 8 until the user confirms the single-project numbers look right.

---

## Task 8: Full backfill execution (operational, no commit)

- [ ] **Step 1: Run Pass 1 across all projects (writes DB)**

Run: `node --env-file=.env scripts/acc-issues-backfill.cjs`
Expected: per-project lines, final `projects ok=… forbidden=… issues upserted=… coordination=…`.

- [ ] **Step 2: Run Pass 2 across all projects with issues (writes DB)**

Run: `node --env-file=.env scripts/acc-issues-validate-clashes.cjs`
Expected: final `MC projects=… validated=… falseNeg=… falsePos=…`.

- [ ] **Step 3: Inspect telemetry + the audit bucket**

```bash
node --env-file=.env -e "const{PrismaClient}=require('@prisma/client');const{PrismaPg}=require('@prisma/adapter-pg');const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});(async()=>{const run=await p.accIssueFetchRun.findFirst({orderBy:{startedAt:'desc'}});console.log('run',run);const core=await p.accIssue.count({where:{isCoordination:true,OR:[{clashValidated:true},{projectMcEnabled:true}]}});const audit=await p.accIssue.count({where:{isCoordination:true,clashValidated:false,confidence:'low'}});console.log('core coordination count',core,'| audit bucket',audit);await p.\$disconnect();})()"`
Expected: a sensible core coordination count + a small audit bucket. No commit (data only).

---

## Task 9: Server loader — coordinationView.ts

**Files:**
- Create: `lib/server/coordinationView.ts`

- [ ] **Step 1: Create the loader (5-min cache, mirrors `moduleActivityView.ts`)**

```ts
// lib/server/coordinationView.ts
import "server-only";
import { db } from "@/server/db";

export interface CoordinationSummary {
  totalIssues: number;
  coordinationCount: number; // validated ∪ heuristic-on-MC-project
  validatedCount: number;
  byStatus: { status: string; count: number }[];
  byProject: { projectId: string; projectName: string; count: number }[];
  auditCount: number;
}

let cache: { at: number; data: CoordinationSummary } | null = null;
const TTL_MS = 5 * 60 * 1000;
const CORE = { isCoordination: true, OR: [{ clashValidated: true }, { projectMcEnabled: true }] };

export async function loadCoordinationSummary(force = false): Promise<CoordinationSummary> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const [totalIssues, coordinationCount, validatedCount, auditCount, statusGroups, projGroups, projects] =
    await Promise.all([
      db.accIssue.count(),
      db.accIssue.count({ where: CORE }),
      db.accIssue.count({ where: { isCoordination: true, clashValidated: true } }),
      db.accIssue.count({ where: { isCoordination: true, clashValidated: false, confidence: "low" } }),
      db.accIssue.groupBy({ by: ["status"], where: CORE, _count: { id: true } }),
      db.accIssue.groupBy({ by: ["projectId"], where: CORE, _count: { id: true } }),
      db.accProject.findMany({ select: { id: true, name: true } }),
    ]);

  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  const byStatus = statusGroups
    .map((g) => ({ status: g.status ?? "unknown", count: g._count.id }))
    .sort((a, b) => b.count - a.count);
  const byProject = projGroups
    .map((g) => ({ projectId: g.projectId, projectName: nameById.get(g.projectId) ?? g.projectId, count: g._count.id }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const data: CoordinationSummary = { totalIssues, coordinationCount, validatedCount, byStatus, byProject, auditCount };
  cache = { at: Date.now(), data };
  return data;
}
```

- [ ] **Step 2: Typecheck + smoke against real data**

Run: `npx tsc --noEmit`
Run: `node --env-file=.env -e "require('tsx/cjs');require('./lib/server/coordinationView.ts').loadCoordinationSummary().then(s=>{console.log(JSON.stringify(s,null,2));process.exit(0)})"`
Expected: a JSON summary with non-null `coordinationCount` and a `byProject` list.

- [ ] **Step 3: Commit**

```bash
git add lib/server/coordinationView.ts
git commit -m "feat(acc-issues): coordination summary server loader"
```

---

## Task 10: CoordinationPanel component (TDD)

**Files:**
- Create: `app/(dashboard)/access-analysis/components/CoordinationPanel.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/CoordinationPanel.test.tsx`

- [ ] **Step 1: Write the failing render test**

```tsx
// app/(dashboard)/access-analysis/__tests__/CoordinationPanel.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CoordinationPanel } from "../components/CoordinationPanel";
import type { CoordinationSummary } from "@/lib/server/coordinationView";

const summary: CoordinationSummary = {
  totalIssues: 1200, coordinationCount: 318, validatedCount: 290,
  byStatus: [{ status: "open", count: 120 }, { status: "closed", count: 198 }],
  byProject: [{ projectId: "p1", projectName: "PREPATEC", count: 200 }],
  auditCount: 7,
};

describe("CoordinationPanel", () => {
  it("shows the coordination count and validated subtitle", () => {
    render(<CoordinationPanel summary={summary} />);
    expect(screen.getByText("318")).toBeInTheDocument();
    expect(screen.getByText(/290 validated/i)).toBeInTheDocument();
  });

  it("shows the audit footnote when auditCount > 0", () => {
    render(<CoordinationPanel summary={summary} />);
    expect(screen.getByText(/7 low-confidence/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run app/(dashboard)/access-analysis/__tests__/CoordinationPanel.test.tsx`
Expected: FAIL — cannot resolve `../components/CoordinationPanel`.

- [ ] **Step 3: Implement the component**

```tsx
// app/(dashboard)/access-analysis/components/CoordinationPanel.tsx
"use client";
import type { CoordinationSummary } from "@/lib/server/coordinationView";

export function CoordinationPanel({ summary }: { summary: CoordinationSummary }) {
  const { coordinationCount, validatedCount, byStatus, byProject, auditCount } = summary;
  return (
    <section className="rounded-xl border border-border bg-card p-5 text-foreground">
      <header className="mb-3 flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
          Model Coordination
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{coordinationCount}</span>
          <span className="text-sm text-muted-foreground">clash-generated issues</span>
        </div>
        <span className="text-xs text-muted-foreground">{validatedCount} validated by clash data</span>
      </header>

      <div className="mb-3 flex flex-wrap gap-2">
        {byStatus.map((s) => (
          <span key={s.status} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            {s.status}: <span className="font-medium text-foreground tabular-nums">{s.count}</span>
          </span>
        ))}
      </div>

      <ol className="flex flex-col gap-1 text-sm">
        {byProject.map((p) => (
          <li key={p.projectId} className="flex justify-between gap-3">
            <span className="truncate text-muted-foreground">{p.projectName}</span>
            <span className="tabular-nums">{p.count}</span>
          </li>
        ))}
      </ol>

      {auditCount > 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground/80">
          {auditCount} low-confidence hits pending review.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run app/(dashboard)/access-analysis/__tests__/CoordinationPanel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/CoordinationPanel.tsx" "app/(dashboard)/access-analysis/__tests__/CoordinationPanel.test.tsx"
git commit -m "feat(acc-issues): CoordinationPanel widget + render test"
```

---

## Task 11: Wire panel into the page

**Files:**
- Modify: `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx`
- Modify: `app/(dashboard)/access-analysis/page.tsx`

- [ ] **Step 1: Read both files to capture exact current contents**

Run: open `AccessAnalysisCharts.tsx` and `page.tsx`. Note the `AccessAnalysisCharts` props type and where its top-level container closes.

- [ ] **Step 2: Add the prop + render to `AccessAnalysisCharts.tsx`**

Add the import and an optional prop, and render the panel at the top of the existing layout:

```tsx
import { CoordinationPanel } from "./CoordinationPanel";
import type { CoordinationSummary } from "@/lib/server/coordinationView";

// In the component's props type, add:
//   coordination?: CoordinationSummary;
// In the JSX, before the existing charts:
{coordination ? <CoordinationPanel summary={coordination} /> : null}
```

- [ ] **Step 3: Load + pass the summary in `page.tsx`**

```tsx
import { loadCoordinationSummary } from "@/lib/server/coordinationView";
// …
const [view, moduleRows, coordination] = await Promise.all([
  loadInstanceView(), loadModuleActivity(), loadCoordinationSummary(),
]);
// …
<AccessAnalysisCharts roleRows={rows} moduleRows={moduleRows} coordination={coordination} />
```

- [ ] **Step 4: Update the existing charts test if it constructs `AccessAnalysisCharts` (prop is optional, so it should still pass)**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx"`
Expected: PASS (coordination prop is optional → no breakage).

- [ ] **Step 5: Full unit suite + typecheck**

Run: `npm test`
Run: `npx tsc --noEmit`
Expected: all green, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx" "app/(dashboard)/access-analysis/page.tsx"
git commit -m "feat(acc-issues): render CoordinationPanel on /access-analysis"
```

---

## Task 12: Build + deploy verification

- [ ] **Step 1: Build (NOT under the running :3000 — stop the Task Scheduler app first per the deploy caveat)**

Run: `npm run build`
Expected: build completes with no type/route errors.

- [ ] **Step 2: Restart the local app and eyeball the panel**

Restart the `start-local.ps1` / Task Scheduler app, open `/access-analysis`, confirm the Model Coordination panel shows the real coordination count, status chips, top projects, and (if any) the audit footnote.

- [ ] **Step 3: Final self-check**

Confirm: classifier + reconciler tests green, full backfill telemetry sane, audit bucket small, panel renders. Done.

---

## Self-review notes

- **Spec coverage:** schema (T3) · classifier (T1) · reconciler (T2) · auth (T4) · Pass 1 (T5) · Pass 2 (T6) · smoke gate (T7) · full run (T8) · loader (T9) · panel (T10) · wiring (T11) · build (T12). The activity-donut correction is intentionally out of scope (linked follow-up in the spec).
- **Types are consistent:** `CoordinationVerdict` (T1) → consumed in T5; `ReconcileResult`/`StoredIssueLite` (T2) → consumed in T6; `CoordinationSummary` (T9) → consumed in T10/T11.
- **Build-time unknowns flagged, not hidden:** the Issues list payload keys (`results`/`pagination`) and the clash `modelsets` response key are each verified by a dry-run step with an explicit "print body and adjust" fallback.
