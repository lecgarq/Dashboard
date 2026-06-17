---
phase: 01-shared-design-foundation
plan: "01"
subsystem: css-tokens
status: complete
tags: [design-tokens, css, dark-mode, glow, glassmorphism]
requirements: [FND-01]

dependency_graph:
  requires: []
  provides:
    - "--glow-primary / --glow-accent in :root and .dark (indigo/violet glow tokens)"
    - "--depth-card / --depth-float shadow tokens in both themes"
    - "--glass-fill single theme-resolved token in both themes"
    - "--gradient-border in both themes"
    - "Dark --page-bg with indigo/violet ambient glow replacing neutral zinc blobs"
  affects:
    - "All pages consuming var(--glow-primary), var(--depth-card), var(--glass-fill), etc."
    - "Body background in dark mode (subtle indigo/violet pooling effect)"

tech_stack:
  added: []
  patterns:
    - "CSS custom properties with dual-theme block pattern (:root + .dark)"
    - "Indigo/violet accent family (99,102,241 → 139,92,246) as the glow color system"
    - "Radial-gradient page-bg with sub-8% alpha stops for glassmorphism backdrop"

key_files:
  modified:
    - path: "app/globals.css"
      change: "Added 6 depth/glow/glass tokens to both :root and .dark; swapped dark --page-bg to indigo/violet radial stops"

decisions:
  - "Used single --glass-fill token (not --glass-fill-light/--glass-fill-dark) — the value differs per theme block, which is the established pattern for --surface-1..3"
  - "Tokens kept in :root/.dark blocks (not @theme inline) — these are CSS-class-consumed values needing per-theme overrides; @theme inline requires static values (Pitfall 5)"
  - "All dark --page-bg glow stops held under 8% alpha so frosted glass has a real backdrop without the page reading as lit up"
  - "Light --page-bg left unchanged — existing blue/amber/teal radials are close enough to indigo family; a change there risks muddying light mode"

metrics:
  duration: "2m 40s"
  completed_date: "2026-06-17"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 1
---

# Phase 01 Plan 01: Depth/Glow/Glass Token Foundation Summary

**One-liner:** Six depth/glow/glass design tokens (indigo/violet family) added to both `:root` and `.dark` blocks in `app/globals.css`, plus the dark page background updated from neutral zinc radials to a subtle indigo/violet ambient glow at sub-8% opacity.

## What Was Built

Added the missing FND-01 token set to `app/globals.css`:

| Token | Light `:root` value | Dark `.dark` value |
|-------|--------------------|--------------------|
| `--glow-primary` | `0 0 24px -4px rgba(99,102,241,0.30)` | `0 0 24px -4px rgba(99,102,241,0.55)` |
| `--glow-accent` | `0 0 32px -8px rgba(139,92,246,0.22)` | `0 0 32px -8px rgba(139,92,246,0.45)` |
| `--depth-card` | `0 1px 3px rgba(0,0,0,0.06), 0 4px 16px -4px rgba(0,0,0,0.08)` | `0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 16px rgba(0,0,0,0.35)` |
| `--depth-float` | `0 8px 40px -8px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.08)` | `0 8px 40px -8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.07)` |
| `--glass-fill` | `rgba(255,255,255,0.62)` | `rgba(24,24,27,0.72)` |
| `--gradient-border` | `linear-gradient(135deg,rgba(255,255,255,0.22) 0%,rgba(255,255,255,0.04) 100%)` | `linear-gradient(135deg,rgba(255,255,255,0.10) 0%,rgba(255,255,255,0.02) 100%)` |

Dark `--page-bg` swapped from neutral-zinc radial blobs to indigo/violet ambient glow:
- Top-left: `rgba(99,102,241,0.06)` (indigo, 6%)
- Top-right: `rgba(139,92,246,0.04)` (violet, 4%)
- Bottom: `rgba(99,102,241,0.03)` (indigo, 3%)
- Base: `linear-gradient(180deg, #09090B 0%, #050507 100%)` (unchanged)

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add depth/glow/glass tokens to both themes | ef07c31 | app/globals.css |
| 2 | Swap dark page background to indigo/violet ambient glow | 9df1dee | app/globals.css |

## Verification

- All 6 tokens each appear exactly twice in `app/globals.css` (once in `:root`, once in `.dark`): confirmed.
- Dark `--page-bg` contains `rgba(99,102,241,...)` and `rgba(139,92,246,...)` stops: confirmed.
- Light `--page-bg` unchanged (blue/amber/teal radials intact): confirmed.
- `npx tsc --noEmit` exits 0 after both tasks: confirmed.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — pure CSS token additions, no UI components or data rendering paths introduced.

## Threat Flags

None — CSS-only token additions, no network endpoints, no user data, no trust boundaries crossed.

## Self-Check: PASSED

- `app/globals.css` exists and contains all 6 new tokens: FOUND
- Commit ef07c31 exists: FOUND
- Commit 9df1dee exists: FOUND
- `npx tsc --noEmit` exits 0: CONFIRMED
