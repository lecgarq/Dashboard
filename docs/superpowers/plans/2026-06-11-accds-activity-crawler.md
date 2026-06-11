# accds/v0 Activity Crawler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest ACC activity data quota-free by paging the internal `accds/v0` API using a browser-session token, into a dedicated `AccActivityAccds` table that runs alongside the existing Data Connector pipeline.

**Architecture:** A one-time headed-Playwright login persists ACC session cookies to `scratch/acc-session.json`. A pure-Node token provider turns those cookies into fresh ~27-min web-app bearer tokens via `login.acc.autodesk.com/api/v1/authentication/refresh`. A pager walks `accds/v0` in ≤31-day windows × `limit`/`offset` pages (no quota). A normalizer maps rows into `AccActivityAccds` (deduped on the unique `accdsActivityId`). A runner crawls every admin-accessible project. The new table keeps accds data physically separate from DC's `AccActivity` so existing queries never double-count during the comparison period.

**Tech Stack:** TypeScript, Node, Prisma (`@prisma/adapter-pg`, local Postgres), Vitest, Playwright, `p-limit`, `tsx/cjs` for `.cjs` runners.

**Background:** Spec at `docs/superpowers/specs/2026-06-11-accds-activity-ingestion-design.md`. Key proven facts: `accds/v0` is quota-free but first-party-gated (only the ACC web-app token works, obtained from a browser session); the refresh endpoint mints fresh tokens from cookies; retention is ~12 months. **ToS gray area** — read-only, throttled, DC kept as fallback.

**Conventions (verified):**
- Tests: Vitest, `*.test.ts` next to the lib file. Single: `npm test -- <path>`. All: `npm test`. Typecheck: `npx tsc --noEmit`. Lint: `npm run lint`.
- `.cjs` runners load env via `require("dotenv"); dotenv.config()` then `require("tsx/cjs")` to `require()` `.ts` libs; Prisma via `PrismaPg` adapter with `DIRECT_URL`/`DATABASE_URL`.
- Authenticated APS calls reuse `fetchWithRetry` from `@/lib/server/acc-admin` (429 backoff).
- Schema changes: raw SQL file in `prisma/migrations-raw/` applied directly (local `prisma migrate dev` is broken by pgvector), PLUS the model in `prisma/schema.prisma` + `npx prisma generate`. Mirrors `prisma/migrations-raw/2026-06-08-acc-instance-embedding.sql`.
- `scratch/` is gitignored — session cookies (password-equivalent) live there, never committed.

**Surgical-commit warning:** This branch has heavy uncommitted WIP. Before every commit run `git diff --cached --name-only` and stage only this plan's files by explicit path. Never `git add -A`/`.`.

---

### Task 1: Create the `AccActivityAccds` table

**Files:**
- Create: `prisma/migrations-raw/2026-06-11-acc-activity-accds.sql`
- Modify: `prisma/schema.prisma` (append a new model)

- [ ] **Step 1: Write the raw SQL migration**

Create `prisma/migrations-raw/2026-06-11-acc-activity-accds.sql`:

```sql
-- accds/v0 activity rows. Physically separate from AccActivity (DC source) so the
-- two pipelines run alongside each other without double-counting in existing queries.
CREATE TABLE IF NOT EXISTS "AccActivityAccds" (
  "accdsActivityId" TEXT PRIMARY KEY,          -- accds row "activity_id" (unique hash)
  "autodeskId"      TEXT NOT NULL,             -- accds "created_by"
  "userEmail"       TEXT,                      -- "created_by_email", lowercased
  "userName"        TEXT,                      -- "created_by_display_name"
  "projectId"       TEXT NOT NULL,             -- "project_id"
  "serviceGroup"    TEXT,                      -- "service_group" (docs/issues/sheets/admin)
  "activityVerb"    TEXT NOT NULL,             -- "activity_verb" (view-entity, upload-entity, ...)
  "objectId"        TEXT,
  "objectType"      TEXT,
  "objectName"      TEXT,                      -- "object_display_name"
  "folderId"        TEXT,
  "folderName"      TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL,      -- "created_at"
  "ingestRunId"     TEXT,
  "fetchedAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "AccActivityAccds_projectId_createdAt_idx" ON "AccActivityAccds" ("projectId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AccActivityAccds_userEmail_createdAt_idx" ON "AccActivityAccds" ("userEmail", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AccActivityAccds_activityVerb_idx" ON "AccActivityAccds" ("activityVerb");
CREATE INDEX IF NOT EXISTS "AccActivityAccds_createdAt_idx" ON "AccActivityAccds" ("createdAt" DESC);
```

