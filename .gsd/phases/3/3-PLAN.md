---
phase: 3
plan: 3
wave: 2
---

# Plan 3.3: Canvas UX & Entry Points

## Objective
Add the user-facing controls to insert spatial canvas blocks and refine the visual integration with the rest of the wiki.

## Context
- components/clash/wiki-editor/extensions/slash-menu.ts
- components/clash/wiki-editor/canvas-node/canvas-view.tsx

## Tasks

<task type="auto">
  <name>Add /canvas Slash Command</name>
  <files>components/clash/wiki-editor/extensions/slash-menu.ts</files>
  <action>
    Add a "Canvas" or "Whiteboard" option to the slash menu.
    When clicked, it should insert a `spatialCanvas` node with a unique generated ID.
  </action>
  <verify>Open slash menu in browser and confirm "Canvas" option exists.</verify>
  <done>Users can insert a new whiteboard via the slash menu.</done>
</task>

<task type="auto">
  <name>Refine Canvas Styling & Controls</name>
  <files>components/clash/wiki-editor/canvas-node/canvas-view.tsx</files>
  <action>
    1. Set a default height for the canvas block (e.g., 500px).
    2. Add a border and rounded corners consistent with the "Notion-style" layout.
    3. Ensure the `tldraw` UI (toolbar/sidebar) is properly themed or minimized to fit the wiki context.
  </action>
  <verify>Visual inspection of the canvas block within a wiki page.</verify>
  <done>Canvas looks premium and integrated with the document flow.</done>
</task>

## Success Criteria
- [ ] Users can insert whiteboards using `/canvas`.
- [ ] Whiteboards are properly sized and styled within the document container.
