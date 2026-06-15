# Forma Proposal — Hierarchy view (multimodal) design spec

**Date:** 2026-06-15
**Status:** Approved (extends the shipped Forma Proposal tab)
**Branch:** feat/access-analysis-redesign

## Goal

Add a second **mode** to `/forma-proposal`: a premium, editable **role organogram**.
The user arranges a custom reporting hierarchy by dragging roles under one another;
nodes show per-role folder coverage; clicking a role jumps to its permission editor.
Everything persists in the existing client-side draft — never touches ACC.

## Decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Structure | **Custom org chart** the user arranges (role → parent), not category-derived |
| Connected | **Yes** — click a node → Permissions mode w/ that role active; nodes show coverage |
| Visual | **Premium organogram** — layered discs, dashed halo, depth colors, elbow links |
| Default | **Flat** (all roles top-level under a synthetic root); user drags to build |
| Persistence | new optional `hierarchy` map in the localStorage draft (back-compatible) |
| ACC writes | **None** |

## Data model

Add to `FormaDraft` (optional, back-compatible — existing v1 drafts default to flat):

```ts
// roleId → parentId (another roleId) or null = top-level (under synthetic root)
hierarchy?: Record<string, string | null>;
```

A custom org chart is a **tree**, so re-parenting must reject any move where the new
parent is the node itself or one of its descendants (cycle prevention).

## Modules

| File | Responsibility | Tested |
| --- | --- | --- |
| `lib/forma/hierarchy.ts` | pure: `normalizeHierarchy`, `isDescendant`, `canReparent`, `reparent`, `toOrgInput` (synthetic root + (id,parentId) list), `coverageByRole` | unit (TDD) |
| `lib/forma/draftStorage.ts` | add optional `hierarchy`; `emptyDraft` seeds `{}`; `parseDraft` tolerates missing | unit |
| `…/components/useFormaDraft.ts` | `hierarchy` in state; `setParent` (cycle-checked); `deleteRole` re-parents orphans to top; `reset` clears | — |
| `…/components/ModeSwitch.tsx` | segmented `Permissions | Hierarchy` control | — |
| `…/components/OrgNode.tsx` | one premium node (disc + dashed halo + depth color + icon + label + coverage chip) | — |
| `…/components/HierarchyView.tsx` | d3-hierarchy layout (`stratify`+`tree`), SVG elbow links, pan/zoom, drag-to-reparent, click-to-edit | — |
| `…/components/FormaProposalClient.tsx` | `mode` state; render switch; wire select + reparent | — |

## Layout & rendering

- Layout via `d3-hierarchy`: `stratify()` over `toOrgInput()` → `tree().nodeSize(...)`.
  Top-down (root at top), matching the reference; falls back to scroll/zoom when wide.
- Render in an HTML "world" layer with `transform: translate(pan) scale(zoom)`;
  connector elbows drawn in an absolute SVG layer behind the nodes.
- **Depth colors:** root = rose, depth 1 = amber, depth ≥ 2 = teal (the reference palette),
  theme-aware backgrounds.
- **Coverage:** each node shows `countExplicit(assignments[roleId])` of total folders.

## Interactions

- **Pan** = drag canvas background; **zoom** = wheel (clamped ~0.4–1.6); **Fit** button.
- **Drag a role onto another** → re-parent (validated by `canReparent`); drop on empty
  canvas / "top level" zone → parent = null. Invalid drops are ignored with no change.
- **Click a role** (no drag) → switch to Permissions mode, that role active.

## Also

A light "better-looking" refinement pass on the existing Permissions view (spacing,
hover, node treatment) as part of the same iteration.

## Scope boundaries (YAGNI)

- Synthetic root is fixed ("Roles"); not editable.
- No auto-layout/category-seed in v1 (optional "tidy by category" deferred).
- Hierarchy is role-only (no group scaffolding nodes).
