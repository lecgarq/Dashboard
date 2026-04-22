---
phase: 3
plan: 2
wave: 1
---

# Plan 3.2: Collaborative Drawing Sync

## Objective
Enable real-time collaboration within the `SpatialCanvas` block by wiring the `tldraw` store to the existing Yjs `ydoc`.

## Context
- .gsd/phases/3/RESEARCH.md
- components/clash/wiki-editor/yjs-provider.ts
- components/clash/wiki-editor/canvas-node/canvas-view.tsx

## Tasks

<task type="auto">
  <name>Implement Yjs-tldraw Adapter</name>
  <files>components/clash/wiki-editor/canvas-node/yjs-adapter.ts</files>
  <action>
    1. Create a helper to connect a `tldraw` store to a Yjs fragment.
    2. Ensure cursors (awareness) are synced specifically for the canvas area.
    3. Use the `id` from the node attributes to scope the Yjs storage (e.g., `ydoc.getMap('canvas-' + id)`).
  </action>
  <verify>Check for adapter logic and cursor sync exports.</verify>
  <done>Adapter is ready to be used by the React component.</done>
</task>

<task type="auto">
  <name>Connect Canvas to Yjs Provider</name>
  <files>components/clash/wiki-editor/canvas-node/canvas-view.tsx</files>
  <action>
    1. Import the `Tldraw` component from `tldraw`.
    2. Pass the scoped Yjs fragment/map to the adapter.
    3. Ensure the canvas respects the `editable` state of the editor.
  </action>
  <verify>Manually verify with two browser tabs (mocking ydoc if needed during unit test).</verify>
  <done>Drawing in one canvas block appears in the other in real-time.</done>
</task>

## Success Criteria
- [ ] Multi-user drawing is functional within a single canvas block.
- [ ] Cursors are visible and synced within the canvas boundaries.
