// lib/acc/templateSync.ts
//
// Seeds ACC Template MTY into the shared AccProject*/AccFolder* tables and runs
// the existing member/role + folder extractors against it. The template is
// marked type:"template" so the two isolation guards (quick-sync soft-delete +
// loadTerrainProjects) keep it out of the main Access Analysis surfaces.
//
// Intentionally does NOT call writeMemberCacheFromAggregator — the template's
// members must not leak into /users / the access graph.

import type { PrismaClient } from "@prisma/client";
import {
  extractAndPersistProjectData,
  type MemberAggregator,
} from "@/lib/acc/quick-sync-extraction";
import { extractAndPersistFolders } from "@/lib/acc/folderCrawl";
import { TEMPLATE_MTY_ID, TEMPLATE_MTY_NAME } from "@/lib/acc/template-mty";

export interface SyncTemplateResult {
  folders: number;
  perms: number;
}

export async function syncTemplate(
  prisma: PrismaClient,
  accountId: string,
  hubId: string,
  accessToken: string,
  opts: { refreshAccessToken: () => Promise<string> },
): Promise<SyncTemplateResult> {
  // 1. Seed/refresh the AccProject row (type:"template" = isolation marker).
  await prisma.accProject.upsert({
    where: { id: TEMPLATE_MTY_ID },
    create: { id: TEMPLATE_MTY_ID, accountId, name: TEMPLATE_MTY_NAME, type: "template", status: "active" },
    update: { accountId, name: TEMPLATE_MTY_NAME, type: "template", status: "active" },
  });

  // 2. Members + roles -> AccRole, AccProjectRole, AccProjectMember(products).
  const aggregator: MemberAggregator = new Map();
  await extractAndPersistProjectData(
    prisma,
    accountId,
    { id: TEMPLATE_MTY_ID, name: TEMPLATE_MTY_NAME },
    accessToken,
    aggregator,
  );

  // 3. Folders + permissions -> AccFolder, AccFolderPermission.
  const folderRes = await extractAndPersistFolders(
    prisma,
    hubId,
    { id: TEMPLATE_MTY_ID, accountId, name: TEMPLATE_MTY_NAME },
    accessToken,
    opts,
  );

  return { folders: folderRes.folderCount, perms: folderRes.permissionCount };
}
