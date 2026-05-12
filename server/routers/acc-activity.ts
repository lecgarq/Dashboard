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
  type ActivityCategory,
} from "@/lib/acc/activityCategories";

const CATEGORY_ENUM = z.enum([
  "view",
  "upload",
  "edit",
  "delete",
  "memberEvent",
  "projectEvent",
  "other",
]);

export const accActivityRouter = router({
  /**
   * Lightweight coverage signal for the Users data strip.
   * This answers "do activity logs exist at all?" separately from the
   * invitation-only audit widget.
   */
  getCoverage: protectedProcedure.query(async ({ ctx }) => {
    const [totalRows, attributedRows, invitationRows] = await Promise.all([
      ctx.db.accActivity.count(),
      ctx.db.accActivity.count({ where: { userEmail: { not: null } } }),
      ctx.db.accActivity.count({
        where: { rawAction: { in: [...INVITATION_ACTIONS] } },
      }),
    ]);

    return {
      totalRows,
      attributedRows,
      invitationRows,
    };
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
        ctx.db.accActivity.findFirst({
          where: {
            userEmail: email,
            rawAction: { in: [...CATEGORY_TO_RAW_ACTIONS[cat]] },
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });

      const [v, u, e, d] = await Promise.all([
        lastFor("view"),
        lastFor("upload"),
        lastFor("edit"),
        lastFor("delete"),
      ]);

      return {
        lastView: v?.createdAt ?? null,
        lastUpload: u?.createdAt ?? null,
        lastEdit: e?.createdAt ?? null,
        lastDelete: d?.createdAt ?? null,
      };
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
      let rawActionFilter: { in: string[] } | { notIn: string[] } | undefined;
      if (input.categories && input.categories.length > 0) {
        const knownCats = input.categories.filter(
          (c): c is Exclude<ActivityCategory, "other"> => c !== "other"
        );
        const hasOther = input.categories.includes("other");
        if (knownCats.length > 0 && !hasOther) {
          const raws = knownCats.flatMap((c) => [...CATEGORY_TO_RAW_ACTIONS[c]]);
          rawActionFilter = { in: raws };
        } else if (hasOther && knownCats.length === 0) {
          // Only "other" — exclude every known raw action.
          const allKnown = (
            ["view", "upload", "edit", "delete", "memberEvent", "projectEvent"] as const
          ).flatMap((c) => [...CATEGORY_TO_RAW_ACTIONS[c]]);
          rawActionFilter = { notIn: allKnown };
        }
        // Otherwise (mix of known + other) — no filter; include everything.
      }

      const where: Record<string, unknown> = { userEmail: email };
      if (rawActionFilter) where.rawAction = rawActionFilter;
      if (input.projectId) where.projectId = input.projectId;
      if (input.dateRange) {
        where.createdAt = { gte: input.dateRange.from, lte: input.dateRange.to };
      }
      if (input.cursor) {
        // (createdAt, id) < cursor — Prisma doesn't support compound row comparison
        // directly, so we OR it: createdAt < cursor.createdAt OR (createdAt = cursor.createdAt AND id < cursor.id).
        const cursorOr = [
          { createdAt: { lt: input.cursor.createdAt } },
          {
            AND: [
              { createdAt: input.cursor.createdAt },
              { id: { lt: input.cursor.id } },
            ],
          },
        ];
        // Preserve existing createdAt range (if any) via AND-merge.
        const existing = where.createdAt;
        delete where.createdAt;
        where.AND = [
          ...(existing ? [{ createdAt: existing }] : []),
          { OR: cursorOr },
        ];
      }

      const rows = await ctx.db.accActivity.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
