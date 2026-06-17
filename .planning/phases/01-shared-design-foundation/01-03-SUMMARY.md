---
phase: "01"
plan: "03"
subsystem: "shared-ui-primitives"
status: complete
tags: [premium-surface, card-primitive, css-tokens, rsc-safe, tdd]
dependency_graph:
  requires: ["01-01"]
  provides: ["FND-02"]
  affects: ["all per-page phases 2-6"]
tech_stack:
  added: []
  patterns: ["variant-map pattern", "cn() class composition", "RSC-safe component", "TDD red/green"]
key_files:
  created:
    - components/ui/PremiumSurface.tsx
    - components/ui/__tests__/PremiumSurface.test.tsx
  modified: []
decisions:
  - "Default variant set to 'base' per RESEARCH Open Question 1 recommendation"
  - "glow prop appends shadow-[var(--glow-primary)] and only fires when glow=true — never a global wash (per CONTEXT)"
  - "inset variant uses shadow-[var(--depth-inset,inset_0_2px_8px_rgba(0,0,0,0.08))] with CSS var fallback since --depth-inset is not yet in globals.css"
  - "float/glass/inset all use rounded-xl; base keeps panel-elevated's own 22px radius"
  - "No 'use client' directive — pure CSS composition, RSC-safe"
metrics:
  duration: "2m 49s"
  completed_date: "2026-06-17"
  tasks_completed: 1
  tasks_total: 1
  commits: 2
---

# Phase 01 Plan 03: PremiumSurface Primitive Summary

**One-liner:** RSC-safe card primitive with base/float/glass/inset variants + opt-in glow accent using FND-01 CSS tokens from plan 01.

## What Was Built

`components/ui/PremiumSurface.tsx` — a single React wrapper exposing four depth variants and an optional indigo glow, implementing the "author once, inherit everywhere" surface carrier from the CONTEXT decision (balanced premium: layered shadow + catch-light, frosted glass, glow only on selected elements).

### Variant Implementation

| Variant | Classes Applied | Token Source |
|---------|----------------|--------------|
| `base` (default) | `panel-elevated` | globals.css `.panel-elevated` (catch-light ::after + dual-theme shadow) |
| `float` | `shadow-[var(--depth-float)] backdrop-blur-sm bg-card rounded-xl` | `--depth-float` from FND-01 |
| `glass` | `bg-surface-2 border border-surface-border backdrop-blur-md rounded-xl` | `--surface-2` / `--surface-border` from FND-01 |
| `inset` | `shadow-[var(--depth-inset,...)] bg-muted/30 rounded-xl` | CSS var + fallback |
| `glow` prop | `shadow-[var(--glow-primary)]` | `--glow-primary` from FND-01 |

Root always carries `relative` so `.panel-elevated::after` catch-light pseudo renders within bounds.

## TDD Gate Compliance

RED commit: `46fb59b` — `test(01-03): add failing test for PremiumSurface 4 variants + glow` (13 failing tests)

GREEN commit: `097c8a9` — `feat(01-03): implement PremiumSurface primitive — 4 variants + optional glow` (13 passing tests)

REFACTOR: Not required — implementation was clean on first pass.

## Verification

- `npx vitest run components/ui/__tests__/PremiumSurface.test.tsx`: 13/13 passed
- `npx tsc --noEmit` (PremiumSurface files): 0 errors
- Note: Pre-existing tsc errors in `EChart.test.tsx` and `motion.test.tsx` (untracked WIP from concurrent session's plan 02 and plan 04) are out of scope for this plan and pre-date it.

## Deviations from Plan

### Auto-handled: --depth-inset token not in globals.css

**Rule 2 (missing critical functionality):** The plan specified `inset` variant should use `--depth-inset` token, but this token does not exist in `globals.css` (only `--depth-card` and `--depth-float` are defined in FND-01). Rather than hardcoding a literal shadow value (violating the "no hardcoded hex" rule) or leaving a broken CSS var reference, the implementation uses `shadow-[var(--depth-inset,inset_0_2px_8px_rgba(0,0,0,0.08))]` with a CSS fallback. This is semantically correct: when `--depth-inset` is added to globals.css in a future plan, the fallback is automatically superseded.

None — plan executed as specified with the above adaptation.

## Known Stubs

None — this is a pure presentational primitive. No data sources, no wired props beyond variant/glow/className/children.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Pure presentation component — threat model unchanged from plan specification.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `components/ui/PremiumSurface.tsx` | FOUND |
| `components/ui/__tests__/PremiumSurface.test.tsx` | FOUND |
| `.planning/phases/01-shared-design-foundation/01-03-SUMMARY.md` | FOUND |
| Commit `46fb59b` (RED) | FOUND |
| Commit `097c8a9` (GREEN) | FOUND |
