-- Slice D — per-folder file rollup columns on AccFolder.
-- Applied out-of-band on the local DB (its shadow DB lacks the `vector` extension,
-- so `migrate dev`/`db push` can't run); recorded via `prisma migrate resolve --applied`.
-- AlterTable
ALTER TABLE "AccFolder"
  ADD COLUMN "fileCount" INTEGER,
  ADD COLUMN "totalSizeBytes" DOUBLE PRECISION,
  ADD COLUMN "lastModifiedTime" TIMESTAMP(3),
  ADD COLUMN "lastModifiedBy" TEXT,
  ADD COLUMN "latestVersionAddedBy" TEXT,
  ADD COLUMN "maxVersionNumber" INTEGER;
