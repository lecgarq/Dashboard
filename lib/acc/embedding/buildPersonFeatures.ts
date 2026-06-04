import type { PrismaClient } from "@prisma/client";
import type { PersonFeatureBag } from "./types";

// ---------------------------------------------------------------------------
// Pure quantile helpers (exported for unit tests)
// ---------------------------------------------------------------------------

export function quantileEdges(values: number[], n = 5): number[] {
  const s = values.filter((v) => v > 0).slice().sort((a, b) => a - b);
  if (!s.length) return [];
  const e: number[] = [];
  for (let i = 1; i < n; i++) e.push(s[Math.floor((i / n) * s.length)]);
  return e;
}

export function quantileBucket(v: number, edges: number[]): number {
  if (v <= 0) return -1;
  let b = 0;
  for (const e of edges) if (v > e) b++;
  return b;
}

// ---------------------------------------------------------------------------
// DB feature builder — ports embed.cjs feature-construction logic exactly.
// All table/column names kept double-quoted PascalCase to match the DB schema.
// ---------------------------------------------------------------------------

const PERM_RANK: Record<string, number> = {
  "View Only": 0,
  "View+Download": 1,
  "Upload Only": 1,
  "View+Download+Upload": 2,
  "View+Download+Upload+Edit": 3,
  "Full Controller": 4,
};

const INTERNAL = new Set(["hermosillo.com", "hermosillo.com.mx"]);

