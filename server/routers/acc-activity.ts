/**
 * accActivity tRPC router (ACTV-03, ACTV-04, ACTV-05).
 *
 * Three procedures:
 *   - getFileActivityForUser: lazy per-user file-activity timestamps (hover-prefetch + side-panel open).
 *   - listForUser: cursor-paginated drill-down for DashboardSidePanel.
 *   - listInvitations: WHO-added-WHOM list for RecentlyAdded widget + side-panel.
 *
 * All procedures are protectedProcedure (mirrors accSync). All emails are
 * lowercased server-side as defense-in-depth (we already lowercase on ingest).
 */

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  CATEGORY_TO_RAW_ACTIONS,
  INVITATION_ACTIONS,
  classifyChangeStream,
  type ActivityCategory,
} from "@/lib/acc/activityCategories";
import {
  classifyActivityActor,
  summarizeActorClassifications,
} from "@/lib/acc/activityActorClassification";
import {
  addUtcDays,
  buildActivityCoverageMatrix,
  endOfUtcDay,
  startOfUtcDay,
} from "@/lib/acc/activityCoverageMatrix";
import {
  countUnifiedActivityRows,
  findUnifiedActivityDate,
  getAllLastUnifiedActivityByEmail,
  getLastUnifiedActivityByEmail,
  getUnifiedActivityCoverageStats,
  getUnifiedCoverageMatrixCells,
  listUnifiedActivityRows,
  listUsersByLastUnifiedActivity,
} from "@/lib/server/unifiedActivitySource";

/**
 * Phase 09 LIST-03: file-action raw strings used by the BATCH and SORT procedures.
 *
 * Single source of truth derived from `CATEGORY_TO_RAW_ACTIONS` so any future
 * additions to the 4 file buckets (view/upload/edit/delete) automatically flow
 * into both `getLastFileActivityBatch` (display) and `usersOrderedByLastFileActivity`
 * (sort). DO NOT inline another array literal — Pitfall 6 (sort/display drift).
 */
const FILE_RAW_ACTIONS: readonly string[] = [
  ...CATEGORY_TO_RAW_ACTIONS.view,
  ...CATEGORY_TO_RAW_ACTIONS.upload,
  ...CATEGORY_TO_RAW_ACTIONS.edit,
  ...CATEGORY_TO_RAW_ACTIONS.delete,
];
import {
  windowToDateRange,
  pickBinSize,
  generateBuckets,
  bucketStart,
} from "@/lib/acc/timelineBucketing";
import { pickHeadlineEvent, type RankableEvent } from "@/lib/acc/headlineEventPicker";
import { getCachedLastFileActivityByEmailAll } from "@/lib/server/acc-hot-cache";

const CATEGORY_ENUM = z.enum([
  "view",
  "upload",
  "edit",
  "delete",
  "memberEvent",
  "projectEvent",
  "other",
]);

const COVERAGE_MATRIX_INPUT = z
  .object({
    from: z.date().optional(),
    to: z.date().optional(),
    windowDays: z.number().int().min(1).max(730).default(30),
    projectLimit: z.number().int().min(1).max(500).default(75),
    missingProjectLimit: z.number().int().min(1).max(500).default(75),
  })
  .optional();