- [ ] **Step 2: Apply the SQL to the local DB**

Run (executes each statement via the Prisma pg adapter, no psql needed):

```bash
node -e "const d=require('dotenv');d.config();const fs=require('fs');const{PrismaClient}=require('@prisma/client');const{PrismaPg}=require('@prisma/adapter-pg');const url=(process.env.DIRECT_URL||process.env.DATABASE_URL).trim();const p=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:2})});(async()=>{const sql=fs.readFileSync('prisma/migrations-raw/2026-06-11-acc-activity-accds.sql','utf8');for(const stmt of sql.split(';').map(s=>s.trim()).filter(Boolean)){await p.\$executeRawUnsafe(stmt);}console.log('applied');await p.\$disconnect();})().catch(e=>{console.error(e);process.exit(1);});"
```

Expected: prints `applied` with no error (idempotent — safe to re-run).

- [ ] **Step 3: Add the matching model to `prisma/schema.prisma`**

Append this model (place it directly after the `AccActivity` model, ~line 561):

```prisma
model AccActivityAccds {
  accdsActivityId String   @id
  autodeskId      String
  userEmail       String?
  userName        String?
  projectId       String
  serviceGroup    String?
  activityVerb    String
  objectId        String?
  objectType      String?
  objectName      String?
  folderId        String?
  folderName      String?
  createdAt       DateTime
  ingestRunId     String?
  fetchedAt       DateTime @default(now())

  @@index([projectId, createdAt(sort: Desc)])
  @@index([userEmail, createdAt(sort: Desc)])
  @@index([activityVerb])
  @@index([createdAt(sort: Desc)])
}
```

- [ ] **Step 4: Regenerate the Prisma client (does NOT touch the DB)**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` success. (`prisma.accActivityAccds` is now typed.)

- [ ] **Step 5: Verify the table exists and the client sees it**

Run:
```bash
node -e "const d=require('dotenv');d.config();const{PrismaClient}=require('@prisma/client');const{PrismaPg}=require('@prisma/adapter-pg');const url=(process.env.DIRECT_URL||process.env.DATABASE_URL).trim();const p=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:2})});p.accActivityAccds.count().then(n=>{console.log('rows:',n);return p.\$disconnect();}).catch(e=>{console.error(e);process.exit(1);});"
```
Expected: `rows: 0`.

- [ ] **Step 6: Commit**

```bash
git add prisma/migrations-raw/2026-06-11-acc-activity-accds.sql prisma/schema.prisma
git commit -m "feat(accds): add AccActivityAccds table for browser-session activity crawl"
```

---

### Task 2: Normalizer — `accdsActivityMap.ts`

**Files:**
- Create: `lib/acc/accdsActivityMap.ts`
- Test: `lib/acc/accdsActivityMap.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/acc/accdsActivityMap.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mapAccdsRow, type AccdsActivityRow } from './accdsActivityMap';

const REAL_ROW: AccdsActivityRow = {
  id: '13885172713',
  activity_id: '7e6216ee9f258678b33b22b74993cb91e86142d5',
  created_at: '2026-06-11T16:44:19.527Z',
  account_id: '63aeb891-e88c-4c25-840a-7cd5b27b392b',
  project_id: 'de161948-703f-413c-979a-8983c70d84d9',
  service_group: 'docs',
  activity_verb: 'view-entity',
  created_by: '5KETKE4XDK45',
  created_by_email: 'Monica.Rayos@hermosillo.com',
  created_by_display_name: 'Monica Rayos Hernandez',
  object_id: 'urn:adsk.wipprod:dm.lineage:knjOP4dQRaqWPVoSjTwOAQ',
  object_object_type: 'items:autodesk.bim360:File',
  object_display_name: 'DJI_0821.JPG',
  docs_object_folder_id: 'urn:adsk.wipprod:fs.folder:co.Huur3S48TbaYtZBc2hmMKg',
  docs_object_folder_display_name: '09.06.2026',
};

