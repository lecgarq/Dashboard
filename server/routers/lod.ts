import crypto from "crypto";

import { TRPCError } from "@trpc/server";
import OpenAI from "openai";
import { z } from "zod";

import { IntegrationError } from "@/lib/server/integration-errors";
import {
  LOD_QUERY_ENCODER_VERSION,
  encodeLodQuery,
} from "@/lib/server/lod-query-encoder";
import { createLogger } from "@/lib/server/logger";
import { getRedis } from "@/lib/redis";

import {
  adminProcedure,
  editorProcedure,
  protectedProcedure,
  router,
} from "../trpc";

const logger = createLogger("lod");
const SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const SEARCH_CACHE_TTL_S = SEARCH_CACHE_TTL_MS / 1000;
const SEARCH_RESULT_LIMIT = 200;
const SEARCH_CANDIDATE_LIMIT = 400;

type CacheEntry = {
  expandedQuery: string;
  encoderVersion: string;
  resultIds: string; // JSON-stringified array
};

type LodSearchCandidate = {
  id: string;
  nameOfFile: string;
  familyName: string | null;
  finalCategory: string | null;
  lodLabel: string | null;
  provider: string | null;
  caption: string | null;
  fullDescription: string | null;
  confidenceLevel: string | null;
  imagePath: string | null;
  possibleCategories: string[];
  distance: number;
};

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return apiKey ? new OpenAI({ apiKey }) : null;
}

async function expandQuery(query: string): Promise<string> {
  const openai = getOpenAI();
  if (!openai) return query;

  try {
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

    return res.choices[0].message.content?.trim() || query;
  } catch (error) {
    logger.warn("LOD query expansion failed; falling back to original query", {
      err: error,
      query,
    });
    return query;
  }
}

function toLodRouterError(error: unknown, fallbackMessage: string) {
  if (error instanceof IntegrationError) {
    return new TRPCError({
      code:
        error.code === "config_missing" || error.code === "reconnect_required"
          ? "PRECONDITION_FAILED"
          : "INTERNAL_SERVER_ERROR",
      message: error.message,
      cause: error,
    });
  }

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: fallbackMessage,
    cause: error instanceof Error ? error : undefined,
  });
}

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function toVectorLiteral(vector: number[]) {
  return `[${vector.join(",")}]`;
}

function isValidEmbedding(vector: number[] | undefined): vector is number[] {
  return (
    Array.isArray(vector) &&
    vector.length === 768 &&
    vector.every((value) => Number.isFinite(value))
  );
}

function normalizeVector(vector: number[]) {
  let magnitude = 0;

  for (const value of vector) {
    magnitude += value * value;
  }

  if (!magnitude) return vector;

  const scale = Math.sqrt(magnitude);
  return vector.map((value) => value / scale);
}

function blendVectors(base: number[], expanded?: number[]) {
  if (!expanded) return normalizeVector(base);
  return normalizeVector(
    base.map((value, index) => value * 0.3 + expanded[index] * 0.7)
  );
}

function getQueryTerms(...queries: string[]) {
  return [
    ...new Set(
      queries
        .flatMap((query) => query.split(/[^a-z0-9]+/i))
        .map((term) => term.trim().toLowerCase())
        .filter((term) => term.length >= 2)
    ),
  ];
}

function rankCandidate(candidate: LodSearchCandidate, terms: string[]) {
  const weightedFields: Array<[string | null | undefined, number]> = [
    [candidate.familyName, 0.2],
    [candidate.nameOfFile, 0.18],
    [candidate.finalCategory, 0.16],
    [candidate.lodLabel, 0.14],
    [candidate.provider, 0.12],
    [candidate.caption, 0.08],
    [candidate.fullDescription, 0.04],
  ];

  let boost = 0;

  for (const term of terms) {
    for (const [field, weight] of weightedFields) {
      if (field?.toLowerCase().includes(term)) {
        boost += weight;
      }
    }

    if (
      candidate.possibleCategories.some((value) =>
        value.toLowerCase().includes(term)
      )
    ) {
      boost += 0.08;
    }
  }

  const similarity = 1 - candidate.distance;
  return similarity + Math.min(boost, 1.5);
}

