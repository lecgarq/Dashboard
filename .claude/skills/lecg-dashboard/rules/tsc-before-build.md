---
name: tsc-before-build
verification_command: "echo 'Manual gate: verify npx tsc --noEmit was run before npm run build'"
---

# TypeScript Check Before Build

`next build` typechecks the entire tree including test files (no
`ignoreBuildErrors`). A tsc error blocks the `:3000` deploy build. Always run
`npx tsc --noEmit` as a fast pre-check before any full build.

## Rule

Before running `npm run build` or `next build`:

1. Run `npx tsc --noEmit`
2. Fix any errors
3. Only then proceed to `npm run build`

## Why

`npx tsc --noEmit` runs in ~8 seconds vs. the full build's ~45 seconds. It
catches type errors without generating build artifacts or risking a partial
`.next` output that could break the running app.

## See Also

- `references/deploy-sequence.md` — full deploy flow
- `references/dashboard-verification-sequence.md` — tiered verification
