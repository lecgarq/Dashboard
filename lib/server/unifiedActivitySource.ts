import { Prisma } from "@prisma/client";

export interface DcActivitySourceRow {
  id: string;
  autodeskId: string;
  userEmail: string | null;
  projectId: string | null;
  rawAction: string;
  service: string | null;
  tool: string | null;
  details: string | null;
  sourceFile: string;
  createdAt: Date;
}

export interface AccdsActivitySourceRow {
  accdsActivityId: string;
  autodeskId: string;
  userEmail: string | null;
  userName?: string | null;
  projectId: string;
  serviceGroup: string | null;
  activityVerb: string;
  objectId?: string | null;
  objectType: string | null;
  objectName: string | null;
  folderId?: string | null;
  folderName: string | null;
  createdAt: Date;
}

export interface UnifiedActivityRow {
  id: string;
  autodeskId: string;
  userEmail: string | null;
  projectId: string | null;
  rawAction: string;
  service: string | null;
  tool: string | null;
  details: string | null;
  sourceFile: string;
  createdAt: Date;
}

export interface UnifiedActivityGroupRow {
  userEmail: string;
  projectId: string;
  rawAction: string;
  count: number;
  lastCreatedAt: string;
}

export interface UnifiedAdminActionRow {
  actorEmail: string;
  rawAction: string;
  count: number;
}

export interface UnifiedRawActionGroupRow {
  rawAction: string;
  count: number;
}

type QueryableDb = {
  $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T>;
};

type DateRange = {
  gte?: Date;
  lte?: Date;
  lt?: Date;
};

type UnifiedWhere = {
  userEmail?: string;
  userEmails?: readonly string[];
  userEmailNotNull?: boolean;
  userEmailNull?: boolean;
  projectId?: string;
  projectIdNotEmpty?: boolean;
  rawActionIn?: readonly string[];
  rawActionNotIn?: readonly string[];
  sourceFile?: string;
  createdAt?: DateRange;
  cursorBefore?: { createdAt: Date; id: string };
};

const UNIFIED_ACTIVITY_CTE = Prisma.sql`
  WITH astart AS (
    SELECT "projectId", MIN("createdAt") AS s
    FROM "AccActivityAccds"
    GROUP BY "projectId"
  ),
  unified_activity AS (
    SELECT
      d.id AS id,
      d."autodeskId" AS "autodeskId",
      d."userEmail" AS "userEmail",
      d."projectId" AS "projectId",
      d."rawAction" AS "rawAction",
      d.service AS service,
      d.tool AS tool,
      d.details AS details,
      d."sourceFile" AS "sourceFile",
      d."createdAt" AS "createdAt"
    FROM "AccActivity" d
    LEFT JOIN astart a ON a."projectId" = d."projectId"
    WHERE d."projectId" IS NULL
       OR d."projectId" = ''
       OR a.s IS NULL
       OR d."createdAt" < a.s
    UNION ALL
    SELECT
      ('accds:' || aa."accdsActivityId") AS id,
      aa."autodeskId" AS "autodeskId",
      aa."userEmail" AS "userEmail",
      aa."projectId" AS "projectId",
      aa."activityVerb" AS "rawAction",
      aa."serviceGroup" AS service,
      NULL::text AS tool,
      COALESCE(aa."objectName", aa."folderName", aa."objectType") AS details,
      'accds'::text AS "sourceFile",
      aa."createdAt" AS "createdAt"
    FROM "AccActivityAccds" aa
  )
`;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toCount(value: bigint | number): number {
  return typeof value === "bigint" ? Number(value) : value;
}

function andSql(parts: Prisma.Sql[]): Prisma.Sql {
  if (parts.length === 0) return Prisma.empty;
  return parts.slice(1).reduce((sql, part) => Prisma.sql`${sql} AND ${part}`, parts[0]);
}

