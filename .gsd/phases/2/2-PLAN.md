---
phase: 2
plan: 2
wave: 1
---

# Plan 2.2: Collaborative Tables

## Objective
Enable collaborative, Notion-style tables within the Tiptap editor using the official `@tiptap/extension-table` and Yjs synchronization.

## Context
- `components/clash/WikiEditor.tsx`
- `package.json`

## Tasks

<task type="auto">
  <name>Configure Tiptap Table Extensions</name>
  <files>components/clash/WikiEditor.tsx</files>
  <action>
    - Import `Table`, `TableCell`, `TableHeader`, and `TableRow` from `@tiptap/extension-table`.
    - Add them to the `useEditor` extensions array.
    - Configure `resizable: true` and `handleWidth: 5`.
  </action>
  <verify>grep "Table" components/clash/WikiEditor.tsx</verify>
  <done>The extensions are registered and configured in the editor instance.</done>
</task>

<task type="auto">
  <name>Implement Table Control UI</name>
  <files>components/clash/WikiEditor.tsx</files>
  <action>
    - Add a "Insert Table" button to the toolbar.
    - Add table manipulation controls (Add Row/Col, Delete Row/Col, Merge Cells) that appear when the cursor is inside a table.
    - Ensure these controls are disabled when `editorCanWrite` is false.
  </action>
  <verify>grep "insertTable" components/clash/WikiEditor.tsx</verify>
  <done>Toolbar buttons for table operations are present and functional.</done>
</task>

<task type="auto">
  <name>Style Table Components</name>
  <files>components/clash/wiki-editor/table-node/styles/table-overrides.css</files>
  <action>
    - Create or update CSS for tables to match the dashboard's premium aesthetic.
    - Add hover effects for resizing handles.
    - Ensure borders and headers look "Notion-like".
  </action>
  <verify>Test-Path components/clash/wiki-editor/table-node/styles/table-overrides.css</verify>
  <done>CSS file exists and is imported into the editor component.</done>
</task>

## Success Criteria
- [ ] Users can insert and modify tables.
- [ ] Tables are synchronized in real-time across multiple users via Yjs.
- [ ] Table structure (rows/cols) is preserved in persistence.
