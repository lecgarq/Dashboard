import { TRPCError } from "@trpc/server";
import pLimit from "p-limit";
import { z } from "zod";

import { getValidAutodeskAccessToken } from "@/lib/server/aps-user-token";
import { IntegrationError } from "@/lib/server/integration-errors";
import { createLogger } from "@/lib/server/logger";

import { protectedProcedure, router } from "../trpc";

const logger = createLogger("aps-search");

const APS_BASE_URL = "https://developer.api.autodesk.com";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const SEARCH_TIMEOUT_MS = 60_000;
const CONCURRENCY = 3;
const FOLDER_SEARCH_PAGE_LIMIT = 100;

type ApsFolder = {
  id: string;
  name: string;
  parentId: string;
};

type FolderInfo = {
  name: string;
  parentId: string;
};

const topFolderCache = new Map<string, ApsFolder[]>();
const folderInfoCache = new Map<string, FolderInfo>();

export type ApsRevitModel = {
  id: string;
  itemId: string;
  hubId: string;
  projectId: string;
  projectGuid: string;
  name: string;
  displayName: string;
  fileName: string;
  fileType: string;
  extensionType: string;
  modelGuid: string | null;
  region: string | null;
  isWorkshared: boolean;
  folderId: string;
  folderPath: string;
  versionNumber: number;
  fileSizeBytes: number | null;
  lastModified: string | null;
  derivativeUrn: string | null;
};

function toApsRouterError(error: unknown, fallbackMessage: string) {
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

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getDateString(value: unknown) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function toDerivativeUrn(storageId: string | null) {
  if (!storageId) return null;

  return Buffer.from(storageId)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getModelGuid(extData: Record<string, unknown> | null) {
  if (!extData) return null;

  for (const key of ["modelGuid", "modelId", "originalModelId"] as const) {
    const value = getString(extData[key]);
    if (value) return value;
  }

  const revisionId = getString(extData.revisionId);
  if (
    revisionId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      revisionId
    )
  ) {
    return revisionId;
  }

  return null;
}

function buildFolderSearchUrl(
  projectId: string,
  folderId: string,
  searchText?: string
) {
  const query = [
    `page[limit]=${FOLDER_SEARCH_PAGE_LIMIT}`,
    "include=tip,refs",
  ];

  if (searchText?.trim()) {
    query.push(
      `filter[attributes.displayName]-contains=${encodeURIComponent(
        searchText.trim()
      )}`
    );
  }

  return `${APS_BASE_URL}/data/v1/projects/${encodeURIComponent(
    projectId
  )}/folders/${encodeURIComponent(folderId)}/search?${query.join("&")}`;
}

function isRichApsModel(value: unknown): value is ApsRevitModel {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.itemId === "string" &&
    typeof candidate.projectGuid === "string" &&
    typeof candidate.folderPath === "string" &&
    typeof candidate.displayName === "string"
  );
}

async function fetchApsJson(
  url: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<Record<string, any>> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
    signal,
  });

  const raw = await response.text();
  let payload: Record<string, any> = {};

  try {
    payload = raw ? (JSON.parse(raw) as Record<string, any>) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const errorText =
      getString(payload.developerMessage) ||
      getString(payload.error_description) ||
      getString(payload.error) ||
      raw ||
      `${response.status} ${response.statusText}`;

    if (response.status === 401 || response.status === 403) {
      throw new IntegrationError(
        "Autodesk connection expired. Reconnect Autodesk and try again.",
        response.status,
        "reconnect_required",
        "Autodesk",
        { url, error: errorText }
      );
    }

    throw new IntegrationError(
      `APS request failed: ${errorText}`,
      response.status,
      "unavailable",
      "Autodesk",
      { url, error: errorText }
    );
  }

  return payload;
}

async function getTopFolders(
  hubId: string,
  projectId: string,
  accessToken: string
) {
  const cacheKey = `${hubId}|${projectId}`;
  const cached = topFolderCache.get(cacheKey);
  if (cached) return cached;

  const payload = await fetchApsJson(
    `${APS_BASE_URL}/project/v1/hubs/${encodeURIComponent(
      hubId
    )}/projects/${encodeURIComponent(projectId)}/topFolders`,
    accessToken
  );

  const folders = (Array.isArray(payload.data) ? payload.data : [])
    .filter((entry) => entry?.type === "folders")
    .map(
      (entry): ApsFolder => ({
        id: getString(entry.id),
        name:
          getString(entry?.attributes?.name) ||
          getString(entry?.attributes?.displayName) ||
          getString(entry.id),
        parentId: "",
      })
    );

  topFolderCache.set(cacheKey, folders);
  return folders;
}