function whereParts(where: UnifiedWhere = {}): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [];
  if (where.userEmail) parts.push(Prisma.sql`LOWER("userEmail") = ${where.userEmail.toLowerCase()}`);
  if (where.userEmails) {
    const emails = where.userEmails.map((email) => email.toLowerCase());
    parts.push(emails.length > 0 ? Prisma.sql`LOWER("userEmail") = ANY(${emails})` : Prisma.sql`FALSE`);
  }
  if (where.userEmailNotNull) parts.push(Prisma.sql`"userEmail" IS NOT NULL`);
  if (where.userEmailNull) parts.push(Prisma.sql`"userEmail" IS NULL`);
  if (where.projectId) parts.push(Prisma.sql`"projectId" = ${where.projectId}`);
  if (where.projectIdNotEmpty) parts.push(Prisma.sql`"projectId" IS NOT NULL AND "projectId" <> ''`);
  if (where.rawActionIn) {
    parts.push(where.rawActionIn.length > 0 ? Prisma.sql`"rawAction" = ANY(${[...where.rawActionIn]})` : Prisma.sql`FALSE`);
  }
  if (where.rawActionNotIn && where.rawActionNotIn.length > 0) {
    parts.push(Prisma.sql`NOT ("rawAction" = ANY(${[...where.rawActionNotIn]}))`);
  }
  if (where.sourceFile) parts.push(Prisma.sql`"sourceFile" = ${where.sourceFile}`);
  if (where.createdAt?.gte) parts.push(Prisma.sql`"createdAt" >= ${where.createdAt.gte}`);
  if (where.createdAt?.lte) parts.push(Prisma.sql`"createdAt" <= ${where.createdAt.lte}`);
  if (where.createdAt?.lt) parts.push(Prisma.sql`"createdAt" < ${where.createdAt.lt}`);
  if (where.cursorBefore) {
    parts.push(Prisma.sql`("createdAt" < ${where.cursorBefore.createdAt} OR ("createdAt" = ${where.cursorBefore.createdAt} AND id < ${where.cursorBefore.id}))`);
  }
  return parts;
}

function whereSql(where: UnifiedWhere = {}): Prisma.Sql {
  const parts = whereParts(where);
  if (parts.length === 0) return Prisma.empty;
  return Prisma.sql`WHERE ${andSql(parts)}`;
}

export function normalizeAccdsActivityRow(row: AccdsActivitySourceRow): UnifiedActivityRow {
  return {
    id: `accds:${row.accdsActivityId}`,
    autodeskId: row.autodeskId,
    userEmail: row.userEmail,
    projectId: row.projectId,
    rawAction: row.activityVerb,
    service: row.serviceGroup,
    tool: null,
    details: row.objectName ?? row.folderName ?? row.objectType,
    sourceFile: "accds",
    createdAt: row.createdAt,
  };
}

export function mergeActivitySources(args: {
  dcRows: readonly DcActivitySourceRow[];
  accdsRows: readonly AccdsActivitySourceRow[];
}): UnifiedActivityRow[] {
  const accdsStartByProject = new Map<string, Date>();
  for (const row of args.accdsRows) {
    const existing = accdsStartByProject.get(row.projectId);
    if (!existing || row.createdAt < existing) accdsStartByProject.set(row.projectId, row.createdAt);
  }

  const accdsRows = args.accdsRows.map(normalizeAccdsActivityRow);
  const dcRows = args.dcRows.filter((row) => {
    if (!row.projectId) return true;
    const accdsStart = accdsStartByProject.get(row.projectId);
    return !accdsStart || row.createdAt < accdsStart;
  });

  return [...accdsRows, ...dcRows];
}

