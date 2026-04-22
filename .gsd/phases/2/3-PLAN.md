---
phase: 2
plan: 3
wave: 1
---

# Plan 2.3: PDF Embedding & Scrollable Previews

## Objective
Add support for embedding PDF files directly into the wiki with a scrollable, high-fidelity preview using `react-pdf`.

## Context
- `components/clash/WikiEditor.tsx`
- `package.json`

## Tasks

<task type="auto">
  <name>Create Custom Tiptap PDF Node</name>
  <files>components/clash/wiki-editor/nodes/PdfNode.tsx</files>
  <action>
    - Implement a custom Tiptap Node called `PdfNode`.
    - Use `react-pdf` to render the PDF content.
    - Support `src` and `height` attributes.
    - Ensure the node is collaborative (synced via Yjs).
  </action>
  <verify>Test-Path components/clash/wiki-editor/nodes/PdfNode.tsx</verify>
  <done>Custom PDF node component is implemented.</done>
</task>

<task type="auto">
  <name>Register PDF Node in Editor</name>
  <files>components/clash/WikiEditor.tsx</files>
  <action>
    - Import and register `PdfNode` in the extensions array.
    - Add a "Upload PDF" button to the toolbar or handle PDF drops.
  </action>
  <verify>grep "PdfNode" components/clash/WikiEditor.tsx</verify>
  <done>The editor recognizes and can render PDF nodes.</done>
</task>

<task type="auto">
  <name>Implement PDF Preview Scroll & Controls</name>
  <files>components/clash/wiki-editor/nodes/PdfNode.tsx</files>
  <action>
    - Add zoom controls and page navigation within the embedded block.
    - Ensure scroll synchronization (optional but nice) or at least independent scrolling within the block.
  </action>
  <verify>grep "zoom" components/clash/wiki-editor/nodes/PdfNode.tsx</verify>
  <done>PDF blocks have interactive controls for better viewing experience.</done>
</task>

## Success Criteria
- [ ] PDFs can be uploaded or linked and displayed as embedded blocks.
- [ ] Users can scroll through the PDF within the wiki page.
- [ ] The PDF block is correctly persisted and synced.