async function ensureFolderChain(
  projectId: string,
  startId: string,
  rootId: string,
  folderCacheForSearch: Map<string, FolderInfo>,
  accessToken: string,
  signal?: AbortSignal
) {
  let current = startId;

  for (
    let depth = 0;
    depth < 25 && current && current !== rootId;
    depth += 1
  ) {
    const existing = folderCacheForSearch.get(current);
    if (existing) {
      current = existing.parentId;
      continue;
    }

    const sharedKey = `${projectId}|${current}`;
    const shared = folderInfoCache.get(sharedKey);
    if (shared) {
      folderCacheForSearch.set(current, shared);
      current = shared.parentId;
      continue;
    }

    try {
      const payload = await fetchApsJson(
        `${APS_BASE_URL}/data/v1/projects/${encodeURIComponent(
          projectId
        )}/folders/${encodeURIComponent(current)}`,
        accessToken,
        signal
      );

      const data = payload.data ?? {};
      const name =
        getString(data?.attributes?.name) ||
        getString(data?.attributes?.displayName);
      const parentId = getString(data?.relationships?.parent?.data?.id);

      if (!name) break;

      const info = { name, parentId };
      folderCacheForSearch.set(current, info);
      folderInfoCache.set(sharedKey, info);
      current = parentId;
    } catch (error) {
      logger.warn("APS folder chain resolution failed", {
        projectId,
        folderId: current,
        err: error,
      });
      break;
    }
  }
}

function resolveFolderPath(
  startId: string,
  rootId: string,
  rootName: string,
  folderCacheForSearch: Map<string, FolderInfo>
) {
  if (!startId) return rootName;

  const parts: string[] = [];
  let current = startId;

  for (let depth = 0; depth < 25 && current; depth += 1) {
    if (current === rootId) {
      parts.push(rootName);
      break;
    }

    const info = folderCacheForSearch.get(current);
    if (!info) break;

    parts.push(info.name);
    current = info.parentId;
  }

  return parts.length > 0 ? parts.reverse().join(" / ") : rootName;
}

async function searchFolderPass(
  hubId: string,
  projectId: string,
  rootFolder: ApsFolder,
  accessToken: string,
  results: Map<string, ApsRevitModel>,
  searchText?: string,
  signal?: AbortSignal
) {
  let nextUrl: string | null = buildFolderSearchUrl(
    projectId,
    rootFolder.id,
    searchText
  );
  const folderCacheForSearch = new Map<string, FolderInfo>();
  folderCacheForSearch.set(rootFolder.id, {
    name: rootFolder.name,
    parentId: "",
  });

  const pending: Array<{
    itemId: string;
    parentFolderId: string;
    model: ApsRevitModel;
  }> = [];

  while (nextUrl) {
    const payload = await fetchApsJson(nextUrl, accessToken, signal);
    const includedById = new Map<string, Record<string, any>>();

    for (const included of Array.isArray(payload.included) ? payload.included : []) {
      const includedId = getString(included?.id);
      if (!includedId) continue;

      includedById.set(includedId, included);

      const includedType = getString(included?.type);
      if (!includedType.toLowerCase().includes("folder")) continue;

      const name =
        getString(included?.attributes?.name) ||
        getString(included?.attributes?.displayName);
      if (!name) continue;

      const parentId = getString(included?.relationships?.parent?.data?.id);
      const info = { name, parentId };

      folderCacheForSearch.set(includedId, info);
      folderInfoCache.set(`${projectId}|${includedId}`, info);
    }

    for (const item of Array.isArray(payload.data) ? payload.data : []) {
      const itemId = getString(item?.id);
      if (!itemId || results.has(itemId)) continue;

      const itemAttributes = item?.attributes ?? {};
      const rawName =
        getString(itemAttributes.displayName) ||
        getString(itemAttributes.name) ||
        itemId;

      if (!rawName.toLowerCase().endsWith(".rvt")) continue;
      if (
        searchText?.trim() &&
        !rawName.toLowerCase().includes(searchText.trim().toLowerCase())
      ) {
        continue;
      }

      const relationships = item?.relationships ?? {};
      const tipVersionId = getString(relationships?.tip?.data?.id);
      const version = tipVersionId ? includedById.get(tipVersionId) ?? null : null;
      const versionAttributes = version?.attributes ?? itemAttributes;
      const versionExtension = versionAttributes?.extension ?? {};
      const versionExtensionData =
        (versionExtension?.data as Record<string, unknown> | undefined) ?? null;
      const itemExtension = itemAttributes?.extension ?? {};
      const itemExtensionData =
        (itemExtension?.data as Record<string, unknown> | undefined) ?? null;
      const extensionType = getString(versionExtension?.type);
      const parentFolderId = getString(relationships?.parent?.data?.id);
      const displayName =
        getString(versionAttributes.displayName) ||
        getString(versionAttributes.name) ||
        rawName;
      const fileName = getString(versionAttributes.name) || rawName;
      const fileSizeBytes = getNumber(versionAttributes.storageSize);
      const lastModified = getDateString(versionAttributes.lastModifiedTime);

      let modelGuid = getModelGuid(versionExtensionData);
      if (!modelGuid) {
        modelGuid = getModelGuid(itemExtensionData);
      }

      const storageId =
        getString(version?.relationships?.storage?.data?.id) ||
        getString(item?.relationships?.storage?.data?.id) ||
        null;

      pending.push({
        itemId,
        parentFolderId,
        model: {
          id: tipVersionId || itemId,
          itemId,
          hubId,
          projectId,
          projectGuid: projectId.startsWith("b.") ? projectId.slice(2) : projectId,
          name: displayName,
          displayName,
          fileName,
          fileType: "rvt",
          extensionType,
          modelGuid,
          region:
            getString(versionExtensionData?.region) ||
            getString(itemExtensionData?.region) ||
            "US",
          isWorkshared:
            extensionType === "versions:autodesk.bim360:C4RModel",
          folderId: parentFolderId,
          folderPath: "",
          versionNumber: getNumber(versionAttributes.versionNumber) ?? 0,
          fileSizeBytes,
          lastModified,
          derivativeUrn: toDerivativeUrn(storageId),
        },
      });
    }

    nextUrl = getString(payload?.links?.next?.href) || null;
  }

  for (const entry of pending) {
    if (results.has(entry.itemId)) continue;

    await ensureFolderChain(
      projectId,
      entry.parentFolderId,
      rootFolder.id,
      folderCacheForSearch,
      accessToken,
      signal
    );

    entry.model.folderPath = resolveFolderPath(
      entry.parentFolderId,
      rootFolder.id,
      rootFolder.name,
      folderCacheForSearch
    );
    results.set(entry.itemId, entry.model);
  }
}

