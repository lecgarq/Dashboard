-- Phase 04 Plan 03: AccProject folderCrawlStatus — additive column for Wave 2 folder-crawl pipeline.
-- Additive-only: NOT NULL with DEFAULT 'never' is safe on existing rows (no row locking beyond the ALTER TABLE).
-- Values: never | ok | partial | failed

-- AlterTable
ALTER TABLE "AccProject" ADD COLUMN "folderCrawlStatus" TEXT NOT NULL DEFAULT 'never';
