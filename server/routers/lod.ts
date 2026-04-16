import { z } from "zod";
import { router, protectedProcedure, adminProcedure, editorProcedure } from "../trpc";
import { createLogger } from "@/lib/server/logger";
import OpenAI from "openai";
import crypto from "crypto";

const logger = createLogger("lod");

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function computeEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAI();
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    dimensions: 768,
  });
  return res.data[0].embedding;
}

async function expandQuery(query: string): Promise<string> {
  const openai = getOpenAI();
  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You are a BIM/Revit expert. Expand the user's search query with synonyms and related technical terms for finding Revit families. Return only the expanded query text, no explanation.",
      },
      { role: "user", content: query },
    ],
    max_tokens: 100,
    temperature: 0.3,
  });
  return res.choices[0].message.content ?? query;
}

export const lodRouter = router({
  // ── Search ──
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const queryHash = crypto.createHash("sha256").update(input.query.toLowerCase().trim()).digest("hex");

      // Check cache
      const cached = await ctx.db.lodSearchCache.findUnique({ where: { queryHash } });
      if (cached) {
        const families = await ctx.db.lodFamily.findMany({
          where: { id: { in: cached.resultIds } },
        });
        // Preserve cache order
        const map = new Map(families.map((f) => [f.id, f]));
        return { results: cached.resultIds.map((id) => map.get(id)).filter(Boolean), fromCache: true };
      }

      // Expand query + embed
      const expandedQuery = await expandQuery(input.query);
      const embedding = await computeEmbedding(expandedQuery);

      // pgvector cosine similarity search
      const vectorLiteral = `[${embedding.join(",")}]`;
      const results = await ctx.db.$queryRawUnsafe<Array<{ id: string; distance: number }>>(
        `SELECT f.id, (e.vector::vector(768) <=> $1::vector) AS distance
         FROM "LodEmbedding" e
         JOIN "LodFamily" f ON f.id = e."familyId"
         ORDER BY e.vector::vector(768) <=> $1::vector
         LIMIT 200`,
        vectorLiteral
      );

      const ids = results.map((r) => r.id);

      // Store in cache
      await ctx.db.lodSearchCache.create({
        data: { queryHash, expandedQuery, resultIds: ids },
      });

      const families = await ctx.db.lodFamily.findMany({ where: { id: { in: ids } } });
      const map = new Map(families.map((f) => [f.id, f]));
      return { results: ids.map((id) => map.get(id)).filter(Boolean), fromCache: false };
    }),

  // ── Graph Data ──
  getGraphData: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.lodGraphNode.findMany({
      include: { family: { select: { id: true, familyName: true, finalCategory: true, lodLabel: true } } },
    });
  }),

  // ── Single Family ──
  getFamily: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.db.lodFamily.findUnique({ where: { id: input.id } });
    }),

  // ── Delete Family ──
  deleteFamily: editorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.lodFamily.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ── Stats ──
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const [total, byCategory, byLod, byProvider] = await Promise.all([
      ctx.db.lodFamily.count(),
      ctx.db.lodFamily.groupBy({ by: ["finalCategory"], _count: { id: true } }),
      ctx.db.lodFamily.groupBy({ by: ["lodLabel"], _count: { id: true } }),
      ctx.db.lodFamily.groupBy({ by: ["provider"], _count: { id: true } }),
    ]);
    return { total, byCategory, byLod, byProvider };
  }),

  // ── Categories ──
  getCategories: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.lodCategory.findMany({ orderBy: { name: "asc" } });
  }),

  // ── Batch Analysis ──
  analyzeBatch: protectedProcedure
    .input(z.object({ familyIds: z.array(z.string()) }))
    .mutation(async ({ input, ctx }) => {
      const families = await ctx.db.lodFamily.findMany({
        where: { id: { in: input.familyIds } },
        select: { id: true, familyName: true, finalCategory: true, lodLabel: true, fullDescription: true },
      });

      const openai = getOpenAI();
      const res = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a BIM expert analyzing Revit families for LOD compliance and quality.",
          },
          {
            role: "user",
            content: `Analyze these Revit families and provide a brief summary of patterns, LOD compliance, and recommendations:\n\n${JSON.stringify(families, null, 2)}`,
          },
        ],
        max_tokens: 800,
      });

      return { analysis: res.choices[0].message.content ?? "" };
    }),

  // ── Pipeline Upload (Admin only) ──
  uploadResults: adminProcedure
    .input(
      z.object({
        families: z.array(
          z.object({
            nameOfFile: z.string(),
            familyName: z.string().optional(),
            finalCategory: z.string().optional(),
            lodLabel: z.string().optional(),
            provider: z.string().optional(),
            caption: z.string().optional(),
            fullDescription: z.string().optional(),
            confidenceLevel: z.string().optional(),
            fileSizeKb: z.number().optional(),
            possibleCategories: z.array(z.string()).default([]),
            originalFile: z.string().optional(),
            imagePath: z.string().optional(),
            thumbPath: z.string().optional(),
            embedding: z.array(z.number()).optional(),
            graphX: z.number().optional(),
            graphY: z.number().optional(),
            graphNeighbors: z.array(z.number()).default([]),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      let upserted = 0;

      for (const item of input.families) {
        const { embedding, graphX, graphY, graphNeighbors, ...familyData } = item;

        const family = await ctx.db.lodFamily.upsert({
          where: { nameOfFile: familyData.nameOfFile },
          create: familyData,
          update: familyData,
        });

        if (embedding && embedding.length > 0) {
          await ctx.db.lodEmbedding.upsert({
            where: { familyId: family.id },
            create: { familyId: family.id, vector: embedding },
            update: { vector: embedding },
          });
        }

        if (graphX !== undefined && graphY !== undefined) {
          await ctx.db.lodGraphNode.upsert({
            where: { familyId: family.id },
            create: { familyId: family.id, x: graphX, y: graphY, neighbors: graphNeighbors },
            update: { x: graphX, y: graphY, neighbors: graphNeighbors },
          });
        }

        upserted++;
      }

      logger.info("LOD pipeline upload complete", { upserted });
      return { upserted };
    }),
});