async function searchProjectModels(
  hubId: string,
  projectId: string,
  accessToken: string,
  searchText?: string
): Promise<ApsRevitModel[]> {
  const rootFolders = await getTopFolders(hubId, projectId, accessToken);
  const results = new Map<string, ApsRevitModel>();
  const limit = pLimit(CONCURRENCY);

  await Promise.allSettled(
    rootFolders.map((folder) =>
      limit(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

        try {
          await searchFolderPass(
            hubId,
            projectId,
            folder,
            accessToken,
            results,
            searchText,
            controller.signal
          );
        } catch (error) {
          if (controller.signal.aborted) {
            logger.warn("APS folder search timed out", {
              projectId,
              folderId: folder.id,
              folderName: folder.name,
            });
            return;
          }

          logger.warn("APS folder search failed", {
            projectId,
            folderId: folder.id,
            folderName: folder.name,
            err: error,
          });
        } finally {
          clearTimeout(timeout);
        }
      })
    )
  );

  return [...results.values()];
}

export const apsSearchRouter = router({
  searchProject: protectedProcedure
    .input(
      z.object({
        hubId: z.string(),
        projectId: z.string(),
        projectName: z.string().optional(),
        searchText: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { hubId, projectId, projectName, searchText } = input;

      try {
        const now = new Date();
        const cached = await ctx.db.apsProjectSearchCache.findUnique({
          where: { hubId_projectId: { hubId, projectId } },
        });

        if (
          cached &&
          now.getTime() - cached.fetchedAt.getTime() < CACHE_TTL_MS &&
          Array.isArray(cached.models) &&
          cached.models.every(isRichApsModel)
        ) {
          logger.info("APS search cache hit", { projectId });
          return {
            models: cached.models as ApsRevitModel[],
            fromCache: true,
            fetchedAt: cached.fetchedAt,
          };
        }

        logger.info("APS folder search starting", {
          projectId,
          searchText: searchText?.trim() || null,
        });

        const { accessToken } = await getValidAutodeskAccessToken(
          ctx.session.user.id
        );
        const models = await searchProjectModels(
          hubId,
          projectId,
          accessToken,
          searchText
        );

        logger.info("APS folder search complete", {
          projectId,
          count: models.length,
        });

        await ctx.db.apsProjectSearchCache.upsert({
          where: { hubId_projectId: { hubId, projectId } },
          create: {
            hubId,
            projectId,
            projectName: projectName ?? null,
            models,
            fetchedAt: now,
          },
          update: {
            projectName: projectName ?? null,
            models,
            fetchedAt: now,
          },
        });

        return { models, fromCache: false, fetchedAt: now };
      } catch (error) {
        throw toApsRouterError(error, "APS project search failed.");
      }
    }),

  clearCache: protectedProcedure
    .input(z.object({ hubId: z.string(), projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.apsProjectSearchCache
        .delete({
          where: {
            hubId_projectId: {
              hubId: input.hubId,
              projectId: input.projectId,
            },
          },
        })
        .catch(() => null);
      return { success: true };
    }),
});
