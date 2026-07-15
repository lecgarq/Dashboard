# Dashboard Verification Sequence

Use the narrowest tier that covers your change. Every tier includes the tier
above it.

## Minimal — every change

```powershell
npx tsc --noEmit
```

## Standard — architecture, shared modules, import changes

```powershell
npx tsc --noEmit
npm test -- path/to/changed-or-adjacent.test.ts
npm run repo-map:check
```

## Full — UI/workshop page changes

```powershell
npx tsc --noEmit
npm test -- path/to/changed-or-adjacent.test.ts
npm run repo-map:check
npm run test:e2e -- tests/e2e/<target>.spec.ts
node scripts/uat/run-engineering-gates.cjs
```

## Rebuild — deploying to :3000

Follow `.claude/skills/lecg-dashboard/references/deploy-sequence.md`.

## When to use which tier

| Change type | Tier |
|-------------|------|
| Docs, comments, planning files | None |
| Single file fix, config tweak | Minimal |
| Shared lib, tRPC router, Prisma query | Standard |
| Component, chart, page layout, theme | Full |
| Ready to serve on :3000 | Rebuild |

## Repo-map refresh

If `.tools/repo-map/` artifacts are stale or missing, refresh first:

```powershell
npm run repo-map          # full regeneration
npm run repo-map:check    # ratchet check against baselines
```

Current baselines (2026-06-19): 0 circulars, 0 dependency errors, 6 baseline
dependency warnings, 0 new blocking AST findings.

## UAT engineering gates

`node scripts/uat/run-engineering-gates.cjs` wraps:
- TypeScript (`npx tsc --noEmit`)
- Boundary diff
- GraphCanvas grep
- Fetch-once behavior
- Canvas count
- Reduced motion
- Overflow at 1280px
- WCAG contrast
- Screenshots
- Drill smoke checks
