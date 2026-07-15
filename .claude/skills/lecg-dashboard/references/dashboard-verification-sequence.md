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
npx impeccable detect "app/(dashboard)/<area>" components/<area> --json
```

Design gate: `impeccable detect` runs deterministic anti-slop rules over the
source (TSX/CSS regex mode; root `DESIGN.md`/`PRODUCT.md` are the taste
contract it loads). Fix new findings; baseline deliberate exceptions in
`.impeccable/config.json` (`detector.ignoreRules`/`ignoreFiles`/
`ignoreValues`) or inline `impeccable-disable` comments — never by deleting
the gate. A PostToolUse hook (machine-local, `settings.local.json`) also
checks UI edits live during execution.

URL mode (`npx impeccable detect http://...`) adds structural DOM checks
(nested cards, hero patterns) but authenticated dashboard routes redirect it
to the login shell — it is only meaningful against public pages, or saved
rendered HTML dumped by a Playwright session.

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