export function groupUnifiedActivityRowsByUserProjectAction(
  rows: readonly UnifiedActivityRow[],
): UnifiedActivityGroupRow[] {
  const groups = new Map<string, UnifiedActivityGroupRow>();
  for (const row of rows) {
    if (!row.userEmail || !row.projectId) continue;
    const userEmail = row.userEmail.toLowerCase();
    const key = `${userEmail}::${row.projectId}::${row.rawAction}`;
    const existing = groups.get(key);
    const iso = row.createdAt.toISOString();
    if (existing) {
      existing.count += 1;
      if (iso > existing.lastCreatedAt) existing.lastCreatedAt = iso;
    } else {
      groups.set(key, {
        userEmail,
        projectId: row.projectId,
        rawAction: row.rawAction,
        count: 1,
        lastCreatedAt: iso,
      });
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.userEmail.localeCompare(b.userEmail) ||
      a.projectId.localeCompare(b.projectId) ||
      a.rawAction.localeCompare(b.rawAction),
  );
}

export async function listUnifiedActivityRows(
  db: QueryableDb,
  args: { where?: UnifiedWhere; take?: number },
): Promise<UnifiedActivityRow[]> {
  const limit = typeof args.take === "number" ? Prisma.sql`LIMIT ${args.take}` : Prisma.empty;
  return db.$queryRaw<UnifiedActivityRow[]>(Prisma.sql`
    ${UNIFIED_ACTIVITY_CTE}
    SELECT id, "autodeskId", "userEmail", "projectId", "rawAction", service, tool, details, "sourceFile", "createdAt"
    FROM unified_activity
    ${whereSql(args.where)}
    ORDER BY "createdAt" DESC, id DESC
    ${limit}
  `);
}

export async function countUnifiedActivityRows(
  db: QueryableDb,
  where: UnifiedWhere = {},
): Promise<number> {
  const rows = await db.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
    ${UNIFIED_ACTIVITY_CTE}
    SELECT COUNT(*)::bigint AS count
    FROM unified_activity
    ${whereSql(where)}
  `);
  return toCount(rows[0]?.count ?? 0);
}

export async function findUnifiedActivityDate(
  db: QueryableDb,
  args: { where?: UnifiedWhere; order: "asc" | "desc" },
): Promise<Date | null> {
  const direction = Prisma.raw(args.order === "asc" ? "ASC" : "DESC");
  const rows = await db.$queryRaw<Array<{ createdAt: Date }>>(Prisma.sql`
    ${UNIFIED_ACTIVITY_CTE}
    SELECT "createdAt"
    FROM unified_activity
    ${whereSql(args.where)}
    ORDER BY "createdAt" ${direction}
    LIMIT 1
  `);
  return rows[0]?.createdAt ?? null;
}

export async function groupUnifiedActivityByUserProjectAction(
  db: QueryableDb,
  where: UnifiedWhere = {},
): Promise<UnifiedActivityGroupRow[]> {
  const rows = await db.$queryRaw<
    Array<{
      userEmail: string;
      projectId: string;
      rawAction: string;
      count: bigint | number;
      lastCreatedAt: Date | string;
    }>
  >(Prisma.sql`
    ${UNIFIED_ACTIVITY_CTE}
    SELECT
      LOWER("userEmail") AS "userEmail",
      "projectId",
      "rawAction",
      COUNT(*)::bigint AS count,
      MAX("createdAt") AS "lastCreatedAt"
    FROM unified_activity
    ${whereSql({ ...where, userEmailNotNull: true, projectIdNotEmpty: true })}
    GROUP BY LOWER("userEmail"), "projectId", "rawAction"
  `);
  return rows.map((row) => ({
    userEmail: row.userEmail,
    projectId: row.projectId,
    rawAction: row.rawAction,
    count: toCount(row.count),
    lastCreatedAt: toIso(row.lastCreatedAt),
  }));
}

export async function groupUnifiedAdminActionsByActor(
  db: QueryableDb,
): Promise<UnifiedAdminActionRow[]> {
  const rows = await db.$queryRaw<
    Array<{ actorEmail: string; rawAction: string; count: bigint | number }>
  >(Prisma.sql`
    ${UNIFIED_ACTIVITY_CTE}
    SELECT LOWER("userEmail") AS "actorEmail", "rawAction", COUNT(*)::bigint AS count
    FROM unified_activity
    WHERE "sourceFile" = 'admin'
      AND "userEmail" IS NOT NULL
    GROUP BY LOWER("userEmail"), "rawAction"
  `);
  return rows.map((row) => ({
    actorEmail: row.actorEmail,
    rawAction: row.rawAction,
    count: toCount(row.count),
  }));
}

export async function groupUnifiedActivityByRawAction(
  db: QueryableDb,
  args: { where?: UnifiedWhere; take?: number } = {},
): Promise<UnifiedRawActionGroupRow[]> {
  const limit = typeof args.take === "number" ? Prisma.sql`LIMIT ${args.take}` : Prisma.empty;
  const rows = await db.$queryRaw<Array<{ rawAction: string; count: bigint | number }>>(Prisma.sql`
    ${UNIFIED_ACTIVITY_CTE}
    SELECT "rawAction", COUNT(*)::bigint AS count
    FROM unified_activity
    ${whereSql(args.where)}
    GROUP BY "rawAction"
    ORDER BY COUNT(*) DESC, "rawAction" ASC
    ${limit}
  `);
  return rows.map((row) => ({ rawAction: row.rawAction, count: toCount(row.count) }));
}

export async function getLastUnifiedActivityByEmail(
  db: QueryableDb,
  args: { emails: readonly string[]; rawActionIn: readonly string[] },
): Promise<Array<{ email: string; lastActivity: string }>> {
  const rows = await db.$queryRaw<Array<{ email: string; lastActivity: Date | string }>>(Prisma.sql`
    ${UNIFIED_ACTIVITY_CTE}
    SELECT LOWER("userEmail") AS email, MAX("createdAt") AS "lastActivity"
    FROM unified_activity
    ${whereSql({ userEmails: args.emails, rawActionIn: args.rawActionIn, userEmailNotNull: true })}
    GROUP BY LOWER("userEmail")
  `);
  return rows.map((row) => ({ email: row.email, lastActivity: toIso(row.lastActivity) }));
}

/**
 * Like getLastUnifiedActivityByEmail but aggregates across ALL users (no email
 * filter). Used by the /users directory "Last active" column (G1 fix).
 */
export async function getAllLastUnifiedActivityByEmail(
  db: QueryableDb,
  args: { rawActionIn: readonly string[] },
): Promise<Array<{ email: string; lastActivity: string }>> {
  const rows = await db.$queryRaw<Array<{ email: string; lastActivity: Date | string }>>(Prisma.sql`
    ${UNIFIED_ACTIVITY_CTE}
    SELECT LOWER("userEmail") AS email, MAX("createdAt") AS "lastActivity"
    FROM unified_activity
    ${whereSql({ rawActionIn: args.rawActionIn, userEmailNotNull: true })}
    GROUP BY LOWER("userEmail")
  `);
  return rows.map((row) => ({ email: row.email, lastActivity: toIso(row.lastActivity) }));
}

export async function listUsersByLastUnifiedActivity(
  db: QueryableDb,
  args: {
    rawActionIn: readonly string[];
    order: "asc" | "desc";
    cursor?: { lastActivity: Date; email: string };
    limit: number;
  },
): Promise<Array<{ email: string; lastActivity: string }>> {
  const orderDir = Prisma.raw(args.order === "desc" ? "DESC" : "ASC");
  const having =
    args.cursor
      ? args.order === "desc"
        ? Prisma.sql`HAVING MAX("createdAt") < ${args.cursor.lastActivity} OR (MAX("createdAt") = ${args.cursor.lastActivity} AND LOWER("userEmail") > ${args.cursor.email.toLowerCase()})`
        : Prisma.sql`HAVING MAX("createdAt") > ${args.cursor.lastActivity} OR (MAX("createdAt") = ${args.cursor.lastActivity} AND LOWER("userEmail") > ${args.cursor.email.toLowerCase()})`
      : Prisma.empty;

  const rows = await db.$queryRaw<Array<{ email: string; lastActivity: Date | string }>>(Prisma.sql`
    ${UNIFIED_ACTIVITY_CTE}
    SELECT LOWER("userEmail") AS email, MAX("createdAt") AS "lastActivity"
    FROM unified_activity
    WHERE "userEmail" IS NOT NULL
      AND "rawAction" = ANY(${[...args.rawActionIn]})
    GROUP BY LOWER("userEmail")
    ${having}
    ORDER BY MAX("createdAt") ${orderDir} NULLS LAST, LOWER("userEmail") ASC
    LIMIT ${args.limit}
  `);

  return rows.map((row) => ({ email: row.email, lastActivity: toIso(row.lastActivity) }));
}

export interface UnifiedActivityCoverageStats {
  totalRows: number;
  attributedRows: number;
  invitationRows: number;
  unknownActors: Array<{ autodeskId: string; rows: number }>;
  unknownActionGroups: Array<{ autodeskId: string; rawAction: string; rows: number }>;
  unknownServiceGroups: Array<{ service: string | null; rows: number }>;
  resolvedActors: Array<{ userEmail: string | null; rows: number }>;
}

export async function getUnifiedActivityCoverageStats(
  db: QueryableDb,
  invitationActions: readonly string[],
): Promise<UnifiedActivityCoverageStats> {
  const [
    totalRows,
    attributedRows,
    invitationRows,
    unknownActors,
    unknownActionGroups,
    unknownServiceGroups,
    resolvedActors,
  ] = await Promise.all([
    countUnifiedActivityRows(db),
    countUnifiedActivityRows(db, { userEmailNotNull: true }),
    db.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
      ${UNIFIED_ACTIVITY_CTE}
      SELECT COUNT(*)::bigint AS count
      FROM unified_activity
      WHERE "rawAction" = ANY(${[...invitationActions]})
    `),
    db.$queryRaw<Array<{ autodeskId: string; rows: bigint | number }>>(Prisma.sql`
      ${UNIFIED_ACTIVITY_CTE}
      SELECT "autodeskId", COUNT(*)::bigint AS rows
      FROM unified_activity
      WHERE "userEmail" IS NULL
      GROUP BY "autodeskId"
    `),
    db.$queryRaw<Array<{ autodeskId: string; rawAction: string; rows: bigint | number }>>(Prisma.sql`
      ${UNIFIED_ACTIVITY_CTE}
      SELECT "autodeskId", "rawAction", COUNT(*)::bigint AS rows
      FROM unified_activity
      WHERE "userEmail" IS NULL
      GROUP BY "autodeskId", "rawAction"
    `),
    db.$queryRaw<Array<{ service: string | null; rows: bigint | number }>>(Prisma.sql`
      ${UNIFIED_ACTIVITY_CTE}
      SELECT service, COUNT(*)::bigint AS rows
      FROM unified_activity
      WHERE "userEmail" IS NULL
      GROUP BY service
    `),
    db.$queryRaw<Array<{ userEmail: string | null; rows: bigint | number }>>(Prisma.sql`
      ${UNIFIED_ACTIVITY_CTE}
      SELECT "userEmail", COUNT(*)::bigint AS rows
      FROM unified_activity
      WHERE "userEmail" IS NOT NULL
      GROUP BY "userEmail"
    `),
  ]);

  return {
    totalRows,
    attributedRows,
    invitationRows: toCount(invitationRows[0]?.count ?? 0),
    unknownActors: unknownActors.map((row) => ({ autodeskId: row.autodeskId, rows: toCount(row.rows) })),
    unknownActionGroups: unknownActionGroups.map((row) => ({
      autodeskId: row.autodeskId,
      rawAction: row.rawAction,
      rows: toCount(row.rows),
    })),
    unknownServiceGroups: unknownServiceGroups.map((row) => ({
      service: row.service,
      rows: toCount(row.rows),
    })),
    resolvedActors: resolvedActors.map((row) => ({ userEmail: row.userEmail, rows: toCount(row.rows) })),
  };
}

