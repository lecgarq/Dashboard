---
name: no-prisma-in-ui
verification_command: "rg -l \"from ['\\\"]@prisma/client\" components/ app/ --include '*.tsx' --include '*.ts' | grep -v '.test.' | grep -v '__tests__' && echo 'FAIL: direct Prisma import in UI layer' && exit 1 || true"
---

# No Direct Prisma in UI

UI components (`components/`, `app/` route files) must not import directly from
`@prisma/client`. Database access belongs in `server/routers/`, `lib/`, or
server-side helpers.

## Rule

- `components/**/*.{ts,tsx}` must never import from `@prisma/client`.
- `app/**/*.{ts,tsx}` must not import from `@prisma/client` in client components
  or shared modules. Server-only route handlers (`route.ts`) and RSC loaders
  (`page.tsx` server portions) are the boundary — they should call tRPC or
  server helpers, not Prisma directly.

## Current Baseline

One known baseline finding exists in
`app/(dashboard)/access-analysis/coordinationActions.ts`. This is tracked in
`.planning/codebase/CONCERNS.md` and repo-map baselines. Do not add new ones.

## Verification

```bash
rg -l "from ['\"]@prisma/client" components/ app/ --include '*.tsx' --include '*.ts' \
  | grep -v '.test.' | grep -v '__tests__'
```

New matches beyond the baseline = violation.