describe('mapAccdsRow', () => {
  it('maps a real accds row to the insert shape', () => {
    const r = mapAccdsRow(REAL_ROW, 'run-1');
    expect(r.accdsActivityId).toBe('7e6216ee9f258678b33b22b74993cb91e86142d5');
    expect(r.autodeskId).toBe('5KETKE4XDK45');
    expect(r.userEmail).toBe('monica.rayos@hermosillo.com'); // lowercased
    expect(r.userName).toBe('Monica Rayos Hernandez');
    expect(r.projectId).toBe('de161948-703f-413c-979a-8983c70d84d9');
    expect(r.serviceGroup).toBe('docs');
    expect(r.activityVerb).toBe('view-entity');
    expect(r.objectName).toBe('DJI_0821.JPG');
    expect(r.folderName).toBe('09.06.2026');
    expect(r.createdAt).toEqual(new Date('2026-06-11T16:44:19.527Z'));
    expect(r.ingestRunId).toBe('run-1');
  });

  it('null-coalesces missing optional fields and defaults ingestRunId to null', () => {
    const r = mapAccdsRow({
      activity_id: 'x', created_at: '2026-01-01T00:00:00.000Z',
      project_id: 'p1', activity_verb: 'issue-create', created_by: 'U1',
    });
    expect(r.userEmail).toBeNull();
    expect(r.userName).toBeNull();
    expect(r.serviceGroup).toBeNull();
    expect(r.objectName).toBeNull();
    expect(r.folderName).toBeNull();
    expect(r.ingestRunId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/acc/accdsActivityMap.test.ts`
Expected: FAIL — `Cannot find module './accdsActivityMap'`.

- [ ] **Step 3: Write the implementation**

Create `lib/acc/accdsActivityMap.ts`:

```typescript
/** One row from accds/v0 `template=activities`. Optional fields may be absent/null. */
export interface AccdsActivityRow {
  id?: string;
  activity_id: string;
  created_at: string;
  account_id?: string;
  project_id: string;
  service_group?: string | null;
  activity_verb: string;
  created_by: string;
  created_by_email?: string | null;
  created_by_display_name?: string | null;
  object_id?: string | null;
  object_object_type?: string | null;
  object_display_name?: string | null;
  docs_object_folder_id?: string | null;
  docs_object_folder_display_name?: string | null;
}

/** Insert shape for the `AccActivityAccds` table. */
export interface AccdsActivityInsert {
  accdsActivityId: string;
  autodeskId: string;
  userEmail: string | null;
  userName: string | null;
  projectId: string;
  serviceGroup: string | null;
  activityVerb: string;
  objectId: string | null;
  objectType: string | null;
  objectName: string | null;
  folderId: string | null;
  folderName: string | null;
  createdAt: Date;
  ingestRunId: string | null;
}

export function mapAccdsRow(
  row: AccdsActivityRow,
  ingestRunId: string | null = null,
): AccdsActivityInsert {
  return {
    accdsActivityId: row.activity_id,
    autodeskId: row.created_by,
    userEmail: row.created_by_email ? row.created_by_email.toLowerCase() : null,
    userName: row.created_by_display_name ?? null,
    projectId: row.project_id,
    serviceGroup: row.service_group ?? null,
    activityVerb: row.activity_verb,
    objectId: row.object_id ?? null,
    objectType: row.object_object_type ?? null,
    objectName: row.object_display_name ?? null,
    folderId: row.docs_object_folder_id ?? null,
    folderName: row.docs_object_folder_display_name ?? null,
    createdAt: new Date(row.created_at),
    ingestRunId,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/acc/accdsActivityMap.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/acc/accdsActivityMap.ts lib/acc/accdsActivityMap.test.ts
git commit -m "feat(accds): normalizer mapping accds rows to AccActivityAccds inserts"
```

---

### Task 3: Token provider — `accdsToken.ts`

**Files:**
- Create: `lib/acc/accdsToken.ts`
- Test: `lib/acc/accdsToken.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/acc/accdsToken.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import {
  cookieHeaderFromStorageState,
  fetchFreshToken,
  createTokenProvider,
  SessionExpiredError,
} from './accdsToken';

// A JWT whose payload sets exp; signature is irrelevant (we only decode).
function jwt(expSec: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: expSec })).toString('base64url');
  return `${header}.${payload}.sig`;
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('cookieHeaderFromStorageState', () => {
  it('keeps autodesk.com cookies, drops others, dedups by name', () => {
    const header = cookieHeaderFromStorageState({
      cookies: [
        { name: 'a', value: '1', domain: '.acc.autodesk.com' },
        { name: 'b', value: '2', domain: 'login.acc.autodesk.com' },
        { name: 'junk', value: 'x', domain: '.google.com' },
        { name: 'a', value: '3', domain: '.autodesk.com' }, // later wins
      ],
    });
    expect(header).toContain('a=3');
    expect(header).toContain('b=2');
    expect(header).not.toContain('junk');
  });
});

describe('fetchFreshToken', () => {
  it('returns accessToken + exp from the refresh endpoint', async () => {
    const token = jwt(2_000_000_000);
    const fetchImpl = vi.fn(async () => jsonResponse({ accessToken: token }));
    const res = await fetchFreshToken('a=1', fetchImpl as unknown as typeof fetch);
    expect(res.accessToken).toBe(token);
    expect(res.expSec).toBe(2_000_000_000);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('throws SessionExpiredError on 401', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }));
    await expect(fetchFreshToken('a=1', fetchImpl as unknown as typeof fetch))
      .rejects.toBeInstanceOf(SessionExpiredError);
  });
});

describe('createTokenProvider', () => {
  it('caches the token until ~60s before expiry, then refetches', async () => {
    let now = 1_000;
    const tokenA = jwt(1_000 + 1_000); // expires at 2000
    const tokenB = jwt(1_000 + 5_000);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ accessToken: tokenA }))
      .mockResolvedValueOnce(jsonResponse({ accessToken: tokenB }));
    const getToken = createTokenProvider('a=1', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      nowSec: () => now,
    });
    expect(await getToken()).toBe(tokenA);   // fetch #1
    expect(await getToken()).toBe(tokenA);   // cached, no fetch
    now = 1_990;                             // within 60s of exp (2000)
    expect(await getToken()).toBe(tokenB);   // fetch #2
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/acc/accdsToken.test.ts`
Expected: FAIL — `Cannot find module './accdsToken'`.

- [ ] **Step 3: Write the implementation**

Create `lib/acc/accdsToken.ts`:

```typescript
import { readFile } from 'node:fs/promises';

const REFRESH_URL = 'https://login.acc.autodesk.com/api/v1/authentication/refresh';
const ACC_HOME = 'https://acc.autodesk.com/';

/** Thrown when the persisted ACC session is no longer valid — re-run scripts/accds-login.cjs. */
export class SessionExpiredError extends Error {
  constructor(message = 'ACC session expired — re-run scripts/accds-login.cjs') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

interface StorageCookie { name: string; value: string; domain: string }
export interface StorageState { cookies: StorageCookie[] }
export interface FreshToken { accessToken: string; expSec: number }

/** Build a `Cookie:` header from a Playwright storageState, keeping only autodesk.com cookies. */
export function cookieHeaderFromStorageState(state: StorageState): string {
  const byName = new Map<string, string>();
  for (const c of state.cookies ?? []) {
    if (!c.domain.includes('autodesk.com')) continue;
    byName.set(c.name, c.value); // later entries win
  }
  return [...byName.entries()].map(([n, v]) => `${n}=${v}`).join('; ');
}

export async function loadCookieHeader(sessionPath: string): Promise<string> {
  const state = JSON.parse(await readFile(sessionPath, 'utf8')) as StorageState;
  if (!state.cookies?.length) throw new SessionExpiredError('No cookies in session file');
  const header = cookieHeaderFromStorageState(state);
  if (!header) throw new SessionExpiredError('No autodesk.com cookies in session file');
  return header;
}

function decodeExpSec(jwt: string): number {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
    return typeof payload.exp === 'number' ? payload.exp : 0;
  } catch {
    return 0;
  }
}

export async function fetchFreshToken(
  cookieHeader: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FreshToken> {
  const url = `${REFRESH_URL}?currentUrl=${encodeURIComponent(ACC_HOME)}`;
  const res = await fetchImpl(url, {
    headers: {
      cookie: cookieHeader,
      accept: 'application/json',
      origin: 'https://acc.autodesk.com',
      referer: ACC_HOME,
    },
    redirect: 'manual',
  });
  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
    throw new SessionExpiredError();
  }
  if (!res.ok) throw new Error(`accds token refresh failed (${res.status})`);
  const json = (await res.json()) as { accessToken?: string };
  if (!json.accessToken) throw new SessionExpiredError('refresh returned no accessToken');
  return { accessToken: json.accessToken, expSec: decodeExpSec(json.accessToken) };
}

export interface TokenProviderOpts {
  fetchImpl?: typeof fetch;
  nowSec?: () => number;
}

/** Returns getToken(): fresh bearer token, cached until ~60s before expiry. */
export function createTokenProvider(
  cookieHeader: string,
  opts: TokenProviderOpts = {},
): () => Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const nowSec = opts.nowSec ?? (() => Math.floor(Date.now() / 1000));
  let cache: FreshToken | null = null;
  return async function getToken(): Promise<string> {
    if (cache && cache.expSec - nowSec() > 60) return cache.accessToken;
    cache = await fetchFreshToken(cookieHeader, fetchImpl);
    return cache.accessToken;
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/acc/accdsToken.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/acc/accdsToken.ts lib/acc/accdsToken.test.ts
git commit -m "feat(accds): cookie-to-token provider with auto-refresh + SessionExpiredError"
```

---

### Task 4: Pager — `accdsActivity.ts`

**Files:**
- Create: `lib/acc/accdsActivity.ts`
- Test: `lib/acc/accdsActivity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/acc/accdsActivity.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { splitWindows, fetchActivityWindow, crawlProjectActivity } from './accdsActivity';
import type { AccdsActivityRow } from './accdsActivityMap';

function row(id: string): AccdsActivityRow {
  return { activity_id: id, created_at: '2026-06-01T00:00:00.000Z', project_id: 'p1', activity_verb: 'view-entity', created_by: 'U1' };
}
function page(rows: AccdsActivityRow[], total: number, hasNext: boolean): Response {
  return new Response(
    JSON.stringify({ results: rows, pagination: { total_results: String(total), has_next_page: hasNext } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
const getToken = async () => 'tok';

describe('splitWindows', () => {
  it('splits a 75-day span into 3 windows of <=30 days', () => {
    const w = splitWindows('2026-01-01T00:00:00.000Z', '2026-03-17T00:00:00.000Z', 30);
    expect(w.length).toBe(3);
    expect(w[0][0]).toBe('2026-01-01T00:00:00.000Z');
    expect(new Date(w[2][1]).toISOString()).toBe('2026-03-17T00:00:00.000Z');
  });
});

describe('fetchActivityWindow', () => {
  it('parses results + pagination', async () => {
    const fetchImpl = vi.fn(async () => page([row('a')], 1, false));
    const res = await fetchActivityWindow({
      getToken, projectId: 'p1', startISO: 's', endISO: 'e', limit: 50, offset: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res.results.map(r => r.activity_id)).toEqual(['a']);
    expect(res.total).toBe(1);
    expect(res.hasNextPage).toBe(false);
    const calledUrl = (fetchImpl.mock.calls[0][0]) as string;
    expect(calledUrl).toContain('/accds/v0/projects/p1/data');
    expect(calledUrl).toContain('template=activities');
  });

  it('throws on 403', async () => {
    const fetchImpl = vi.fn(async () => new Response('forbidden', { status: 403 }));
    await expect(fetchActivityWindow({
      getToken, projectId: 'p1', startISO: 's', endISO: 'e', limit: 50, offset: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow(/403/);
  });
});

describe('crawlProjectActivity', () => {
  it('pages through offsets within one window and collects all rows', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(page([row('a'), row('b')], 3, true))  // offset 0
      .mockResolvedValueOnce(page([row('c')], 3, false));          // offset 2
    const collected: string[] = [];
    const res = await crawlProjectActivity({
      getToken, projectId: 'p1',
      fromISO: '2026-06-01T00:00:00.000Z', toISO: '2026-06-15T00:00:00.000Z',
      pageSize: 2,
      onRows: async (rows) => { collected.push(...rows.map(r => r.activity_id)); },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(collected).toEqual(['a', 'b', 'c']);
    expect(res.fetched).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/acc/accdsActivity.test.ts`
Expected: FAIL — `Cannot find module './accdsActivity'`.

- [ ] **Step 3: Write the implementation**

Create `lib/acc/accdsActivity.ts`:

```typescript
import type { AccdsActivityRow } from './accdsActivityMap';

const ACCDS_BASE = 'https://developer.api.autodesk.com/accds/v0/projects';

export interface AccdsPage {
  results: AccdsActivityRow[];
  total: number;
  hasNextPage: boolean;
}

/** Split [fromISO, toISO] into consecutive windows of at most `maxDays` (accds rejects wider). */
export function splitWindows(fromISO: string, toISO: string, maxDays = 30): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let start = new Date(fromISO).getTime();
  const end = new Date(toISO).getTime();
  const stepMs = maxDays * 24 * 60 * 60 * 1000;
  while (start < end) {
    const next = Math.min(start + stepMs, end);
    out.push([new Date(start).toISOString(), new Date(next).toISOString()]);
    start = next;
  }
  return out;
}

export async function fetchActivityWindow(args: {
  getToken: () => Promise<string>;
  projectId: string;
  startISO: string;
  endISO: string;
  limit: number;
  offset: number;
  fetchImpl?: typeof fetch;
}): Promise<AccdsPage> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const token = await args.getToken();
  const url =
    `${ACCDS_BASE}/${args.projectId}/data?template=activities` +
    `&filter[created_at]=${args.startISO}..${args.endISO}` +
    `&limit=${args.limit}&offset=${args.offset}`;
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, region: 'US' } });
  if (!res.ok) throw new Error(`accds ${res.status} for project ${args.projectId}`);
  const json = (await res.json()) as {
    results?: AccdsActivityRow[];
    pagination?: { total_results?: string; has_next_page?: boolean };
  };
  return {
    results: json.results ?? [],
    total: Number(json.pagination?.total_results ?? 0),
    hasNextPage: Boolean(json.pagination?.has_next_page),
  };
}

/** Crawl one project's activity across the date range, streaming pages to onRows. */
export async function crawlProjectActivity(args: {
  getToken: () => Promise<string>;
  projectId: string;
  fromISO: string;
  toISO: string;
  onRows: (rows: AccdsActivityRow[]) => Promise<void>;
  pageSize?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ projectId: string; fetched: number }> {
  const pageSize = args.pageSize ?? 200;
  let fetched = 0;
  for (const [startISO, endISO] of splitWindows(args.fromISO, args.toISO)) {
    let offset = 0;
    for (;;) {
      const page = await fetchActivityWindow({
        getToken: args.getToken,
        projectId: args.projectId,
        startISO,
        endISO,
        limit: pageSize,
        offset,
        fetchImpl: args.fetchImpl,
      });
      if (page.results.length) {
        await args.onRows(page.results);
        fetched += page.results.length;
      }
      if (!page.hasNextPage || page.results.length === 0) break;
      offset += pageSize;
    }
  }
  return { projectId: args.projectId, fetched };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/acc/accdsActivity.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck the three new libs together**

Run: `npx tsc --noEmit`
Expected: no errors referencing `lib/acc/accds*`.

- [ ] **Step 6: Commit**

```bash
git add lib/acc/accdsActivity.ts lib/acc/accdsActivity.test.ts
git commit -m "feat(accds): activity pager (window split + offset paging)"
```

---

### Task 5: Session bootstrap — `scripts/accds-login.cjs`

**Files:**
- Create: `scripts/accds-login.cjs`

This is an interactive one-shot (no unit test — it drives a real browser).

- [ ] **Step 1: Write the script**

Create `scripts/accds-login.cjs`:

```javascript
#!/usr/bin/env node
/**
 * One-time ACC session bootstrap for the accds crawler.
 * Opens a headed browser; you log into acc.autodesk.com (incl. MFA). On success,
 * persists the session cookies (Playwright storageState) to scratch/acc-session.json.
 * Re-run only when the crawler reports SessionExpiredError.
 *
 * NOTE: scratch/ is gitignored. The cookie file is password-equivalent — keep it local.
 *
 * Run: node scripts/accds-login.cjs
 */
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const OUT = path.join(process.cwd(), 'scratch', 'acc-session.json');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('https://acc.autodesk.com');
  console.log('→ Log in to ACC in the opened window (email + MFA). Waiting up to 5 min …');
  // Wait until we are on an acc.autodesk.com app route that is NOT the sign-in page.
  await page.waitForURL((url) => url.host.endsWith('acc.autodesk.com') && !/signin/i.test(url.href), {
    timeout: 5 * 60 * 1000,
  });
  await page.waitForTimeout(5000); // let the SPA finish setting auth cookies
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await ctx.storageState({ path: OUT });
  const n = JSON.parse(fs.readFileSync(OUT, 'utf8')).cookies.length;
  console.log(`✓ session saved → ${OUT} (${n} cookies)`);
  await browser.close();
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
```

- [ ] **Step 2: Run it and log in**

Run: `node scripts/accds-login.cjs`
Action: complete the Autodesk login in the opened window.
Expected: `✓ session saved → …scratch/acc-session.json (N cookies)` with N > 0.

- [ ] **Step 3: Verify the token provider works against the real session (integration gate)**

This is the critical validation that the pure-Node cookie replay is accepted by the refresh endpoint. Run:

```bash
node -e "require('dotenv').config();require('tsx/cjs');const{loadCookieHeader,createTokenProvider}=require('./lib/acc/accdsToken.ts');const{fetchActivityWindow}=require('./lib/acc/accdsActivity.ts');(async()=>{const c=await loadCookieHeader('scratch/acc-session.json');const getToken=createTokenProvider(c);const tok=await getToken();console.log('token len',tok.length);const p=await fetchActivityWindow({getToken,projectId:'de161948-703f-413c-979a-8983c70d84d9',startISO:'2026-05-11T00:00:00.000Z',endISO:'2026-06-11T23:59:59.999Z',limit:1,offset:0});console.log('accds total_results',p.total);})().catch(e=>{console.error(e);process.exit(1);});"
```

Expected: `token len <number>` then `accds total_results <thousands>`.
**If this throws `SessionExpiredError` or an HTTP error on the refresh call** (the endpoint rejects Node-replayed cookies), STOP and switch the token provider to the documented fallback: run the refresh inside a live Playwright page context (`page.evaluate` the refresh `fetch`, as proven in the spec's discovery). Note this deviation and continue.

- [ ] **Step 4: Commit**

```bash
git add scripts/accds-login.cjs
git commit -m "feat(accds): headed-browser session bootstrap persisting ACC cookies"
```

---

### Task 6: Runner — `scripts/accds-activity-ingest.cjs`

**Files:**
- Create: `scripts/accds-activity-ingest.cjs`

- [ ] **Step 1: Write the runner**

Create `scripts/accds-activity-ingest.cjs`:

```javascript
#!/usr/bin/env node
/**
 * accds/v0 activity crawler. Pages every admin-accessible project (no DC quota)
 * over the trailing ACCDS_MONTHS_BACK months and upserts into AccActivityAccds.
 *
 * Env:
 *   ACCDS_MONTHS_BACK=12   trailing window (default 12)
 *   ACCDS_PROJECT=<id>     crawl only this project (smoke test); else all distinct
 *                          projectIds already present in AccActivity (admin-accessible set)
 *
 * Requires scratch/acc-session.json (run scripts/accds-login.cjs first).
 * Run: node scripts/accds-activity-ingest.cjs
 */
const path = require('node:path');
const dotenv = (() => { try { return require('dotenv'); } catch { return null; } })();
if (dotenv) dotenv.config();
require('tsx/cjs');

function createPrisma() {
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const url = (process.env.DIRECT_URL && process.env.DIRECT_URL.trim()) ||
              (process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
  if (!url) throw new Error('DATABASE_URL or DIRECT_URL must be set');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 4 }), log: ['error'] });
}

const { loadCookieHeader, createTokenProvider } = require(path.resolve(__dirname, '..', 'lib', 'acc', 'accdsToken.ts'));
const { crawlProjectActivity } = require(path.resolve(__dirname, '..', 'lib', 'acc', 'accdsActivity.ts'));
const { mapAccdsRow } = require(path.resolve(__dirname, '..', 'lib', 'acc', 'accdsActivityMap.ts'));
const pLimitMod = require('p-limit');
const pLimit = pLimitMod.default || pLimitMod;

const SESSION = path.join(process.cwd(), 'scratch', 'acc-session.json');
const MONTHS_BACK = Number(process.env.ACCDS_MONTHS_BACK || 12);
const ONLY = process.env.ACCDS_PROJECT || null;

async function main() {
  const prisma = createPrisma();
  const runId = 'accds-' + new Date().toISOString();
  try {
    const cookieHeader = await loadCookieHeader(SESSION);
    const getToken = createTokenProvider(cookieHeader);

    const toISO = new Date().toISOString();
    const fromISO = new Date(Date.now() - MONTHS_BACK * 30 * 24 * 60 * 60 * 1000).toISOString();

    let projectIds;
    if (ONLY) {
      projectIds = [ONLY];
    } else {
      const rows = await prisma.accActivity.findMany({
        where: { projectId: { not: null } },
        distinct: ['projectId'],
        select: { projectId: true },
      });
      projectIds = rows.map((r) => r.projectId).filter((p) => p && p.length > 0);
    }
    console.log(`[accds] ${projectIds.length} project(s); window ${fromISO} .. ${toISO}; run ${runId}`);

    const limit = pLimit(4);
    let totalInserted = 0;
    await Promise.all(projectIds.map((projectId) => limit(async () => {
      const seen = new Set();
      let buffer = [];
      const flush = async () => {
        if (!buffer.length) return;
        const res = await prisma.accActivityAccds.createMany({ data: buffer, skipDuplicates: true });
        totalInserted += res.count;
        buffer = [];
      };
      try {
        const { fetched } = await crawlProjectActivity({
          getToken, projectId, fromISO, toISO,
          onRows: async (rows) => {
            for (const r of rows) {
              if (seen.has(r.activity_id)) continue;
              seen.add(r.activity_id);
              buffer.push(mapAccdsRow(r, runId));
            }
            if (buffer.length >= 500) await flush();
          },
        });
        await flush();
        console.log(`  ✓ ${projectId}  fetched=${fetched}`);
      } catch (e) {
        console.error(`  ✗ ${projectId}: ${e && e.message ? e.message : e}`);
      }
    })));

    console.log(`[accds] done. inserted ~${totalInserted} new rows (run ${runId}).`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
```

- [ ] **Step 2: Smoke-run on a single known project**

Run: `ACCDS_PROJECT=de161948-703f-413c-979a-8983c70d84d9 node scripts/accds-activity-ingest.cjs`
Expected: `✓ de161948-… fetched=<thousands>` and `inserted ~<thousands> new rows`.

- [ ] **Step 3: Verify rows landed and dedup holds (re-run is idempotent)**

Run the smoke command from Step 2 **again**, then check the count:
```bash
node -e "require('dotenv').config();const{PrismaClient}=require('@prisma/client');const{PrismaPg}=require('@prisma/adapter-pg');const url=(process.env.DIRECT_URL||process.env.DATABASE_URL).trim();const p=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:2})});p.accActivityAccds.count({where:{projectId:'de161948-703f-413c-979a-8983c70d84d9'}}).then(n=>{console.log('rows for project:',n);return p.\$disconnect();});"
```
Expected: a stable count (second run inserts ~0 new — `skipDuplicates` on `accdsActivityId` holds).

- [ ] **Step 4: Commit**

```bash
git add scripts/accds-activity-ingest.cjs
git commit -m "feat(accds): activity crawler runner writing AccActivityAccds"
```

---

### Task 7: Parity diagnostic & verification gate

**Files:**
- Create: `scripts/diag-accds-vs-dc.cjs`

- [ ] **Step 1: Write the diagnostic**

Create `scripts/diag-accds-vs-dc.cjs`:

```javascript
#!/usr/bin/env node
/**
 * Parity check: for one project + month, compare AccActivityAccds (new) vs
 * AccActivity (DC source) row counts and per-verb / per-action breakdown.
 * Read-only. Run: node scripts/diag-accds-vs-dc.cjs <projectId> <YYYY-MM>
 */
const dotenv = (() => { try { return require('dotenv'); } catch { return null; } })();
if (dotenv) dotenv.config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const projectId = process.argv[2] || 'de161948-703f-413c-979a-8983c70d84d9';
const month = process.argv[3] || '2026-05';

async function main() {
  const url = (process.env.DIRECT_URL || process.env.DATABASE_URL).trim();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
  try {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    const where = { projectId, createdAt: { gte: start, lt: end } };

    const [accdsTotal, dcTotal] = await Promise.all([
      prisma.accActivityAccds.count({ where }),
      prisma.accActivity.count({ where }),
    ]);
    const byVerb = await prisma.accActivityAccds.groupBy({ by: ['activityVerb'], where, _count: { accdsActivityId: true } });

    console.log(`project=${projectId} month=${month}`);
    console.log(`  AccActivityAccds (new): ${accdsTotal}`);
    console.log(`  AccActivity (DC):       ${dcTotal}`);
    console.log('  accds top verbs:');
    byVerb.sort((a, b) => b._count.accdsActivityId - a._count.accdsActivityId).slice(0, 12)
      .forEach((v) => console.log(`    ${String(v._count.accdsActivityId).padStart(8)}  ${v.activityVerb}`));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the parity check**

Run: `node scripts/diag-accds-vs-dc.cjs de161948-703f-413c-979a-8983c70d84d9 2026-05`
Expected: both counts printed; accds total in the thousands, with a verb breakdown including `view-entity`, `upload-entity`, etc. (accds typically ≥ DC for a recent month because it includes every view event). Record the numbers in the final commit message.

- [ ] **Step 3: Full suite + typecheck**

Run: `npm test` then `npx tsc --noEmit`
Expected: all unit tests pass (existing suite + the new `accds*` tests); no new type errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/diag-accds-vs-dc.cjs
git commit -m "feat(accds): parity diagnostic (AccActivityAccds vs AccActivity)"
```

---

## Done criteria

- `npm test` green (incl. new `accdsActivityMap`/`accdsToken`/`accdsActivity` tests); `npx tsc --noEmit` clean.
- `scripts/accds-login.cjs` produces `scratch/acc-session.json`; the integration gate (Task 5 Step 3) returns a real `total_results`.
- `scripts/accds-activity-ingest.cjs` populates `AccActivityAccds` and is idempotent on re-run.
- Parity diagnostic shows accds counts in line with (typically ≥) DC for a recent month.
- DC pipeline untouched; existing `AccActivity` queries unaffected (separate table → no double-count).

## Deferred (not in this plan)
- Pointing dashboard activity panels at `AccActivityAccds` / merging sources (after the parallel-run comparison).
- Scheduling the crawler (cron/Task Scheduler) + session-expiry alerting.
- Retiring the Data Connector activity path.
