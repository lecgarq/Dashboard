-- 2026-05-18 Phase: DC ingest drift recovery (per docs/superpowers/specs/2026-05-18-dc-ingest-drift-recovery-design.md)
-- Adds ingestRunId column to AccActivity. The dcActivityCsvIngest writer has been
-- passing this field to createMany() since plan 08-04 but the column was never
-- created, causing every activity insert to throw silently and the slice loop
-- to log+continue. Existing rows remain NULL (honest — column post-dates them).
--
-- Reversible: DROP INDEX "AccActivity_ingestRunId_idx"; ALTER TABLE "AccActivity" DROP COLUMN "ingestRunId";

-- AlterTable
ALTER TABLE "AccActivity" ADD COLUMN "ingestRunId" TEXT;

-- CreateIndex
CREATE INDEX "AccActivity_ingestRunId_idx" ON "AccActivity"("ingestRunId");
