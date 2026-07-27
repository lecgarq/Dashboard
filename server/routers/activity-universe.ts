/**
 * activityUniverse tRPC router — v2.7 Phase 39 (ACT-04).
 *
 * On-demand detail for activity-universe nodes. The binary payload carries no
 * per-row id string, so `eventDetail` resolves a payload ROW INDEX to its id
 * via the artifact meta's idAnchors (every 10,000th id recorded at build
 * time) + a ≤10k OFFSET walk on the AccActivityEmbedding PK index — the
 * anchors are build-consistent with the payload ordering by construction, so
 * table drift after a build is DETECTED (stale flag), never silently wrong.
 *
 * Id spaces (per compute_activity_embeddings.py, NOT the stale "a:"/"d:"
 * schema comment): "accds:"+accdsActivityId → AccActivityAccds; plain cuid →
 * AccActivity (DC backfill/admin rows).
 */

import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import {
  anchorFor,
  readActivityUniverseMeta,
} from "@/lib/server/activityUniversePayload";

export interface ActivityEventDetail {
  stale: false;
  id: string;
  source: "accds" | "dc";
  verb: string;
  objectType: string | null;
  objectName: string | null;
  folderName: string | null;
  projectId: string | null;
  projectName: string | null;
  authorEmail: string | null;
  authorName: string | null;
  createdAt: string; // exact ISO timestamp
}

export type ActivityEventDetailResult = ActivityEventDetail | { stale: true; reason: string };

export const activityUniverseRouter = router({
  /** GUID → display name for the ~957 projects in the corpus (hover tooltip source). */
  projectNames: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.accProject.findMany({ select: { id: true, name: true } });
    const out: Record<string, string> = {};
    for (const r of rows) out[r.id] = r.name;
    return out;
  }),

  /**
   * Full story of one activity event by payload row index. `expectedProjectGuid`
   * is the client's resident dict value for the row — a mismatch means the
   * table drifted since the artifact build (indices shifted), so we answer
   * `stale` instead of a confidently wrong event.
   */
  eventDetail: adminProcedure
    .input(
      z.object({
        index: z.number().int().nonnegative(),
        expectedProjectGuid: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<ActivityEventDetailResult> => {
      const meta = readActivityUniverseMeta();
      if (!meta?.idAnchors?.length) {
        return { stale: true, reason: "artifact meta has no idAnchors (rebuild the payload)" };
      }
      if (input.index >= meta.count) {
        return { stale: true, reason: "index out of range for the built artifact" };
      }
      const anchor = anchorFor(meta.idAnchors, input.index);
      if (!anchor) return { stale: true, reason: "index beyond recorded anchors" };

      // PK index-only walk: seek to the anchor id, skip the in-window offset.
      const idRows = await ctx.db.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "AccActivityEmbedding"
        WHERE id >= ${anchor.anchorId}
        ORDER BY id
        OFFSET ${anchor.offset} LIMIT 1`;
      const id = idRows[0]?.id;
      if (!id) return { stale: true, reason: "row not found at index (table drifted since build)" };

      if (id.startsWith("accds:")) {
        const row = await ctx.db.accActivityAccds.findUnique({
          where: { accdsActivityId: id.slice("accds:".length) },
        });
        if (!row) return { stale: true, reason: "event row missing (accds)" };
        if (input.expectedProjectGuid && row.projectId !== input.expectedProjectGuid) {
          return { stale: true, reason: "project mismatch — data refreshed since load" };
        }
        const project = await ctx.db.accProject.findUnique({
          where: { id: row.projectId },
          select: { name: true },
        });
        return {
          stale: false,
          id,
          source: "accds",
          verb: row.activityVerb,
          objectType: row.objectType,
          objectName: row.objectName,
          folderName: row.folderName,
          projectId: row.projectId,
          projectName: project?.name ?? null,
          authorEmail: row.userEmail,
          authorName: row.userName,
          createdAt: row.createdAt.toISOString(),
        };
      }

      // DC backfill/admin row — no object/folder names at this grain (honest nulls).
      const row = await ctx.db.accActivity.findUnique({ where: { id } });
      if (!row) return { stale: true, reason: "event row missing (dc)" };
      if (
        input.expectedProjectGuid &&
        row.projectId &&
        row.projectId !== "" &&
        row.projectId !== input.expectedProjectGuid
      ) {
        return { stale: true, reason: "project mismatch — data refreshed since load" };
      }
      const project =
        row.projectId && row.projectId !== ""
          ? await ctx.db.accProject.findUnique({
              where: { id: row.projectId },
              select: { name: true },
            })
          : null;
      return {
        stale: false,
        id,
        source: "dc",
        verb: row.rawAction,
        objectType: null,
        objectName: null,
        folderName: null,
        projectId: row.projectId || null,
        projectName: project?.name ?? null,
        authorEmail: row.userEmail,
        authorName: null,
        createdAt: row.createdAt.toISOString(),
      };
    }),
});
