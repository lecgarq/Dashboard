-- Additive lookup table: resolves AccIssue.issueTypeId / issueSubtypeId GUIDs to
-- human-readable names. Populated by scripts/acc-issue-types-backfill.cjs.
-- Applied via raw SQL (not `prisma migrate dev`) because the shadow-DB migration
-- history chokes on the pre-existing pgvector extension requirement from
-- 20260416011500_fix_lod_search_foundation (P3018, "extension vector is not
-- available") — same standing guardrail documented in STATE.md and the two
-- precedent files in this directory.
CREATE TABLE IF NOT EXISTS "AccIssueType" (
  "id"           TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "kind"         TEXT NOT NULL,
  "parentTypeId" TEXT,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccIssueType_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AccIssueType_kind_idx" ON "AccIssueType" ("kind");
CREATE INDEX IF NOT EXISTS "AccIssueType_parentTypeId_idx" ON "AccIssueType" ("parentTypeId");
