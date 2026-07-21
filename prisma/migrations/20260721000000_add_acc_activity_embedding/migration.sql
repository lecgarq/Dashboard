-- v2.7 Phase 38 (EMB-07): activity-grain embedding storage.
-- Applied manually via scripts/create-activity-embedding-table.ts and registered
-- with `prisma migrate resolve --applied` (pgvector shadow-DB blocks migrate dev).

CREATE TABLE IF NOT EXISTS "AccActivityEmbedding" (
    "id"             TEXT NOT NULL,
    "x"              REAL NOT NULL,
    "y"              REAL NOT NULL,
    "verbId"         SMALLINT NOT NULL,
    "objectTypeId"   SMALLINT NOT NULL,
    "moduleId"       SMALLINT NOT NULL,
    "monthId"        SMALLINT NOT NULL,
    "roleId"         SMALLINT NOT NULL,
    "companyId"      SMALLINT NOT NULL,
    "projectId"      INTEGER NOT NULL,
    "authorId"       INTEGER NOT NULL,
    "folderId"       INTEGER NOT NULL,
    "embeddingRunId" TEXT NOT NULL,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccActivityEmbedding_pkey" PRIMARY KEY ("id")
);
