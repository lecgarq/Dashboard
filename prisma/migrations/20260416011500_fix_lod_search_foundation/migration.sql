CREATE EXTENSION IF NOT EXISTS vector;

UPDATE "LodFamily"
SET "possibleCategories" = ARRAY[]::TEXT[]
WHERE "possibleCategories" IS NULL;

ALTER TABLE "LodFamily"
ALTER COLUMN "possibleCategories" SET DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "LodFamily"
ALTER COLUMN "possibleCategories" SET NOT NULL;

UPDATE "LodGraphNode"
SET "neighbors" = ARRAY[]::INTEGER[]
WHERE "neighbors" IS NULL;

ALTER TABLE "LodGraphNode"
ALTER COLUMN "neighbors" SET DEFAULT ARRAY[]::INTEGER[];

ALTER TABLE "LodGraphNode"
ALTER COLUMN "neighbors" SET NOT NULL;

UPDATE "LodSearchCache"
SET "resultIds" = ARRAY[]::TEXT[]
WHERE "resultIds" IS NULL;

ALTER TABLE "LodSearchCache"
ADD COLUMN "encoderVersion" TEXT NOT NULL DEFAULT 'siglip-query-v1',
ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP + interval '24 hours';

ALTER TABLE "LodSearchCache"
ALTER COLUMN "resultIds" SET DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "LodSearchCache"
ALTER COLUMN "resultIds" SET NOT NULL;

CREATE INDEX "LodSearchCache_expiresAt_idx" ON "LodSearchCache"("expiresAt");

ALTER TABLE "LodEmbedding"
ADD COLUMN IF NOT EXISTS "pgvector" vector(768);

DELETE FROM "LodEmbedding"
WHERE "vector" IS NULL;

ALTER TABLE "LodEmbedding"
ALTER COLUMN "vector" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'LodEmbedding_vector_length_check'
  ) THEN
    ALTER TABLE "LodEmbedding"
    ADD CONSTRAINT "LodEmbedding_vector_length_check"
    CHECK ("vector" IS NULL OR cardinality("vector") = 768)
    NOT VALID;
  END IF;
END $$;
