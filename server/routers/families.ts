import { z } from "zod";
import { router, protectedProcedure, adminProcedure, editorProcedure } from "../trpc";

const FamilyPhaseEnum = z.enum([
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "DONE",
]);

export const familiesRouter = router({
  getAll: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.db.family.findMany({
        where: { projectId: ctx.projectId },
        orderBy: [{ phase: "asc" }, { phaseOrder: "asc" }],
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.family.findUnique({
        where: { id: input.id },
        include: {
          changelog: { orderBy: { createdAt: "desc" }, take: 20 },
          attachments: true,
          deliverables: true,
        },
      });
    }),

  getByCategory: protectedProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.family.findMany({
        where: { projectId: ctx.projectId, category: input.category },
        orderBy: [{ phase: "asc" }, { phaseOrder: "asc" }],
        include: {
          changelog: { orderBy: { createdAt: "desc" }, take: 3 },
          attachments: true,
          deliverables: true,
        },
      });
    }),

  create: editorProcedure
    .input(
      z.object({
        name: z.string().min(1),
        category: z.string().optional(),
        phase: FamilyPhaseEnum.optional(),
        description: z.string().optional(),
        nextSteps: z.string().optional(),
        dueDate: z.date().optional().nullable(),
        requestDate: z.date().optional().nullable(),
        completionDate: z.date().optional().nullable(),
        owner: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const phase = input.phase ?? "TODO";
      const count = await ctx.db.family.count({ where: { projectId: ctx.projectId, phase } });
      return ctx.db.family.create({
        data: { ...input, projectId: ctx.projectId, phase, phaseOrder: count },
      });
    }),

  update: editorProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        category: z.string().optional(),
        phase: FamilyPhaseEnum.optional(),
        description: z.string().optional(),
        nextSteps: z.string().optional(),
        dueDate: z.date().nullable().optional(),
        requestDate: z.date().nullable().optional(),
        completionDate: z.date().nullable().optional(),
        owner: z.string().optional(),
        isBlocked: z.boolean().optional(),
        blockedBy: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.family.update({ where: { id }, data });
    }),

  movePhase: editorProcedure
    .input(
      z.object({
        id: z.string(),
        newPhase: FamilyPhaseEnum,
        newOrder: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.family.updateMany({
        where: { phase: input.newPhase, phaseOrder: { gte: input.newOrder } },
        data: { phaseOrder: { increment: 1 } },
      });
      return ctx.db.family.update({
        where: { id: input.id },
        data: { phase: input.newPhase, phaseOrder: input.newOrder },
      });
    }),

  reorder: editorProcedure
    .input(z.object({ id: z.string(), phase: FamilyPhaseEnum, order: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.family.update({
        where: { id: input.id },
        data: { phaseOrder: input.order },
      });
    }),

  delete: editorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.family.delete({ where: { id: input.id } });
    }),

  addChangelog: editorProcedure
    .input(
      z.object({
        familyId: z.string(),
        version: z.string(),
        author: z.string(),
        message: z.string(),
        impact: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.familyChangelog.create({ data: input });
    }),

  addAttachment: editorProcedure
    .input(
      z.object({
        familyId: z.string(),
        type: z.enum(["IMAGE", "VIDEO", "FILE"]),
        url: z.string(),
        name: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.familyAttachment.create({ data: input });
    }),

  deleteAttachment: editorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.familyAttachment.delete({ where: { id: input.id } });
    }),

  updateDeliverable: editorProcedure
    .input(z.object({ id: z.string(), done: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.familyDeliverable.update({
        where: { id: input.id },
        data: { done: input.done },
      });
    }),

  addDeliverable: editorProcedure
    .input(
      z.object({
        familyId: z.string(),
        name: z.string(),
        fileUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.familyDeliverable.create({ data: input });
    }),

  getKPIs: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const [total, published, nextDeadline] = await Promise.all([
      ctx.db.family.count(),
      ctx.db.family.count({ where: { phase: "DONE" } }),
      ctx.db.family.findMany({
        where: { dueDate: { gt: now } },
        orderBy: { dueDate: "asc" },
        take: 1,
        select: { dueDate: true },
      }),
    ]);

    return {
      total,
      published,
      completionRate: total > 0 ? Math.round((published / total) * 100) : 0,
      nearestDeadline: nextDeadline[0]?.dueDate ?? null,
    };
  }),

  startApsTranslation: editorProcedure
    .input(z.object({ familyId: z.string(), attachmentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const attachment = await ctx.db.familyAttachment.findUnique({
        where: { id: input.attachmentId }
      });
      if (!attachment) throw new Error("Attachment not found");

      // Set status to processing
      await ctx.db.family.update({
        where: { id: input.familyId },
        data: { apsStatus: "PROCESSING" }
      });

      // Background the APS work (node-style backgrounding)
      const { uploadToAps, translateToSvf2 } = await import("@/lib/aps");
      
      try {
        const response = await fetch(attachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        
        const urn = await uploadToAps(attachment.name, buffer);
        await translateToSvf2(urn);

        await ctx.db.family.update({
          where: { id: input.familyId },
          data: { apsUrn: urn, apsStatus: "PROCESSING" } // Still processing derivative
        });

        return { success: true, urn };
      } catch (err) {
        console.error("APS Error:", err);
        await ctx.db.family.update({
          where: { id: input.familyId },
          data: { apsStatus: "FAILED" }
        });
        throw new Error("Failed to start APS translation");
      }
    }),

  getApsStatus: protectedProcedure
    .input(z.object({ familyId: z.string(), urn: z.string() }))
    .query(async ({ ctx, input }) => {
      const { getManifest } = await import("@/lib/aps");
      const manifest = await getManifest(input.urn);
      if (!manifest) return { status: "FAILED" };

      // If manifest finished, update DB automatically
      if (manifest.status === "success" || manifest.status === "failed") {
        await ctx.db.family.update({
          where: { id: input.familyId },
          data: { apsStatus: manifest.status === "success" ? "SUCCESS" : "FAILED" }
        });
      }

      return { status: manifest.status, progress: manifest.progress };
    }),

  // Manifest-only status check (no DB write — for project-level items)
  getApsManifestStatus: protectedProcedure
    .input(z.object({ urn: z.string() }))
    .query(async ({ input }) => {
      const { getManifest } = await import("@/lib/aps");
      const manifest = await getManifest(input.urn);
      if (!manifest) return { status: "failed" as const };
      return { status: manifest.status as string, progress: manifest.progress as string | undefined };
    }),

  // ── APS Project Browser ────────────────────────────────────────────────────

  listApsProjectFolders: protectedProcedure.query(async () => {
    const { getFirstHub, getProjectTopFolders } = await import("@/lib/aps");
    const projectId = process.env["APS_PROJECT-ID"];
    if (!projectId) return [];
    const hub = await getFirstHub();
    if (!hub) return [];
    return getProjectTopFolders(hub.id, projectId);
  }),

  listApsFolder: protectedProcedure
    .input(z.object({ folderId: z.string() }))
    .query(async ({ input }) => {
      const { getFolderContents } = await import("@/lib/aps");
      const projectId = process.env["APS_PROJECT-ID"];
      if (!projectId) return { folders: [], items: [] };
      const result = await getFolderContents(projectId, input.folderId);
      return {
        folders: result.folders,
        items: result.items.filter((item) => item.extension === "rfa"),
      };
    }),

  translateApsItem: editorProcedure
    .input(z.object({ itemId: z.string(), itemName: z.string() }))
    .mutation(async ({ input }) => {
      const { getItemDerivativeUrn, translateToSvf2 } = await import("@/lib/aps");
      const projectId = process.env["APS_PROJECT-ID"];
      if (!projectId) throw new Error("APS_PROJECT-ID not configured");
      const urn = await getItemDerivativeUrn(projectId, input.itemId);
      if (!urn) throw new Error("Could not resolve derivative URN for item");
      await translateToSvf2(urn);
      return { urn };
    }),
});
