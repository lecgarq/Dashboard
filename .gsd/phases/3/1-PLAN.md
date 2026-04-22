---
phase: 3
plan: 1
wave: 1
---

# Plan 3.1: Spatial Canvas Foundation

## Objective
Install the `tldraw` SDK and create the initial Tiptap node extension to allow embedding a whiteboard block into the wiki.

## Context
- .gsd/SPEC.md
- .gsd/phases/3/RESEARCH.md
- components/clash/WikiEditor.tsx

## Tasks

<task type="auto">
  <name>Install tldraw and peer dependencies</name>
  <files>package.json</files>
  <action>
    Install `tldraw` and its necessary peer dependencies for React 19 compatibility.
    Note: Ensure version compatibility with Next.js 15/16.
  </action>
  <verify>npm list tldraw</verify>
  <done>tldraw is present in package.json.</done>
</task>

<task type="auto">
  <name>Create SpatialCanvas Tiptap Node</name>
  <files>
    components/clash/wiki-editor/canvas-node/canvas-extension.ts
    components/clash/wiki-editor/canvas-node/canvas-view.tsx
  </files>
  <action>
    1. Implement a `Node` extension named `spatialCanvas`.
    2. Use `ReactNodeViewRenderer` to render the canvas.
    3. The node should store an `id` attribute to link with its specific Yjs state.
    4. Implement a placeholder "Loading Canvas..." UI in `canvas-view.tsx`.
  </action>
  <verify>Check for file existence and basic TypeScript compilation.</verify>
  <done>Extension is registered in WikiEditor and renders a placeholder block.</done>
</task>

## Success Criteria
- [ ] `tldraw` library is installed.
- [ ] A new block type can be manually inserted (via code) into the editor and renders its view component.