export const accActivityRouter = router({
  /**
   * Lightweight coverage signal for the Users data strip.
   * This answers "do activity logs exist at all?" separately from the
   * invitation-only audit widget.
   */
  getCoverage: protectedProcedure.query(async ({ ctx }) => {
    const {
      totalRows,
      attributedRows,
      invitationRows,
      unknownActors,
      unknownActionGroups,
      unknownServiceGroups,
      resolvedActors,
    } = await getUnifiedActivityCoverageStats(ctx.db, INVITATION_ACTIONS);
    const unattributedRows = totalRows - attributedRows;
    const rawActionsByActor = new Map<string, string[]>();
    for (const row of unknownActionGroups) {
      const actions = rawActionsByActor.get(row.autodeskId) ?? [];
      actions.push(row.rawAction);
      rawActionsByActor.set(row.autodeskId, actions);
    }
    for (const actions of rawActionsByActor.values()) actions.sort();

    const unknownActorClassifications = unknownActors.map((actor) => {
      const rawActions = rawActionsByActor.get(actor.autodeskId) ?? [];
      return {
        autodeskId: actor.autodeskId,
        rows: actor.rows,
        rawActions,
        classification: classifyActivityActor({
          autodeskId: actor.autodeskId,
          userEmail: null,
          rawActions,
        }),
      };
    });
    const actorClassifications = summarizeActorClassifications([
      ...resolvedActors.map((actor) => ({
        classification: classifyActivityActor({
          autodeskId: null,
          userEmail: actor.userEmail,
          rawActions: [],
        }),
        rows: actor.rows,
        actorKey: actor.userEmail ?? "(unknown-email)",
      })),
      ...unknownActorClassifications.map((actor) => ({
        classification: actor.classification,
        rows: actor.rows,
        actorKey: actor.autodeskId,
      })),
    ]);
    const unknownRowsByService = unknownServiceGroups
      .map((row) => ({
        service: row.service ?? "(none)",
        rows: row.rows,
      }))
      .sort((a, b) => b.rows - a.rows || a.service.localeCompare(b.service));
    const topUnknownActors = unknownActorClassifications
      .sort((a, b) => b.rows - a.rows || a.autodeskId.localeCompare(b.autodeskId))
      .slice(0, 10);

    return {
      totalRows,
      attributedRows,
      unattributedRows,
      attributionRate: totalRows > 0 ? attributedRows / totalRows : 0,
      distinctUnknownActors: unknownActors.length,
      actorClassifications,
      unknownRowsByService,
      topUnknownActors,
      invitationRows,
    };
  }),

  /**
   * No-quota coverage matrix for future dashboards:
   * Unified ACCDS + DC-backfill rows grouped by project x UTC day x service,
   * plus project inventory gaps. This reads only local DB state.
   */
  getCoverageMatrix: protectedProcedure
    .input(COVERAGE_MATRIX_INPUT)
    .query(async ({ ctx, input }) => {
      const latest = await findUnifiedActivityDate(ctx.db, { order: "desc" });
      const to = endOfUtcDay(input?.to ?? latest ?? new Date());
      const from = startOfUtcDay(
        input?.from ?? addUtcDays(to, -(input?.windowDays ?? 30) + 1),
      );
      const exclusiveTo = addUtcDays(to, 1);

      const [projects, cells] = await Promise.all([
        ctx.db.accDcProject.findMany({
          select: { id: true, name: true, status: true },
          orderBy: { name: "asc" },
        }),
        getUnifiedCoverageMatrixCells(ctx.db, { from, exclusiveTo }),
      ]);

      return buildActivityCoverageMatrix({
        from,
        to,
        projects,
        cells,
        projectLimit: input?.projectLimit,
        missingProjectLimit: input?.missingProjectLimit,
      });
    }),

  /**
   * ACTV-03: lazy per-user file-activity timestamps.
   *
   * Strategy: 4 parallel findFirst queries, one per file category, each picking
   * the most recent matching row via the (userEmail, createdAt DESC) index.
   * Faster + more reliable than the take:200 approach because we don't risk a
   * category being shadowed by 200+ rows of another category.
   */
  getFileActivityForUser: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();

      const lastFor = (cat: "view" | "upload" | "edit" | "delete") =>
        findUnifiedActivityDate(ctx.db, {
          where: {
            userEmail: email,
            rawActionIn: [...CATEGORY_TO_RAW_ACTIONS[cat]],
          },
          order: "desc",
        });

      const [v, u, e, d] = await Promise.all([
        lastFor("view"),
        lastFor("upload"),
        lastFor("edit"),
        lastFor("delete"),
      ]);

      return {
        lastView: v,
        lastUpload: u,
        lastEdit: e,
        lastDelete: d,
      };
    }),

  /**
   * Phase 09 LIST-03 display path: aggregated last-file-activity timestamp per email
   * for a batch of visible rows. Feeds the lazy IntersectionObserver column in
   * `UsersDirectoryClient.tsx`.
   *
   * Returns `Record<email, ISO string | null>` — every input email is guaranteed
   * to be a key in the response (missing rows → `null`) so the UI can switch
   * cleanly on `undefined` (loading) vs `null` (no activity).
   *
   * Cap: 200 emails per call (Pitfall 2 defense — server enforces what the
   * IntersectionObserver hook should already respect).
   */
  getLastFileActivityBatch: protectedProcedure
    .input(z.object({ emails: z.array(z.string().email()).max(200) }))
    .query(async ({ ctx, input }) => {
      const lowered = input.emails.map((e) => e.toLowerCase());
      const out: Record<string, string | null> = {};
      for (const e of lowered) out[e] = null;
      if (lowered.length === 0) return out;

      const rows = await getLastUnifiedActivityByEmail(ctx.db, {
        emails: lowered,
        rawActionIn: [...FILE_RAW_ACTIONS],
      });
      for (const r of rows) {
        out[r.email.toLowerCase()] = r.lastActivity;
      }
      return out;
    }),

  /**
   * G1 fix: per-user latest file-activity timestamp for ALL users in one grouped
   * query. Feeds the /users "Last active" column without the 200-email cap of
   * getLastFileActivityBatch (which was designed for IntersectionObserver batches).
   *
   * Returns Record<email_lowercase, ISO string | null>:
   *   - key present + string  → user has at least one file-activity event
   *   - key present + null    → (not emitted; only present emails are returned)
   * Consumers distinguish loading (undefined result) from empty (empty object).
   *
   * Uses the same FILE_RAW_ACTIONS constant as getLastFileActivityBatch so
   * sort/display semantics stay in sync (Pitfall 6 guard).
   */
  lastFileActivityByEmailAll: protectedProcedure.query(async ({ ctx }) => {
    // Use the hot-cache wrapper so the heavy GROUP BY over ~623k unified_activity
    // rows is computed once per ingest cycle and served from memory on every
    // subsequent SSR prefetch (G2 fix: eliminates the cold query on every load).
    const rows = await getCachedLastFileActivityByEmailAll(ctx.db);
    const out: Record<string, string | null> = {};
    for (const r of rows) {
      out[r.email.toLowerCase()] = r.lastActivity;
    }
    return out;
  }),

  /**
   * Phase 09 LIST-03 sort path: server-side ordered list of users by last
   * file-activity timestamp. Paginated via a compound `(MAX(createdAt), email)`
   * cursor so writes during pagination don't cause row skips/dupes
   * (RESEARCH Open Question 2).
   *
   * NULLS LAST regardless of direction — users with no file activity appear at
   * the tail in both ASC and DESC orderings (CONTEXT discretion lock; empty rows
   * always last). NOTE: this procedure only returns users with ≥1 file-activity
   * row. Consumer plan 09-04 is responsible for appending the zero-activity
   * `BulkAccUser` remainder in stable secondary order (RESEARCH Open Question 3).
   *
   * Kept INTENTIONALLY SEPARATE from `getLastFileActivityBatch` (Pitfall 6:
   * sharing one procedure for both sort + display doubles server load).
   */
  usersOrderedByLastFileActivity: protectedProcedure
    .input(
      // NOTE (09-04 Rule 3 deviation): the input field is named `order` rather
      // than `direction` because `@trpc/react-query` reserves the key
      // `direction` for bidirectional infinite-query pagination (see
      // `ReservedInfiniteQueryKeys` in @trpc/react-query). Using `direction`
      // here makes the procedure unusable from `useInfiniteQuery` callers.
      z.object({
        order: z.enum(["asc", "desc"]).default("desc"),
        cursor: z
          .object({ lastActivity: z.string(), email: z.string() })
          .optional(),
        limit: z.number().int().min(1).max(500).default(200),
      }),
    )
    .query(async ({ ctx, input }) => {
      const fileActions = [...FILE_RAW_ACTIONS];
      const direction = input.order;
      const rows = await listUsersByLastUnifiedActivity(ctx.db, {
        rawActionIn: fileActions,
        order: direction,
        cursor: input.cursor
          ? { lastActivity: new Date(input.cursor.lastActivity), email: input.cursor.email }
          : undefined,
        limit: input.limit,
      });

      let nextCursor: { lastActivity: string; email: string } | null = null;
      if (rows.length === input.limit) {
        const last = rows[rows.length - 1];
        // Only emit a cursor when the tail row has a non-null timestamp; once we
        // hit NULLS LAST tail the next page would be empty anyway.
        if (last.lastActivity) {
          nextCursor = { lastActivity: last.lastActivity, email: last.email };
        }
      }
      return { rows, nextCursor };
    }),

  /**
   * ACTV-05: cursor-paginated drill-down for the side panel.
   *
   * Cursor pagination uses (createdAt, id) as the composite key — stable across
   * inserts because we ORDER BY createdAt DESC, id DESC. The id tiebreak handles
   * the case where multiple rows share a createdAt millisecond.
   */
  listForUser: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        categories: z.array(CATEGORY_ENUM).optional(),
        projectId: z.string().optional(),
        dateRange: z
          .object({ from: z.date(), to: z.date() })
          .optional(),
        cursor: z
          .object({ createdAt: z.date(), id: z.string() })
          .optional(),
        limit: z.number().min(1).max(50).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();

      // Build rawAction IN-list from categories. "other" is the catch-all
      // (anything NOT in any known category's raw set) so it's handled by
      // either inclusion-by-category-list (when alongside other cats) or by
      // a NOT IN filter when alone. Keep semantics simple: if categories is
      // provided AND only "other" is selected, return rows with rawAction NOT
      // IN any known category; otherwise build the inclusion list.
      let rawActionIn: string[] | undefined;
      let rawActionNotIn: string[] | undefined;
      if (input.categories && input.categories.length > 0) {
        const knownCats = input.categories.filter(
          (c): c is Exclude<ActivityCategory, "other"> => c !== "other"
        );
        const hasOther = input.categories.includes("other");
        if (knownCats.length > 0 && !hasOther) {
          rawActionIn = knownCats.flatMap((c) => [...CATEGORY_TO_RAW_ACTIONS[c]]);
        } else if (hasOther && knownCats.length === 0) {
          // Only "other" — exclude every known raw action.
          const allKnown = (
            ["view", "upload", "edit", "delete", "memberEvent", "projectEvent"] as const
          ).flatMap((c) => [...CATEGORY_TO_RAW_ACTIONS[c]]);
          rawActionNotIn = allKnown;
        }
        // Otherwise (mix of known + other) — no filter; include everything.
      }

      const rows = await listUnifiedActivityRows(ctx.db, {
        where: {
          userEmail: email,
          rawActionIn,
          rawActionNotIn,
          projectId: input.projectId,
          createdAt: input.dateRange
            ? { gte: input.dateRange.from, lte: input.dateRange.to }
            : undefined,
          cursorBefore: input.cursor,
        },
        take: input.limit + 1,
      });

      let nextCursor: { createdAt: Date; id: string } | null = null;
      if (rows.length > input.limit) {
        const last = rows[input.limit - 1];
        nextCursor = { createdAt: last.createdAt, id: last.id };
        rows.length = input.limit;
      }

      return { rows, nextCursor };
    }),

  /**
   * ACTV-04 backend: invitation rows with batched attribution lookup.
   *
   * Filter pill ("Filtered by Jane") sets `inviterFilter` to Jane's autodeskId
   * AND relaxes the time window per CONTEXT.md.
   *
   * Re-invited users surface as { primaryInviter, otherInviters[] } per CONTEXT.md
   * "+N others" requirement.
   */
  listInvitations: protectedProcedure
    .input(
      z.object({
        windowDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
        inviterFilter: z.string().optional(),
        limit: z.number().min(1).max(200).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        rawAction: { in: [...INVITATION_ACTIONS] },
      };
      // When filtering by inviter, the time window is relaxed (CONTEXT.md).
      if (input.inviterFilter) {
        where.autodeskId = input.inviterFilter;
      } else {
        const since = new Date(Date.now() - input.windowDays * 24 * 60 * 60 * 1000);
        where.createdAt = { gte: since };
      }

      const rows = await ctx.db.accActivity.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });

      if (rows.length === 0) {
        return { invitations: [] as InvitationGroup[] };
      }

      // Parse invitee emails + collect inviter autodeskIds.
      const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/g;
      type Parsed = {
        activityId: string;
        rawAction: string;
        createdAt: Date;
        projectId: string | null;
        inviterAutodeskId: string;
        inviteeEmail: string | null;
        details: string | null;
      };
      const parsed: Parsed[] = rows.map((r) => {
        const matches = r.details?.match(EMAIL_RE) ?? [];
        return {
          activityId: r.id,
          rawAction: r.rawAction,
          createdAt: r.createdAt,
          projectId: r.projectId,
          inviterAutodeskId: r.autodeskId,
          inviteeEmail: matches[0]?.toLowerCase() ?? null,
          details: r.details,
        };
      });

      // Batched member lookups: inviter (by autodeskId) + invitee (by email).
      const inviterIds = Array.from(new Set(parsed.map((p) => p.inviterAutodeskId)));
      const inviteeEmails = Array.from(
        new Set(parsed.map((p) => p.inviteeEmail).filter((e): e is string => !!e))
      );

      const [inviterMembers, inviteeMembers] = await Promise.all([
        inviterIds.length > 0
          ? ctx.db.accProjectMember.findMany({
              where: { autodeskId: { in: inviterIds } },
              select: { autodeskId: true, name: true, email: true },
            })
          : Promise.resolve([] as Array<{ autodeskId: string; name: string; email: string }>),
        inviteeEmails.length > 0
          ? ctx.db.accProjectMember.findMany({
              where: { email: { in: inviteeEmails, mode: "insensitive" } },
              select: { email: true, name: true, autodeskId: true },
            })
          : Promise.resolve(
              [] as Array<{ email: string; name: string; autodeskId: string }>
            ),
      ]);

      // Build lookup maps; collapse duplicate-project rows (same autodeskId/email
      // appears in N project rows) by keeping the first encountered.
      const inviterByAdId = new Map<string, { name: string; email: string }>();
      for (const m of inviterMembers) {
        if (!inviterByAdId.has(m.autodeskId)) {
          inviterByAdId.set(m.autodeskId, { name: m.name, email: m.email });
        }
      }
      const inviteeByEmail = new Map<string, { name: string; autodeskId: string }>();
      for (const m of inviteeMembers) {
        const key = m.email.toLowerCase();
        if (!inviteeByEmail.has(key)) {
          inviteeByEmail.set(key, { name: m.name, autodeskId: m.autodeskId });
        }
      }

      // Group multi-inviter cases by invitee email. Within a group, primary =
      // most recent (rows already DESC sorted), others = the rest.
      const groups = new Map<string, InvitationGroup>();
      // Rows without a parseable invitee email fall back to per-activity groups
      // keyed by activityId so they still surface (the UI shows them as "Unknown invitee").
      for (const p of parsed) {
        const key = p.inviteeEmail ?? `__no-email__:${p.activityId}`;
        const inviter = inviterByAdId.get(p.inviterAutodeskId) ?? null;
        const invitee = p.inviteeEmail ? inviteeByEmail.get(p.inviteeEmail) ?? null : null;

        const row: InvitationRow = {
          activityId: p.activityId,
          createdAt: p.createdAt,
          projectId: p.projectId,
          rawAction: p.rawAction,
          inviterAutodeskId: p.inviterAutodeskId,
          inviterName: inviter?.name ?? null,
          inviterEmail: inviter?.email ?? null,
          inviteeEmail: p.inviteeEmail,
          inviteeName: invitee?.name ?? null,
          inviteeAutodeskId: invitee?.autodeskId ?? null,
        };

        const existing = groups.get(key);
        if (!existing) {
          groups.set(key, {
            inviteeEmail: p.inviteeEmail,
            inviteeName: invitee?.name ?? null,
            primary: row,
            others: [],
          });
        } else {
          existing.others.push(row);
        }
      }

      // Preserve the original DESC-by-createdAt ordering of primary rows.
      const invitations = Array.from(groups.values()).sort(
        (a, b) => b.primary.createdAt.getTime() - a.primary.createdAt.getTime()
      );

      return { invitations };
    }),

  /**
   * Returns time-binned counts of access-change events for the hero chart.
   * Classifies each unified activity row into one of four streams based on rawAction
   * + details.newRole, then bins into day/week/month buckets.
   */
  getTimeline: protectedProcedure
    .input(
      z.object({
        window: z.enum(["30d", "90d", "1y", "all"]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { window } = input;
      const range = windowToDateRange(window);
      const bin = pickBinSize(window);

      const rows = await listUnifiedActivityRows(ctx.db, {
        where: { createdAt: { gte: range.start, lte: range.end } },
      });

      const buckets = generateBuckets(range.start, range.end, bin);
      const bucketMap = new Map<string, { membership: number; permission: number; project: number; admin: number }>();
      for (const b of buckets) bucketMap.set(b.toISOString(), { membership: 0, permission: 0, project: 0, admin: 0 });

      for (const row of rows) {
        const stream = classifyChangeStream(row);
        if (!stream) continue;
        const key = bucketStart(row.createdAt, bin).toISOString();
        const slot = bucketMap.get(key);
        if (slot) slot[stream]++;
      }

      const points = Array.from(bucketMap.entries()).map(([bucket, counts]) => ({
        bucket,
        ...counts,
      }));
      points.sort((a, b) => a.bucket.localeCompare(b.bucket));

      const earliest = await findUnifiedActivityDate(ctx.db, { order: "asc" });

      return {
        points,
        bin,
        dataEarliestEvent: earliest?.toISOString() ?? null,
      };
    }),

  /**
   * Returns the single highest-impact event for a given stream in the time window,
   * formatted as a HeadlineEvent. Used by the ChangeStreamCard drill-downs.
   */
  getHeadlineEvent: protectedProcedure
    .input(
      z.object({
        window: z.enum(["30d", "90d", "1y", "all"]),
        stream: z.enum(["membership", "permission", "project", "admin"]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const range = windowToDateRange(input.window);

      const rows = await ctx.db.accActivity.findMany({
        where: { createdAt: { gte: range.start, lte: range.end } },
        select: {
          rawAction: true,
          createdAt: true,
          details: true,
          sourceFile: true,
          autodeskId: true,
          userEmail: true,
          projectId: true,
        },
      });

      const streamRows = rows.filter((r) => classifyChangeStream(r) === input.stream);
      const rankable: RankableEvent[] = streamRows.map((r) => {
        const d = (r.details ?? {}) as Record<string, unknown>;
        return {
          rawAction: r.rawAction,
          newRole: ((d.newRole ?? d.new_role) as string | null) ?? null,
          occurredAt: r.createdAt,
          subjectEmail: r.userEmail,
          subjectAutodeskId: r.autodeskId,
          projectId: r.projectId || null,
        };
      });

      return pickHeadlineEvent(rankable, input.stream, range.start, range.end);
    }),
});

export interface InvitationRow {
  activityId: string;
  createdAt: Date;
  projectId: string | null;
  rawAction: string;
  inviterAutodeskId: string;
  inviterName: string | null;
  inviterEmail: string | null;
  inviteeEmail: string | null;
  inviteeName: string | null;
  inviteeAutodeskId: string | null;
}

export interface InvitationGroup {
  inviteeEmail: string | null;
  inviteeName: string | null;
  primary: InvitationRow;
  others: InvitationRow[];
}
