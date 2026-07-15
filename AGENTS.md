# LECG Dashboard Agent Workflow

This is the repository-wide contract for coding agents. Keep work grounded in
the current tree; no external workflow framework is required.

## Before changing anything

- Run `git status --short` and preserve unrelated edits and deletions.
- Find the real call path with `rg`, `git ls-files`, tests, `package.json`,
  `prisma/schema.prisma`, and `.tools/repo-map/` before naming files or APIs.
- For a bug, inspect every caller of the shared function and fix the root cause
  once at the narrowest shared boundary.
- Never read or reproduce `.env*`, credentials, tokens, or secret values.
- Mark useful claims that cannot yet be proved as `VERIFY:`.

## Implementation workflow

1. State the intended user-visible outcome and the smallest affected surface.
2. Reuse existing helpers, components, types, routes, and installed packages.
3. Make the smallest complete diff; avoid drive-by cleanup, speculative
   abstractions, dependency churn, and broad rewrites.
4. Add or update one focused regression check for non-trivial behavior.
5. Inspect the final diff for scope drift before reporting completion.

If committing, stage only explicit paths and inspect
`git diff --cached --name-only`; never use bulk staging on this WIP-heavy tree.

Do not run parallel edits against overlapping files. Before merging worktrees or
branches, confirm the current repository root and branch. Never use destructive
git commands to discard a dirty tree.

## Verification

Use the narrowest gate that proves the change:

- Docs or comments: inspect the diff; no build required.
- Logic or bug fix: run the nearest focused Vitest test.
- Application code: run the focused test and `npx tsc --noEmit`.
- Imports, shared modules, routers, Prisma, or architecture: also run
  `node scripts/repo-map/check.cjs`; regenerate with `npm run repo-map:check`
  only when the map is stale.
- UI/workshop behavior: add the relevant Playwright or engineering gate when
  it materially exercises the changed behavior.

Report pre-existing failures separately from regressions. Never claim a test,
build, deploy, route, or UAT passed without concrete output.

Before `npm run build`, always run `npx tsc --noEmit`. A local production
rebuild must stop the `LECG Dashboard Local` scheduled task and free port 3000
before building, then restart it and probe the changed route. See
`.claude/skills/lecg-dashboard/references/deploy-sequence.md`.

## Repository boundaries

- Runtime: Node 22+, Next.js 16 App Router, React 19, tRPC, Prisma/PostgreSQL.
- Real source roots are `app/`, `components/`, `lib/`, `server/`, `prisma/`,
  `scripts/`, and `services/`; do not invent a root `src/` tree.
- Route composition belongs in `app/`, reusable UI in `components/`, shared
  logic in `lib/`, and request/database boundaries in `server/routers/`.
- UI components must not access Prisma directly.
- New analytics must come from a verified existing source and disclose missing
  or under-covered data instead of hiding it.
- Preserve zinc-based semantic theming. ECharts colors must resolve from the
  active theme.
- Do not add WebGL to analytics/data surfaces. Existing 3D use is limited to
  already-approved accents unless the user explicitly changes scope.
- Preserve reduced-motion behavior, useful empty/error states, responsive fit,
  and the established dense operational-dashboard style.

## Product behavior

Treat the user as the product owner and workshop presenter. Optimize for fast
comprehension, truthful ACC/Forma/MTY data, credible demos, and low-risk local
delivery—not generic SaaS or marketing patterns.

For terse prompts, inspect the current code and diff, state one short working
assumption, and proceed with the highest-leverage scoped interpretation. Ask a
question only when the answer would materially change product scope, data
authority, visual taste, or deploy behavior.

## Completion

Lead with the outcome. Name changed files, checks actually run, and any
remaining `VERIFY:` item or blocker. Do not invent release, deployment,
performance, or owner-approval evidence.

Detailed domain and UI guidance lives in
`.claude/skills/lecg-dashboard/SKILL.md`.
