# 41-03 Summary — Retired instance-embedding cleanup

## Shipped

- Proved `AccInstanceEmbedding` has no runtime consumer, then removed its Prisma
  model, create-only raw SQL, setup script, stale test doubles, and ERD block.
- Added and successfully applied the idempotent
  `2026-07-21-drop-acc-instance-embedding.sql` cleanup.
- Deleted the zero-importer access-analysis `SelectionContext`; retained every
  audited sidebar candidate with a current importer and preserved the dirty
  catalog trio unchanged.
- Corrected the activity-embedding ID contract to
  `"accds:" + accdsActivityId | AccActivity.id`.

## Deviation

- Direct source inspection found one additional stale `accInstanceEmbedding`
  mock in `acc-hot-cache.test.ts`; it was removed and added to the focused gate.

## Gates

- `npx prisma format` and `npx prisma generate`: **passed**.
- Focused Vitest: **2 files / 13 tests passed** (`acc-route-hydration`,
  `acc-hot-cache`).
- `npx tsc --noEmit`: **passed** (exit 0, no output).
- `node scripts/repo-map/check.cjs`: **passed** (existing non-blocking warnings:
  dependency-cruiser 1, ast-grep 231 against baseline).
- Retired-reference `rg`: **clean** outside the named drop SQL.
- Database cleanup: `prisma db execute`: **passed**.
- Commit: `c28cb962` (`refactor(activity): retire instance embeddings`).

## Preserved WIP

- `docs/erd.md` was partially staged: only the retired-model deletion entered
  the commit; the existing `AccActivityEmbedding` addition remains unstaged.
- `catalogTargets.ts`, `catalogTargets.test.ts`, and
  `dimensionCatalog.types.ts` remain untouched and unstaged.
