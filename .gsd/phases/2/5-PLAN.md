---
phase: 2
plan: 5
wave: 1
gap_closure: true
---

# Plan 2.5: Phase 2 Stabilization & UX Gap Closure

## Objective
Address critical performance, sync, and UX issues identified during the Phase 2 audit.

## Context
- `scripts/yjs-server.cjs`
- `components/clash/WikiEditor.tsx`
- `components/clash/wiki-editor/table-node/styles/table-overrides.css`

## Tasks

<task type="auto">
  <name>Fix Sync Overwrite & Add Loading Overlay</name>
  <files>components/clash/WikiEditor.tsx</files>
  <action>
    - Introduce an `isSyncing` state variable.
    - Show a centered "Connecting to collaboration session..." overlay with a spinner while `!collabSession || !isSynced`.
    - Disable the editor input surface until sync is complete.
    - Refactor `handleSync` to avoid `setContent` if there's any chance of overwriting active peer content.
  </action>
  <verify>grep "isSyncing" components/clash/WikiEditor.tsx</verify>
  <done>Editor is gated by a loading state, preventing race conditions during initial sync.</done>
</task>

<task type="auto">
  <name>Repair Table Grid Lines & Menu Positioning</name>
  <files>
    - components/clash/wiki-editor/table-node/styles/table-overrides.css
    - components/clash/WikiEditor.tsx
  </files>
  <action>
    - Update CSS to ensure `table`, `td`, and `th` have visible `border: 1px solid var(--border)`.
    - Fix the BubbleMenu/TableMenu positioning logic in `WikiEditor.tsx`.
  </action>
  <verify>grep "border" components/clash/wiki-editor/table-node/styles/table-overrides.css</verify>
  <done>Tables have visible grid lines and the context menu appears near the selected cell.</done>
</task>

<task type="auto">
  <name>Implement "Infinite" Scrolling Layout</name>
  <files>components/clash/WikiEditor.tsx</files>
  <action>
    - Remove fixed height constraints on the editor surface.
    - Center the `.prose` container and allow it to expand naturally with content.
    - Ensure the dashboard layout supports the scrollable editor area correctly.
  </action>
  <verify>grep "min-h-screen" components/clash/WikiEditor.tsx</verify>
  <done>Editor area feels like a document-first Notion page.</done>
</task>

<task type="auto">
  <name>Debug & Fix Clipboard Image Paste</name>
  <files>components/clash/WikiEditor.tsx</files>
  <action>
    - Refine `handlePaste` to correctly extract blob data from `clipboardData.items`.
    - Ensure the temporary blob URL is valid before attempting `setImage`.
    - Fix any upload failures in the `/api/wiki-media` proxy.
  </action>
  <verify>grep "getAsFile" components/clash/WikiEditor.tsx</verify>
  <done>Pasting images from clipboard works reliably.</done>
</task>

## Success Criteria
- [ ] Load time perceived as "Instant" (due to UI gating and faster hydration).
- [ ] No data loss on entry.
- [ ] Tables are visually distinct and menus are positioned correctly.
- [ ] Layout is expansive and document-centered.
- [ ] Clipboard paste works for images.
