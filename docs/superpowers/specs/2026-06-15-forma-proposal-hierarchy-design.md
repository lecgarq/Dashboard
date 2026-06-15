# Forma Proposal — Hierarchy view (multimodal) design spec

**Date:** 2026-06-15
**Status:** Approved (extends the shipped Forma Proposal tab) — pivoted after first build
**Branch:** feat/access-analysis-redesign

## Goal

Add a second **mode** to `/forma-proposal`: a premium organogram that visualizes a
**single role's folder permissions across the folder hierarchy**. Pick a role → the
folder tree renders as colored circular nodes (color = that role's effective tier on each
folder). Clicking a folder node sets/changes its tier for the role. Everything persists in
the existing client-side draft — never touches ACC.

> **Pivot note:** the first build mis-read the ask as a *role* org-chart (nest roles under
> each other). The real intent is a **folder** tree colored **by the selected role's
> permissions**. The role-nesting model (`lib/forma/hierarchy.ts`, draft `hierarchy` field,
> drag-to-reparent) was removed.

## Decisions

| Decision | Choice |
| --- | --- |
| Tree | the **folder** hierarchy (existing `FolderIndex`), not roles |
| Per-role | a **role picker** chooses which role's permissions to colour by (synced with the active role used in Permissions mode) |
| Node colour | the role's **effective tier** on that folder (`resolveEffectiveTier` → `TIER_COLOR`); dashed ring + italic when inherited |
| Edit | click a folder node → tier menu (set tier · apply-to-subtree · clear override) |
| Density | collapsible subtrees; default collapses below the roots' children so the first view is an overview; pan / zoom / fit |
| Visual | premium organogram — gradient discs, dashed halo, elbow connectors |
| Persistence | reuses the existing assignments in the draft; no new draft fields |
| ACC writes | **None** |

## Modules

| File | Responsibility |
| --- | --- |
| `…/components/ModeSwitch.tsx` | segmented `Permissions \| Hierarchy` control |
| `…/components/OrgNode.tsx` | one premium node (gradient disc coloured by tier + icon + label + tier sublabel) |
| `…/components/HierarchyView.tsx` | d3-hierarchy layout over **visible** folders, SVG elbow links, pan/zoom/fit, collapse/expand, role picker, click-node→tier menu |
| `…/components/FormaProposalClient.tsx` | `mode` state; passes the active role's `explicit` map + tier mutators |

Reuses existing pure, tested logic: `resolveEffectiveTier` / `applyToSubtree`
(`lib/forma/inheritance.ts`) and `TIER_COLOR` / `FORMA_TIERS` (`lib/forma/tiers.ts`). No new
pure module is needed — the folder structure and permission resolution already exist.

## Layout & interaction

- d3-hierarchy `stratify()` over a synthetic root + the currently-visible folders →
  `tree().nodeSize(...)`. Layout depends only on structure + collapse state, so changing a
  permission recolours without re-laying-out.
- Top-down; pan = drag background, zoom = wheel / buttons, **Fit** recenters.
- Each folder node: gradient disc coloured by the role's effective tier, dashed ring +
  "inherited" sublabel when the tier is inherited, a `+/−` toggle to collapse/expand.
- Click a node → dropdown: pick a tier, "Apply to subtree", or "Clear override".
- Role picker (top-left) switches which role is being coloured/edited.

## Scope boundaries (YAGNI)

- One synthetic root over the real folder roots (Project Files, Photos).
- Default collapse keeps the initial canvas readable; user expands on demand.
- No role org-chart / role nesting (removed).