export interface UnifiedCoverageMatrixCell {
  projectId: string;
  projectName: string;
  service: string;
  day: Date;
  rows: number;
  actors: number;
  attributedRows: number;
  firstActivityAt: Date | null;
  lastActivityAt: Date | null;
}

export async function getUnifiedCoverageMatrixCells(
  db: QueryableDb,
  args: { from: Date; exclusiveTo: Date },
): Promise<UnifiedCoverageMatrixCell[]> {
  return db.$queryRaw<UnifiedCoverageMatrixCell[]>(Prisma.sql`
    ${UNIFIED_ACTIVITY_CTE}
    SELECT
      COALESCE(NULLIF(u."projectId", ''), '(admin)') AS "projectId",
      COALESCE(p.name, CASE WHEN NULLIF(u."projectId", '') IS NULL THEN 'Admin / Account Activity' ELSE u."projectId" END) AS "projectName",
      COALESCE(NULLIF(LOWER(u.service), ''), 'unknown') AS service,
      date_trunc('day', u."createdAt") AS day,
      COUNT(*)::int AS rows,
      COUNT(DISTINCT u."autodeskId")::int AS actors,
      COUNT(u."userEmail")::int AS "attributedRows",
      MIN(u."createdAt") AS "firstActivityAt",
      MAX(u."createdAt") AS "lastActivityAt"
    FROM unified_activity u
    LEFT JOIN "AccDcProject" p ON p.id = NULLIF(u."projectId", '')
    WHERE u."createdAt" >= ${args.from}
      AND u."createdAt" < ${args.exclusiveTo}
    GROUP BY
      COALESCE(NULLIF(u."projectId", ''), '(admin)'),
      COALESCE(p.name, CASE WHEN NULLIF(u."projectId", '') IS NULL THEN 'Admin / Account Activity' ELSE u."projectId" END),
      COALESCE(NULLIF(LOWER(u.service), ''), 'unknown'),
      date_trunc('day', u."createdAt")
    ORDER BY rows DESC
  `);
}

