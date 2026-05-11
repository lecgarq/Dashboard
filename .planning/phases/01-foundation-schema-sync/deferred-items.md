# Phase 01 — Deferred Items

Out-of-scope discoveries surfaced during execution. NOT fixed in this phase.

## 2026-05-11 — Pre-existing schema drift on `LodEmbedding.pgvector`

**Surfaced during:** Plan 01-01 Task 2 (running `prisma migrate dev --create-only` for additive ACC v2.0 schema).

**Observation:** Prisma reported:
> ⚠️  You are about to drop the column `pgvector` on the `LodEmbedding` table, which still contains 24619 non-null values.

The column `pgvector` exists in the live Postgres (Supabase) database but is NOT modeled in `prisma/schema.prisma`. This is a pre-existing drift from a previous Phase 1 / LOD work cycle — not caused by ACC v2.0 changes.

**Why deferred:** Per executor scope-boundary rule, only issues DIRECTLY caused by the current task's changes are auto-fixed. The drift is pre-existing and unrelated to SCHEMA-01/02.

**Workaround used in 01-01:** Generated the migration SQL via `prisma migrate diff --from-schema <pre-task-1> --to-schema <post-task-1>` (purely additive diff) and applied via `prisma migrate deploy`, bypassing `migrate dev`'s interactive reconciliation. The drift column is untouched.

**Suggested follow-up:** Either (a) add `pgvector` field to `LodEmbedding` model in a future phase, or (b) intentionally drop the column in a dedicated cleanup migration with stakeholder sign-off. Do not let `migrate dev` "fix" it silently.
