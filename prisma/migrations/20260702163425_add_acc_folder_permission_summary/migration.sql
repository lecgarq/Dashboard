-- PROJ-01 (REF-03 foundation): AccFolderPermissionSummary projection.
-- Applied via raw SQL + `prisma migrate resolve` because `prisma migrate dev` fails on
-- this DB's shadow-DB step (pgvector `Unsupported` extension "vector" is not available —
-- see 20260416011500_fix_lod_search_foundation), mirroring the Phase 09 DB-01 precedent
-- (20260623000000_add_acc_folder_permission_role_id_index).
CREATE TABLE "AccFolderPermissionSummary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "folderCount" INTEGER NOT NULL,
    "totalBytes" BIGINT NOT NULL,
    "permTypes" TEXT[],
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccFolderPermissionSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccFolderPermissionSummary_projectId_roleId_key" ON "AccFolderPermissionSummary"("projectId", "roleId");

CREATE INDEX "AccFolderPermissionSummary_projectId_idx" ON "AccFolderPermissionSummary"("projectId");

CREATE INDEX "AccFolderPermissionSummary_roleId_idx" ON "AccFolderPermissionSummary"("roleId");