export const lodRouter = router({
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const normalizedQuery = normalizeQuery(input.query);
      const queryHash = crypto
        .createHash("sha256")
        .update(normalizedQuery)
        .digest("hex");

      const redis = getRedis();
      if (redis) {
        const cached = await redis.hgetall<CacheEntry>(`lod:search:${queryHash}`);
        if (cached && cached.encoderVersion === LOD_QUERY_ENCODER_VERSION) {
          const resultIds: string[] = JSON.parse(cached.resultIds);
          const families = await ctx.db.lodFamily.findMany({
            where: { id: { in: resultIds } },
            select: {
              id: true,
              nameOfFile: true,
              familyName: true,
              finalCategory: true,
              lodLabel: true,
              provider: true,
              caption: true,
              fullDescription: true,
              confidenceLevel: true,
              imagePath: true,
              possibleCategories: true,
            },
          });
          const familyMap = new Map(families.map((family) => [family.id, family]));

          return {
            results: resultIds
              .map((id) => familyMap.get(id))
              .filter((family): family is NonNullable<typeof family> => Boolean(family)),
            fromCache: true,
            expandedQuery: cached.expandedQuery,
          };
        }
      }

      try {
        const [expandedQuery, baseEmbedding] = await Promise.all([
          expandQuery(normalizedQuery),
          encodeLodQuery(normalizedQuery),
        ]);

        const expandedEmbedding =
          expandedQuery !== normalizedQuery
            ? await encodeLodQuery(expandedQuery)
            : null;

        const queryVector = blendVectors(
          baseEmbedding.vector,
          expandedEmbedding?.vector
        );

        const candidates = await ctx.db.$queryRawUnsafe<LodSearchCandidate[]>(
          `SELECT
             f.id,
             f."nameOfFile",
             f."familyName",
             f."finalCategory",
             f."lodLabel",
             f.provider,
             f.caption,
             f."fullDescription",
             f."confidenceLevel",
             f."imagePath",
             COALESCE(f."possibleCategories", ARRAY[]::text[]) AS "possibleCategories",
             (e."pgvector" <=> $1::vector) AS distance
           FROM "LodEmbedding" e
           JOIN "LodFamily" f ON f.id = e."familyId"
           WHERE e."pgvector" IS NOT NULL
           ORDER BY e."pgvector" <=> $1::vector
           LIMIT ${SEARCH_CANDIDATE_LIMIT}`,
          toVectorLiteral(queryVector)
        );

        const queryTerms = getQueryTerms(normalizedQuery, expandedQuery);
        const ranked = candidates
          .map((candidate) => ({
            ...candidate,
            score: rankCandidate(candidate, queryTerms),
          }))
          .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            if (left.distance !== right.distance) return left.distance - right.distance;
            return left.nameOfFile.localeCompare(right.nameOfFile);
          })
          .slice(0, SEARCH_RESULT_LIMIT)
          .map(({ score: _score, ...candidate }) => candidate);

        const resultIds = ranked.map((candidate) => candidate.id);

        if (redis) {
          await redis.hset(`lod:search:${queryHash}`, {
            expandedQuery,
            encoderVersion: LOD_QUERY_ENCODER_VERSION,
            resultIds: JSON.stringify(resultIds),
          });
          await redis.expire(`lod:search:${queryHash}`, SEARCH_CACHE_TTL_S);
        }

        return {
          results: ranked,
          fromCache: false,
          expandedQuery,
        };
      } catch (error) {
        throw toLodRouterError(error, "LOD search failed.");
      }
    }),

  getGraphData: protectedProcedure.query(async ({ ctx }) => {
    const nodes = await ctx.db.lodGraphNode.findMany({
      select: {
        id: true,
        familyId: true,
        x: true,
        y: true,
        neighbors: true,
        family: {
          select: {
            id: true,
            familyName: true,
            nameOfFile: true,
            finalCategory: true,
            lodLabel: true,
          },
        },
      },
    });
    // Client uses at most 10 neighbors (getSafeNeighbors limit); trim here to avoid
    // serializing the full HNSW graph on every page load.
    return nodes.map((node) => ({ ...node, neighbors: node.neighbors.slice(0, 10) }));
  }),

  getSimilarFamilies: protectedProcedure
    .input(z.object({ familyId: z.string(), limit: z.number().min(1).max(30).default(10) }))
    .query(async ({ input, ctx }) => {
      // 1. Find the graph node for this family
      const node = await ctx.db.lodGraphNode.findUnique({
        where: { familyId: input.familyId },
      });
      if (!node || node.neighbors.length === 0) return [];

      // 2. Get all nodes ordered by DB insertion (same ordering as graph indices)
      const allNodes = await ctx.db.lodGraphNode.findMany({
        select: { familyId: true },
        orderBy: { id: "asc" },
      });

      // 3. Map neighbor indices → familyIds
      const neighborFamilyIds = node.neighbors
        .slice(0, input.limit)
        .map((idx) => allNodes[idx]?.familyId)
        .filter((id): id is string => !!id);

      if (neighborFamilyIds.length === 0) return [];

      // 4. Fetch those families
      return ctx.db.lodFamily.findMany({
        where: { id: { in: neighborFamilyIds } },
        select: {
          id: true,
          familyName: true,
          nameOfFile: true,
          finalCategory: true,
          lodLabel: true,
          imagePath: true,
          provider: true,
        },
      });
    }),

  getFamily: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.db.lodFamily.findUnique({ where: { id: input.id } });
    }),

  deleteFamily: editorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.lodFamily.delete({ where: { id: input.id } });
      // Cache entries are keyed by queryHash; stale resultIds are filtered out at read time.
      // TTL-based expiry in Redis handles cleanup automatically.
      return { success: true };
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const [total, byCategory, byLod, byProvider] = await Promise.all([
      ctx.db.lodFamily.count(),
      ctx.db.lodFamily.groupBy({ by: ["finalCategory"], _count: { id: true } }),
      ctx.db.lodFamily.groupBy({ by: ["lodLabel"], _count: { id: true } }),
      ctx.db.lodFamily.groupBy({ by: ["provider"], _count: { id: true } }),
    ]);

    return { total, byCategory, byLod, byProvider };
  }),

  getCategories: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.lodCategory.findMany({ orderBy: { name: "asc" } });
  }),

  analyzeBatch: protectedProcedure
    .input(z.object({ familyIds: z.array(z.string()) }))
    .mutation(async ({ input, ctx }) => {
      const openai = getOpenAI();
      if (!openai) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "OpenAI is not configured for batch analysis.",
        });
      }

      const families = await ctx.db.lodFamily.findMany({
        where: { id: { in: input.familyIds } },
        select: {
          id: true,
          familyName: true,
          finalCategory: true,
          lodLabel: true,
          fullDescription: true,
        },
      });

      const res = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are a BIM expert analyzing Revit families for LOD compliance and quality.",
          },
          {
            role: "user",
            content: `Analyze these Revit families and provide a brief summary of patterns, LOD compliance, and recommendations:\n\n${JSON.stringify(
              families,
              null,
              2
            )}`,
          },
        ],
        max_tokens: 800,
      });

      return { analysis: res.choices[0].message.content ?? "" };
    }),

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
        const validEmbedding = isValidEmbedding(embedding) ? embedding : undefined;

        await ctx.db.$transaction(async (tx) => {
          const family = await tx.lodFamily.upsert({
            where: { nameOfFile: familyData.nameOfFile },
            create: familyData,
            update: familyData,
          });

          if (validEmbedding) {
            await tx.lodEmbedding.upsert({
              where: { familyId: family.id },
              create: { familyId: family.id, vector: validEmbedding },
              update: { vector: validEmbedding },
            });

            await tx.$executeRawUnsafe(
              `UPDATE "LodEmbedding"
               SET "pgvector" = $1::vector
               WHERE "familyId" = $2`,
              toVectorLiteral(validEmbedding),
              family.id
            );
          }

          if (graphX !== undefined && graphY !== undefined) {
            await tx.lodGraphNode.upsert({
              where: { familyId: family.id },
              create: {
                familyId: family.id,
                x: graphX,
                y: graphY,
                neighbors: graphNeighbors,
              },
              update: {
                x: graphX,
                y: graphY,
                neighbors: graphNeighbors,
              },
            });
          }
        });

        upserted++;
      }

      // Flush all LOD search cache entries from Redis after a full re-upload
      const redis = getRedis();
      if (redis) {
        let scanCursor = 0;
        do {
          const [nextCursor, keys] = await redis.scan(scanCursor, { match: "lod:search:*", count: 100 });
          scanCursor = Number(nextCursor);
          if (keys.length > 0) {
            await redis.del(...(keys as [string, ...string[]]));
          }
        } while (scanCursor !== 0);
      }
      logger.info("LOD pipeline upload complete", { upserted });
      return { upserted };
    }),

  startBatchTraining: adminProcedure
    .input(
      z.object({
        inputDir: z.string(),
        outputDir: z.string(),
        provider: z.string().optional(),
        limit: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { startBatchTraining } = await import("@/lib/server/lod-query-encoder");
      return startBatchTraining(input);
    }),

  getTrainingStatus: protectedProcedure.query(async () => {
    const { getBatchStatus } = await import("@/lib/server/lod-query-encoder");
    return getBatchStatus();
  }),
});