export async function buildPersonFeatures(
  db: PrismaClient
): Promise<PersonFeatureBag[]> {
  // ---- person universe ----
  const personRows = await db.$queryRawUnsafe<Array<{ userId: string }>>(
    `SELECT DISTINCT "userId" FROM "AccDcProjectUser"`
  );
  const persons = personRows.map((r) => r.userId);
  const P = new Map(persons.map((id, i) => [id, i]));
  const N = persons.length;

  // Per-person feature maps: feat key -> TF
  const feats: Map<string, number>[] = Array.from({ length: N }, () => new Map());
  const add = (p: number | undefined, key: string, tf = 1) => {
    if (p == null) return;
    const m = feats[p];
    m.set(key, (m.get(key) ?? 0) + tf);
  };

  // ---- proj / role / comp / mod / adm ----
  const projRows = await db.$queryRawUnsafe<
    Array<{ userId: string; projectId: string }>
  >(`SELECT "userId","projectId" FROM "AccDcProjectUser"`);
  for (const r of projRows) add(P.get(r.userId), "proj:" + r.projectId);

  const roleRows = await db.$queryRawUnsafe<
    Array<{ userId: string; roleId: string }>
  >(`SELECT "userId","roleId" FROM "AccDcProjectUserRole"`);
  for (const r of roleRows) add(P.get(r.userId), "role:" + r.roleId);

  const compRows = await db.$queryRawUnsafe<
    Array<{ userId: string; companyId: string }>
  >(`SELECT "userId","companyId" FROM "AccDcProjectUserCompany"`);
  for (const r of compRows) add(P.get(r.userId), "comp:" + r.companyId);

  const prodRows = await db.$queryRawUnsafe<
    Array<{ userId: string; productKey: string; accessLevel: string | null }>
  >(
    `SELECT "userId","productKey","accessLevel" FROM "AccDcProjectUserProduct"`
  );
  for (const r of prodRows) {
    add(P.get(r.userId), "mod:" + r.productKey);
    if (r.accessLevel === "project_admin")
      add(P.get(r.userId), "adm:" + r.productKey);
  }

  // ---- ext / stat / activity / exec ----
  const recency = new Float64Array(N).fill(-1);
  const adidToP = new Map<string, number>();

  const userRows = await db.$queryRawUnsafe<
    Array<{
      id: string;
      email: string | null;
      status: string | null;
      aid: string | null;
      name: string | null;
    }>
  >(
    `SELECT id,email,status,"autodeskId" aid,name FROM "AccDcUser"`
  );

  // Carry names — keyed by userId (= AccDcUser.id)
  const nameMap = new Map<string, string>();
  for (const r of userRows) {
    const p = P.get(r.id);
    if (p == null) continue;
    nameMap.set(r.id, r.name ?? r.id);
    if (r.aid) adidToP.set(r.aid, p);
    const dom = (r.email ?? "").toLowerCase().split("@")[1] ?? "";
    add(p, "ext:" + (INTERNAL.has(dom) ? "int" : "ext"));
    if (r.status) add(p, "stat:" + r.status);
  }

  // Activity attributed by autodeskId (avoids 35% null-email loss)
  const actRows = await db.$queryRawUnsafe<
    Array<{ aid: string; act: string; n: string | number; last: Date | string }>
  >(
    `SELECT "autodeskId" aid,"rawAction" act,count(*) n,max("createdAt") last ` +
      `FROM "AccActivity" ` +
      `WHERE "autodeskId" IS NOT NULL AND "rawAction" IS NOT NULL ` +
      `GROUP BY 1,2`
  );
  for (const r of actRows) {
    const p = adidToP.get(r.aid);
    if (p == null) continue;
    add(p, "act:" + r.act, Math.log1p(Number(r.n)));
    const d =
      (Date.now() - new Date(r.last).getTime()) / 86400000;
    if (recency[p] < 0 || d < recency[p]) recency[p] = d;
  }

  // Executive flag
  const execRows = await db.$queryRawUnsafe<Array<{ aid: string }>>(
    `SELECT DISTINCT "autodeskId" aid FROM "AccProjectMember" ` +
      `WHERE executive=true AND "autodeskId" IS NOT NULL`
  );
  for (const r of execRows) {
    const p = adidToP.get(r.aid);
    if (p != null) add(p, "exec:1");
  }

  // ---- folder permission footprint via role aggregation ----
  const rolePerm = new Map<
    string,
    { f: [number, number, number, number, number]; b: number }
  >();
  const fpRows = await db.$queryRawUnsafe<
    Array<{ rid: string; pt: string; f: string | number; b: string | number }>
  >(
    `SELECT fp."roleId" rid,fp."permType" pt,count(DISTINCT fp."folderId") f,` +
      `COALESCE(sum(f2."totalSizeBytes"),0) b ` +
      `FROM "AccFolderPermission" fp ` +
      `LEFT JOIN "AccFolder" f2 ON f2.id=fp."folderId" ` +
      `GROUP BY 1,2`
  );
  for (const r of fpRows) {
    const rk = PERM_RANK[r.pt];
    if (rk === undefined) continue;
    let e = rolePerm.get(r.rid);
    if (!e) {
      e = { f: [0, 0, 0, 0, 0], b: 0 };
      rolePerm.set(r.rid, e);
    }
    e.f[rk] += Number(r.f);
    e.b += Number(r.b);
  }

  const reach = new Float64Array(N);
  const bytes = new Float64Array(N);

  const userRoleRows = await db.$queryRawUnsafe<
    Array<{ userId: string; a: string[] }>
  >(
    `SELECT "userId",array_agg(DISTINCT "roleId") a FROM "AccDcProjectUserRole" GROUP BY 1`
  );
  for (const r of userRoleRows) {
    const p = P.get(r.userId);
    if (p == null) continue;
    const acc: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    let bs = 0;
    for (const rid of r.a) {
      const e = rolePerm.get(rid);
      if (!e) continue;
      for (let s = 0; s < 5; s++) acc[s] += e.f[s];
      bs += e.b;
    }
    for (let s = 0; s < 5; s++) if (acc[s] > 0) add(p, "perm" + s, Math.log1p(acc[s]));
    reach[p] = acc.reduce((x, y) => x + y, 0);
    bytes[p] = bs;
  }

  // ---- tenure ----
  const tenure = new Float64Array(N);
  const tenureRows = await db.$queryRawUnsafe<
    Array<{ userId: string; d: string | number }>
  >(
    `SELECT "userId",EXTRACT(EPOCH FROM (now()-min("addedOn")))/86400 d ` +
      `FROM "AccDcProjectUser" GROUP BY 1`
  );
  for (const r of tenureRows) {
    const p = P.get(r.userId);
    if (p != null) tenure[p] = Number(r.d) || 0;
  }

  // ---- quantile one-hot buckets ----
  const projCount = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    for (const k of feats[i].keys()) if (k.startsWith("proj:")) projCount[i]++;
  }

  const numerics: [string, Float64Array][] = [
    ["ten", tenure],
    ["reach", reach],
    ["bytes", bytes],
    ["recency", recency],
    ["pc", projCount],
  ];
  for (const [name, arr] of numerics) {
    const edges = quantileEdges([...arr]);
    for (let i = 0; i < N; i++) {
      const b = quantileBucket(arr[i], edges);
      if (b >= 0) add(i, name + ":" + b);
    }
  }

  // ---- assemble output ----
  return persons.map((personId, i) => ({
    personId,
    name: nameMap.get(personId) ?? personId,
    features: feats[i],
  }));
}
