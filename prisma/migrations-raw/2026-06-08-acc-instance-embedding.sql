CREATE TABLE IF NOT EXISTS "AccInstanceEmbedding" (
  "nodeId"        TEXT PRIMARY KEY,
  "x"             REAL NOT NULL,
  "y"             REAL NOT NULL,
  "neighbors"     JSONB NOT NULL DEFAULT '[]',
  "embeddingRunId" TEXT NOT NULL,
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "AccInstanceEmbedding" ADD COLUMN IF NOT EXISTS "cluster" INTEGER;
