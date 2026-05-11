-- Phase 03 Plan 01: AccActivity v2 — Wave 0 foundation for streaming-ingest pipeline.
-- AccActivity has 0 rows at migration time (verified 2026-05-11), so renaming "action" -> "rawAction" is safe.
-- The composite @@unique is the dedup key that makes createMany({ skipDuplicates: true }) a real ON CONFLICT DO NOTHING.
-- NOTE: projectId is nullable; Plan 02 ingest writes empty-string sentinel for admin rows so dedup applies there too.

-- DropIndex
DROP INDEX "AccActivity_action_idx";

-- AlterTable
ALTER TABLE "AccActivity" DROP COLUMN "action",
ADD COLUMN     "rawAction" TEXT NOT NULL,
ADD COLUMN     "sourceFile" TEXT NOT NULL DEFAULT 'project',
ADD COLUMN     "userEmail" TEXT;

-- CreateTable
CREATE TABLE "UnresolvedAttribution" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "rawEmail" TEXT,
    "rawDetails" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnresolvedAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnresolvedAttribution_reason_idx" ON "UnresolvedAttribution"("reason");

-- CreateIndex
CREATE INDEX "UnresolvedAttribution_createdAt_idx" ON "UnresolvedAttribution"("createdAt");

-- CreateIndex
CREATE INDEX "AccActivity_userEmail_createdAt_idx" ON "AccActivity"("userEmail", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AccActivity_rawAction_idx" ON "AccActivity"("rawAction");

-- CreateIndex
CREATE UNIQUE INDEX "AccActivity_autodeskId_rawAction_createdAt_projectId_key" ON "AccActivity"("autodeskId", "rawAction", "createdAt", "projectId");