export async function getProjectIdsWithUnifiedActivity(
  db: QueryableDb,
): Promise<Array<{ projectId: string }>> {
  return db.$queryRaw<Array<{ projectId: string }>>(Prisma.sql`
    ${UNIFIED_ACTIVITY_CTE}
    SELECT "projectId"
    FROM unified_activity
    WHERE "projectId" IS NOT NULL
      AND "projectId" <> ''
    GROUP BY "projectId"
  `);
}

export async function listUnifiedActiveEmails(
  db: QueryableDb,
  args: { emails: readonly string[]; range: { start: Date; end: Date } },
): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ userEmail: string }>>(Prisma.sql`
    ${UNIFIED_ACTIVITY_CTE}
    SELECT LOWER("userEmail") AS "userEmail"
    FROM unified_activity
    ${whereSql({
      userEmails: args.emails,
      userEmailNotNull: true,
      createdAt: { gte: args.range.start, lte: args.range.end },
    })}
    GROUP BY LOWER("userEmail")
  `);
  return rows.map((row) => row.userEmail);
}

export async function countLegacyStaleMembersByUnifiedActivity(
  db: QueryableDb,
  range: { start: Date; end: Date },
): Promise<number> {
  const rows = await db.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
    ${UNIFIED_ACTIVITY_CTE}
    SELECT COUNT(*)::bigint AS count
    FROM "AccMemberCache" mc
    WHERE NOT EXISTS (
      SELECT 1
      FROM unified_activity u
      WHERE LOWER(u."userEmail") = LOWER(mc.email)
        AND u."createdAt" >= ${range.start}
        AND u."createdAt" <= ${range.end}
    )
  `);
  return toCount(rows[0]?.count ?? 0);
}
