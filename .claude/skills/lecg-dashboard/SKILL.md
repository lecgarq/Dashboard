---
name: lecg-dashboard
description: Repository-native product, architecture, UI, and verification guidance for the LECG Dashboard.
last_verified: 2026-07-15
---

# LECG Dashboard Project Briefing

Use this briefing for planning, implementation, review, verification, and docs
in this repository. `AGENTS.md` is the operational workflow contract.

## Evidence order

1. Current user request and `git status --short`.
2. Relevant source files, callers, adjacent tests, and current diff.
3. `package.json`, `prisma/schema.prisma`, router composition, and config files.
4. `.tools/repo-map/architecture-summary.md` and focused repo-map artifacts for
   architecture, dependency, import, or data-flow questions.
5. Official documentation when external API behavior is still uncertain.

Do not invent paths, routes, procedures, models, environment variables,
packages, tests, or commands. Use `VERIFY:` for unresolved claims. Never read
secret-bearing files for research or documentation.

## Verified shape

- Node `>=22`, Next.js 16 App Router, React 19.
- tRPC request boundaries, Prisma, and PostgreSQL.
- Tailwind/shadcn-style UI, ECharts, and selective existing Three/R3F accents.
- Source roots: `app/`, `components/`, `lib/`, `server/`, `prisma/`, `scripts/`,
  and `services/lod-engine/`; there is no primary root `src/` tree.
- Core workshop surfaces: `/users`, `/access-analysis`, `/template-mty`, and
  `/forma-proposal`.

Verify exact versions, routes, procedures, and component locations from the
current tree before relying on them.

## Product constraints

- This is an internal BIM/VDC operational and workshop tool, not a generic SaaS
  product. Read `references/domain-lexicon.md` for ACC, Forma, MTY, and LOD
  language.
- Root `DESIGN.md` (tokens, type scale, spacing, motion budget, anti-patterns)
  and `PRODUCT.md` (audience, lane, anti-references) are the design authority
  for any UI work — read them before touching a visual surface. For design
  critique, polish, or redesign passes, use the `/impeccable` skill; its
  detector is the deterministic anti-slop gate.
- New analytics must be derivable from a verified existing source. Label
  inferred, missing, stale, or under-covered data honestly.
- Keep data surfaces inspectable and GPU-light. Do not add WebGL to analytics
  pages unless the user explicitly changes scope.
- Preserve zinc-based semantic theming and resolved theme colors in charts.
- Prefer dense, scannable hierarchy, restrained depth, precise spacing, useful
  empty/error states, responsive fit, and reduced-motion support.
- Avoid marketing heroes, decorative gradients, card-inside-card layouts,
  theme drift, fake metrics, and ornamental motion.

## Architecture defaults

- Route composition and page shells: `app/`.
- Reusable UI: `components/`, using existing primitives first.
- Shared transforms, domain logic, integrations, and server helpers: `lib/` or
  another verified existing shared directory.
- Request and database boundaries: `server/routers/` and server-only helpers.
- Keep reusable UI independent from Prisma and route internals.
- For risky refactors, characterize current behavior before splitting modules.
- For bugs, trace sibling callers and fix the narrowest shared root cause.

See `references/known-patterns.md` for currently documented shared UI and tRPC
patterns, but verify entries against source when exactness matters.

## Planning and execution

- Name exact files, user-visible outcomes, data authority, and runnable checks.
- If the target is not yet known, include the discovery command instead of a
  placeholder such as `src/...`.
- Prefer a vertical slice with the fewest real files over framework scaffolding.
- Reuse helpers, types, query patterns, components, and dependencies already in
  the repository.
- Preserve unrelated dirty-tree work and avoid drive-by cleanup.
- Do not fake fixtures, sources, routes, or configuration to satisfy a plan.

## Verification

Use `references/dashboard-verification-sequence.md` to select the smallest
sufficient gate set.

- Focused tests should cover changed behavior, not merely implementation lines.
- Run `npx tsc --noEmit` for application code and before every build.
- Run `node scripts/repo-map/check.cjs` for import, shared-boundary, router,
  Prisma, architecture, or broad refactor changes.
- For UI/data changes, check theme resolution, data labels, loading/empty/error
  states, responsive fit, reduced motion, and the no-new-WebGL rule.
- Treat existing failures as a baseline and report them separately; do not hide
  new regressions behind them.
- Follow `references/deploy-sequence.md` for any local production rebuild —
  either an explicit request or the `autoDeploy` phase-completion path defined
  in `references/lecg-workflow-conventions.md`.

## Output

Lead with the result. Cite exact files and commands actually checked. Clearly
separate passed evidence, skipped checks, pre-existing failures, and remaining
`VERIFY:` items. Never claim deploy, release, UAT, performance, or owner
approval without direct evidence.
