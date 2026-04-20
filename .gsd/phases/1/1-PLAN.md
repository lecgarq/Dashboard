---
phase: 1
plan: 1
wave: 1
---

# Plan 1.1: Fix Edit Permissions & Restore Wiki Access

## Objective
Normalize the permission logic between TRPC and the Yjs collaboration endpoint to ensure users with the "EDITOR" role can always edit the wiki sections.

## Context
- `lib/server/wiki-access.ts` (Permission logic)
- `server/trpc.ts` (TRPC middleware)
- `app/api/wiki-collab-token/route.ts` (Collab endpoint)

## Tasks

<task type="auto">
  <name>Align Wiki Permissions</name>
  <files>
    <file>c:\LECG\Dashboard\lib\server\wiki-access.ts</file>
  </files>
  <action>
    Modify `canEditWikiModule` to allow "EDITOR" role access even if the specific module is missing from `moduleAccess`, or ensure `hasModuleAccess` is consistent with the product vision.
    
    The current inconsistency is that TRPC allows the edit but the Yjs token endpoint rejects it.
  </action>
  <verify>Check that `canEditWikiModule` returns true for an EDITOR role.</verify>
  <done>Permission logic is unified.</done>
</task>

<task type="auto">
  <name>Optimize Tiptap Extension Foundation</name>
  <files>
    <file>c:\LECG\Dashboard\components\clash\WikiEditor.tsx</file>
  </files>
  <action>
    Review the current `extensions` array. Ensure `Collaboration` and `CollaborationCaret` are correctly initialized and that the `editable` prop strictly follows the new permission logic.
    Check for any CSS `z-index` or `pointer-events` issues that might be blocking input in the `prose` container.
  </action>
  <verify>Visual inspection of the editor state.</verify>
  <done>Editor is responsive and ready for new blocks.</done>
</task>

## Success Criteria
- [ ] Users with the EDITOR role can successfully obtain a collab token.
- [ ] The Tiptap editor body becomes editable (flashing cursor appears).
- [ ] Changes made to the body are persisted to the database.
