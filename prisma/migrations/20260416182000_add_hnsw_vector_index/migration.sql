-- Create HNSW index for high-performance vector search
-- m=16, ef_construction=64 are defaults that provide a good balance for 768-dim SigLIP vectors
CREATE INDEX IF NOT EXISTS "LodEmbedding_pgvector_hnsw_idx" ON "LodEmbedding" USING hnsw ("pgvector" vector_cosine_ops);
