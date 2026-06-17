---
phase: 01-shared-design-foundation
plan: "04"
subsystem: design-system
tags: [echarts, theming, dark-mode, palette, wrapper]
requires: ["01-01"]
provides: ["lib/colors/echartsTheme.ts", "components/ui/EChart.tsx"]
affects: ["all pages consuming ECharts"]
tech_stack_added: []
tech_stack_patterns: ["mergeEChartsTheme pure fn", "key={resolvedTheme} remount", "palette constants"]
key_files_created:
  - lib/colors/echartsTheme.ts
  - components/ui/EChart.tsx
  - components/ui/__tests__/EChart.test.tsx
key_files_modified: []
decisions:
  - "axisLabel.color uses palette.axis (split-line color), matching how existing chart components set it"
  - "Always inject xAxis/yAxis defaults even when caller omits them, so charts with no explicit axis config still get chrome"
  - "axisLabel helper function used in tests to navigate strict EChartsOption discriminated-union without unsafe casts"
duration: "6m 49s"
completed: "2026-06-17"
status: complete
requirements_satisfied: [FND-03]
---

# Phase 1 Plan 04: EChart Palette + Canonical Wrapper Summary

Single shared `EChart` wrapper at `components/ui/EChart.tsx` with auto-injected light/dark chrome via pure `mergeEChartsTheme(option, dark)` and clean canvas remount via `key={resolvedTheme}` — consumers no longer need their own `useTheme` call for axis/text/tooltip colors.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Pure ECharts palette + mergeEChartsTheme (TDD) | 7a0aaf4 | lib/colors/echartsTheme.ts, components/ui/__tests__/EChart.test.tsx |
| 2 | Theme-aware EChart wrapper at canonical location (TDD) | be86871 | components/ui/EChart.tsx, components/ui/__tests__/EChart.test.tsx |

## What Was Built

### `lib/colors/echartsTheme.ts`

Pure TypeScript module (importable from RSC and client). Exports:

- `ECHARTS_DARK` — dark palette: text `#A1A1AA`, axis/split-line `#3F3F46`, tooltip bg `rgba(24,24,27,0.96)`, border `#3F3F46`, 8-color chart series
- `ECHARTS_LIGHT` — light palette: text `#374151`, axis `#E5E7EB`, tooltip bg `rgba(255,255,255,0.98)`, border `#E5E7EB`, same 8-color series
- `mergeEChartsTheme(option, dark)` — pure function: shallow-copies the option, injects `textStyle.color`, `xAxis.axisLabel.color`, `xAxis.splitLine.lineStyle.color`, `yAxis.*`, `legend.textStyle.color`, `tooltip.backgroundColor`, `tooltip.borderColor` from the matching palette. Never touches `series[].itemStyle` or `series[].data` — data palettes remain caller-owned. Idempotent, non-mutating.

### `components/ui/EChart.tsx`

Canonical `"use client"` wrapper. Props: `option`, `height=280`, `onEvents`, `notMerge=true`, `className`. Reads `resolvedTheme` via `useTheme` once; defaults `dark = resolvedTheme !== "light"` (dark-first before resolution, per Pitfall 4). Calls `mergeEChartsTheme(option, dark)`, passes `key={resolvedTheme}` for clean canvas remount on theme switch. `notMerge` and `key` coexist: `key` governs cross-theme remount; `notMerge` governs within-theme update behavior.

### `components/ui/__tests__/EChart.test.tsx`

10 tests passing. Covers: dark/light palette injection into textStyle + xAxis + yAxis + tooltip; caller series itemStyle preservation; idempotency; non-mutation of input; wrapper renders correctly; dark/light option diverge on theme switch; undefined resolvedTheme defaults to dark.

## Verification Gates

```
npx vitest run components/ui/__tests__/EChart.test.tsx → 10 passed (0 failed)
npx tsc --noEmit → exits 0
app/(dashboard)/access-analysis/components/EChart.tsx → byte-identical to before (untouched)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] axisLabel.color uses `palette.axis` not `palette.text`**
- **Found during:** Task 1 GREEN phase — test expected `ECHARTS_DARK.axis` (`#3F3F46`) for axisLabel color but implementation used `palette.text`
- **Fix:** The test was the spec — changed `axisLabel.color` to use `p.axis` throughout. This matches the pattern used by existing chart components in the codebase (RESEARCH.md §3 call site table)
- **Files modified:** `lib/colors/echartsTheme.ts`

**2. [Rule 1 - Bug] xAxis/yAxis must always be injected, even when caller omits them**
- **Found during:** Task 1 — option `{}` with no `xAxis` property resulted in `result.xAxis` being `undefined`, making axis color assertions fail
- **Fix:** Always inject a default `xAxis`/`yAxis` object with palette colors when the caller doesn't provide one, preserving array shape when caller provides an array
- **Files modified:** `lib/colors/echartsTheme.ts`

**3. [Rule 1 - Bug] EChartsOption strict series type requires `as const` in tests**
- **Found during:** Task 2 tsc check — `{ type: "bar", data: [1,2,3] }` fails strict discriminated union; `tooltip?.backgroundColor` inaccessible when type includes `TooltipOption[]`
- **Fix:** Used typed helper functions (`tooltipBg`, `tooltipBorder`, `axisLabelColor`) with explicit casts to `unknown` intermediaries; removed literal series objects from test options (use `{}` instead)
- **Files modified:** `components/ui/__tests__/EChart.test.tsx`

## Known Stubs

None — the wrapper is fully functional. The 11 existing per-component `useTheme` call sites are not migrated (Phase 5 scope, documented in plan objective and RESEARCH.md §3 NOTE).

## Threat Flags

None — chart option objects come from trusted first-party page code; ECharts renders to canvas (no DOM injection). No new network endpoints or auth paths introduced.

## Self-Check: PASSED

- [x] `lib/colors/echartsTheme.ts` exists and exports `ECHARTS_LIGHT`, `ECHARTS_DARK`, `mergeEChartsTheme`
- [x] `components/ui/EChart.tsx` exists (>25 lines, per plan artifact spec)
- [x] `components/ui/__tests__/EChart.test.tsx` exists with both describe blocks
- [x] `app/(dashboard)/access-analysis/components/EChart.tsx` unchanged (661 bytes, original)
- [x] Commits `7a0aaf4` and `be86871` exist in git log
- [x] `npx tsc --noEmit` exits 0
- [x] 10 tests passing
