---
phase: 02-content-blocks
verified: 2026-04-20T17:38:32Z
status: gaps_found
score: 3/4 success criteria verified (automated); 2 structural stubs blocking full feature delivery
re_verification: false
gaps:
  - truth: "Right-clicking a table cell shows options for text alignment, background color, and cell merge"
    status: failed
    reason: "setCellBackgroundColor and setCellTextAlign commands are defined in custom-table-cell.ts but never called from any UI surface. table-handle.tsx (TableHandle, TableTriggerButton, TableSelectionOverlay) is a four-stub file returning null. No context menu wires these commands into the editor."
    artifacts:
      - path: "components/clash/wiki-editor/table-node/ui/table-handle.tsx"
        issue: "All four exported components return null — scaffold never implemented"
    missing:
      - "Implement TableHandle or a context menu that calls editor.commands.setCellBackgroundColor() and editor.commands.setCellTextAlign()"
      - "Wire setCellAttribute commands into an accessible UI (right-click menu, toolbar, or popover)"

  - truth: "Right-clicking a table offers Export as .xlsx"
    status: failed
    reason: "exportTableAsXlsx is defined in table-utils.ts but not called from anywhere in the codebase. The DragContextMenu is also a scaffold (table-handle.tsx returns null). No UI surface triggers the export."
    artifacts:
      - path: "components/clash/wiki-editor/table-node/ui/table-handle.tsx"
        issue: "Scaffold — no context menu implemented to trigger exportTableAsXlsx"
    missing:
      - "Wire exportTableAsXlsx(editor) into a reachable UI: right-click on table, toolbar button, or editor command"

  - truth: "Clicking a column header sorts rows ascending then descending (toggle)"
    status: failed
    reason: "useSortFilter and FilterBar are defined in table-sort-filter.tsx but not wired into any table node view. TableKit renders table nodes via ProseMirror native rendering — no React component exposes column header onClick. The 02-05-SUMMARY.md documents this as a known architectural gap requiring a future plan."
    artifacts:
      - path: "components/clash/wiki-editor/table-node/table-sort-filter.tsx"
        issue: "Exists and is substantive but is orphaned — not imported or called from any wiki-editor component"
    missing:
      - "Build a custom React NodeView for the table node (replacing ProseMirror native rendering) that renders th elements with onClick calling toggleSort(colIndex)"
      - "OR add a floating sort toolbar that appears when a table is selected, using useSortFilter state to reorder rows via editor.commands"

  - truth: "Typing / opens the slash menu; fuzzy search finds blocks by category (Basic, Media, Embeds)"
    status: failed
    reason: "SlashDropdownMenu in slash-menu/index.tsx is a scaffold that returns null. WIKI_SLASH_ITEMS is fully defined and passed as the items prop, but the menu never renders. Typing / in the editor produces no visible menu."
    artifacts:
      - path: "components/clash/wiki-editor/slash-menu/index.tsx"
        issue: "Scaffold — returns null unconditionally (line 37). Comment says 'full implementation in 02-04-PLAN.md' but 02-04 only built image/video nodes, not the slash menu."
    missing:
      - "Implement SlashDropdownMenu using Tiptap suggestion API (@tiptap/suggestion) or a Radix/Headless UI popover triggered by '/' keypress"
      - "The WIKI_SLASH_ITEMS array and SlashMenuItem type are ready — only the rendering layer is missing"

human_verification:
  - test: "Table Yjs sync — insert table, type in two browser tabs simultaneously"
    expected: "Real-time updates appear in the second tab without refresh"
    why_human: "Cannot verify Yjs real-time sync programmatically from the file system"
  - test: "PDF inline viewer — embed a Google Drive PDF and scroll through pages"
    expected: "PDF renders inline with toolbar, page navigation works, dragging bottom edge resizes viewer height"
    why_human: "react-pdf rendering and interaction requires a live browser session"
  - test: "Image lightbox — click image to open full-screen overlay"
    expected: "Fixed overlay appears, image centered, X button closes it"
    why_human: "Visual and interactive — cannot test in static analysis"
  - test: "Video Replace media — right-click video, select Replace media, pick new file"
    expected: "Video swaps in place without deleting the block"
    why_human: "File picker interaction and upload flow require a live browser"
  - test: "Drag handle — hover over any block to reveal drag handle, drag to reorder"
    expected: "Drag handle appears left of block on hover; drag successfully reorders blocks"
    why_human: "DragHandle from @tiptap/extension-drag-handle-react is wired but drag behavior requires live browser"
  - test: "Upload progress bar — upload a large image/video file"
    expected: "Progress bar with filename appears during upload and disappears when complete"
    why_human: "XHR progress events require an actual network upload"
  - test: "Excel/Google Sheets paste — copy cells from spreadsheet, paste into editor"
    expected: "Formatted table appears in the editor (native TableKit behavior)"
    why_human: "Clipboard API and paste handling require a live browser session"
---

# Phase 02: Content Blocks Verification Report

**Phase Goal:** Add rich content blocks to the wiki editor — tables (with sort/filter, xlsx export, Yjs sync), inline PDF viewer (Google Drive), enhanced image/video nodes (alignment, lightbox, caption), all wired into WikiEditor with slash menu and drag handle.
**Verified:** 2026-04-20T17:38:32Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Success Criteria (from ROADMAP.md)

| # | Success Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Users can insert and collaboratively edit tables within wiki pages | PARTIAL | TableKit registered in WikiEditor; table inserts via slash menu item. Cell right-click menu (background color, merge) is absent — table-handle.tsx stubs return null |
| 2 | PDF files can be embedded and scrolled inline within documents | VERIFIED | PdfNode + PdfNodeView fully implemented with react-pdf, toolbar, resize, right-click Replace/Edit. Dynamic import with ssr:false wired in WikiEditor.tsx |
| 3 | Image, video, and GIF blocks render correctly with improved UX | VERIFIED | ImageNode (alignment, lightbox, caption, Replace media, GIF autoplay) and VideoNode (alignment, caption, Replace media) both substantive and wired in WikiEditor.tsx |
| 4 | All new blocks sync via Yjs in real-time across connected users | VERIFIED (code path) | ProseMirror node attributes (backgroundColor, textAlign, fileId, alignment, caption, height) all have parseHTML+renderHTML — required for Yjs persistence. Collaboration.configure(ydoc) registered last in extensions array. Human confirmation still needed |

**Score:** 3/4 success criteria verified (SC-1 is partial due to missing cell operations UI and sort/filter)

---

### Observable Truths — Detailed Status

| # | Truth | Status | Evidence |
|---|---|---|---|
| T1 | All four new block types appear in the slash command menu | PARTIAL | WIKI_SLASH_ITEMS defines all 10 items; SlashDropdownMenu renders null (stub) — items never display |
| T2 | Typing / opens the slash menu with fuzzy search | FAILED | slash-menu/index.tsx line 37: `return null` |
| T3 | Drag handle appears on hover for all block types | VERIFIED (code) | WikiDragHandle wraps @tiptap/extension-drag-handle-react, DragHandleExtension + NodeRange in extensions array. Human confirmation needed |
| T4 | + hover button appears left of blocks, clicking opens slash menu | PARTIAL | + button exists in WikiDragHandle; clicks insert '/' into editor, but slash menu doesn't render |
| T5 | TableKit, CustomTableCell, PdfNode, ImageNode all registered in WikiEditor | VERIFIED | Lines 261-268 in WikiEditor.tsx confirmed |
| T6 | ImageResize removed from extensions — no duplicate image parsers | VERIFIED | No `ImageResize` import; only a comment at line 250 |
| T7 | PdfNodeView is dynamically imported with ssr:false | VERIFIED | Lines 41-44 in WikiEditor.tsx confirmed |
| T8 | Table extensions registered BEFORE Collaboration | VERIFIED | TableKit at line 261, Collaboration at line 277 |
| T9 | All blocks sync via Yjs | VERIFIED (code path) | All new node attributes have parseHTML+renderHTML for serialization; Collaboration.configure(ydoc) present |
| T10 | Uploading a media file shows a progress bar with filename | VERIFIED | XHR with upload.addEventListener('progress'), namedUploadProgress state, progress bar JSX at lines 909-921 |
| T11 | Clicking a column header sorts rows ascending/descending | FAILED | useSortFilter orphaned — not imported or called from any table rendering component |
| T12 | Right-click table cell shows alignment/background/merge options | FAILED | table-handle.tsx returns null for all 4 components; setCellBackgroundColor/setCellTextAlign never called |
| T13 | Right-click table offers Export as .xlsx | FAILED | exportTableAsXlsx exists but is not called from any UI surface |
| T14 | Images open full-screen lightbox on click | VERIFIED | lightboxOpen state + fixed overlay JSX at lines 256-278 in image-node.tsx |
| T15 | Images have four alignment options via floating toolbar | VERIFIED | alignmentStyle map + toolbar rendered when selected=true |
| T16 | GIFs autoplay on page load | VERIFIED | isGif check at line 103; renders as `<img>` element, not `<video>` |
| T17 | PDF right-click: Replace PDF + Edit link | VERIFIED | onContextMenu handler at line 150; handleReplaceFile and handleEditLink wired |
| T18 | Videos have alignment and caption behavior matching images | VERIFIED | alignment + caption attributes in video-node.tsx; floating toolbar + caption input implemented |

---

## Required Artifacts

| Artifact | Status | Notes |
|---|---|---|
| `package.json` | VERIFIED | @tiptap/extension-table ^3.22.4, xlsx from cdn.sheetjs.com, react-pdf ^10.4.1, sass ^1.99.0 |
| `components/clash/wiki-editor/table-node/extensions/custom-table-cell.ts` | VERIFIED | TableCell.extend() with backgroundColor + textAlign, parseHTML + renderHTML for both, setCellBackgroundColor/setCellTextAlign commands |
| `components/clash/wiki-editor/table-node/table-utils.ts` | ORPHANED | extractTableRows + exportTableAsXlsx substantive, but exportTableAsXlsx not called from any UI surface |
| `components/clash/wiki-editor/table-node/table-sort-filter.tsx` | ORPHANED | useSortFilter + FilterBar substantive, but not imported/used from any table-rendering component |
| `components/clash/wiki-editor/table-node/styles/table-overrides.css` | VERIFIED | position: sticky on th, imported in app/globals.css at line 4 |
| `components/clash/wiki-editor/table-node/ui/table-handle.tsx` | STUB | All 4 components return null — TableHandle, TableTriggerButton, TableSelectionOverlay, and a 4th component |
| `components/clash/wiki-editor/pdf-node.ts` | VERIFIED | PdfNode with fileId/fileName/caption/height, SSR-safe (no browser imports) |
| `components/clash/wiki-editor/pdf-node-view.tsx` | VERIFIED | "use client", pdfjs.GlobalWorkerOptions.workerSrc inline, Document/Page viewer, toolbar, resize, context menu, mobile fallback |
| `components/clash/wiki-editor/image-node.tsx` | VERIFIED | ImageNode name="image", alignment, lightbox, caption, alt text, Replace media upload wired |
| `components/clash/wiki-editor/video-node.tsx` | VERIFIED | alignment + caption attributes added, floating toolbar, caption input, Replace media context menu |
| `components/clash/wiki-editor/slash-menu/index.tsx` | STUB | Returns null (line 37). Comment references 02-04-PLAN.md but 02-04 built image/video, not the slash menu. |
| `components/clash/wiki-editor/slash-menu/wiki-slash-items.ts` | VERIFIED | WIKI_SLASH_ITEMS with 10 items in Basic/Media/Embeds groups, all onSelect handlers defined |
| `components/clash/wiki-editor/drag-handle/index.tsx` | VERIFIED | WikiDragHandle with DragHandle from @tiptap/extension-drag-handle-react, + button, GripVertical; re-exports DragHandleExtension + NodeRange |
| `components/clash/WikiEditor.tsx` | VERIFIED (with gap) | All Phase 2 extensions registered; ImageResize removed; dynamic PdfNodeView; XHR progress; WikiDragHandle + SlashDropdownMenu in JSX. Gap: SlashDropdownMenu renders null |

---

## Key Link Verification

| From | To | Via | Status | Notes |
|---|---|---|---|---|
| WikiEditor.tsx | custom-table-cell.ts | CustomTableCell import line 31 | WIRED | CustomTableCell in extensions array line 262 |
| WikiEditor.tsx | pdf-node.ts | PdfNode import line 27 | WIRED | PdfNode.extend({addNodeView}) line 265-269 |
| WikiEditor.tsx | image-node.tsx | ImageNode import line 24 | WIRED | ImageNode in extensions array line 251 |
| WikiEditor.tsx | pdf-node-view.tsx | dynamic() ssr:false lines 41-44 | WIRED | DynamicPdfNodeView used in PdfNode.extend |
| WikiEditor.tsx | drag-handle/index.tsx | WikiDragHandle + DragHandleExtension + NodeRange | WIRED | Lines 34, 272-273, 925 |
| WikiEditor.tsx | slash-menu/index.tsx | SlashDropdownMenu line 37 in WikiEditor JSX | PARTIAL | Imported and rendered but SlashDropdownMenu returns null |
| WikiEditor.tsx | wiki-slash-items.ts | WIKI_SLASH_ITEMS passed as items prop | PARTIAL | Items defined but menu never renders |
| slash-menu items | wiki-image-upload (hidden input) | document.getElementById("wiki-image-upload") | WIRED | Input at WikiEditor.tsx line 743 exists |
| slash-menu items | wiki-video-upload (hidden input) | document.getElementById("wiki-video-upload") | WIRED | Input at WikiEditor.tsx line 756 exists |
| slash-menu items | wiki-pdf-upload (hidden input) | document.getElementById("wiki-pdf-upload") | WIRED | Input at WikiEditor.tsx line 770 exists |
| table-utils.ts exportTableAsXlsx | Any UI surface | Call site | NOT_WIRED | exportTableAsXlsx exported but never called |
| table-sort-filter.tsx useSortFilter | Table node view | Import + use | NOT_WIRED | useSortFilter exported but never called from wiki-editor components |
| custom-table-cell.ts commands | Any UI surface | setCellBackgroundColor/setCellTextAlign call | NOT_WIRED | Commands defined but no UI calls them |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|---|---|---|---|---|
| REQ-02 | 02-01 through 02-06 | Enrich Tiptap editor with Notion-parity content blocks: collaborative tables, PDF previews, improved media UX, Yjs sync | PARTIAL | PDF viewer, enhanced image/video fully implemented. Table missing: sort/filter UI, cell right-click operations (background color, merge), xlsx export UI surface. Slash menu is a non-rendering stub. |

---

## Anti-Patterns Found

| File | Lines | Pattern | Severity | Impact |
|---|---|---|---|---|
| `slash-menu/index.tsx` | 35-37 | `return null` — entire component is a scaffold stub | BLOCKER | Slash menu feature does not work. Typing / produces no UI. All WIKI_SLASH_ITEMS are unreachable. |
| `table-node/ui/table-handle.tsx` | 28, 37, 46, 55 | Four components all return null | BLOCKER | No table cell context menu for background color, text alignment, merge, or xlsx export |
| `table-node/table-sort-filter.tsx` | — | Orphaned file — not imported by any wiki-editor component | WARNING | Column sort feature does not work. useSortFilter dead code until wired |
| `table-node/table-utils.ts` exportTableAsXlsx | — | Exported but never called from any UI | WARNING | xlsx export feature does not work — no trigger exists |

---

## Human Verification Required

### 1. Table Yjs Real-Time Sync

**Test:** Open the same wiki page in two browser tabs. In Tab 1, insert a table (once slash menu works) and type in a cell. In Tab 2, watch for the table to appear without refreshing.
**Expected:** Table content appears in Tab 2 within 200ms of typing in Tab 1.
**Why human:** Yjs WebSocket sync requires a live browser and collab server connection.

### 2. PDF Inline Rendering

**Test:** Insert a PDF block, provide a Google Drive file ID, wait for the viewer to load.
**Expected:** PDF pages render inline within the block. Toolbar buttons for zoom/navigation work. Dragging the bottom edge resizes the viewer.
**Why human:** react-pdf requires a browser DOM and Canvas API unavailable in static analysis.

### 3. Image Lightbox

**Test:** Upload an image (non-GIF). Click the image.
**Expected:** A full-screen black overlay appears with the image centered. Clicking X or the overlay background closes it.
**Why human:** Visual overlay and click behavior require a live browser.

### 4. Drag Handle Block Reorder

**Test:** Hover over a paragraph or image block.
**Expected:** Drag handle icon appears on the left. Dragging it moves the block to a new position in the document.
**Why human:** Drag-and-drop interaction requires a live browser.

### 5. Upload Progress Bar

**Test:** Upload a file larger than ~1MB via drag-drop or the image upload button.
**Expected:** A progress bar with the filename and percentage appears below the toolbar during upload, then disappears on completion.
**Why human:** XHR progress events require a real network request.

### 6. Excel/Google Sheets Paste

**Test:** Select 3–5 cells in Google Sheets or Excel, copy (Ctrl+C), paste into the wiki editor (Ctrl+V).
**Expected:** A formatted table appears with the pasted cells. (Native TableKit behavior per Tiptap documentation.)
**Why human:** Clipboard API and paste handling require a live browser session.

---

## Gaps Summary

**4 gaps block full goal achievement.** Two are structural stubs that prevent entire feature categories from working:

**Gap 1 (BLOCKER): Slash menu never renders.** `SlashDropdownMenu` in `slash-menu/index.tsx` unconditionally returns null. This is a leftover scaffold from 02-01. The comment incorrectly references 02-04-PLAN.md as the implementation plan, but 02-04 built image/video nodes — it never implemented the slash menu. `WIKI_SLASH_ITEMS` (10 items, all groups, all onSelect handlers) is fully ready. The missing piece is a `@tiptap/suggestion`-based or Radix UI popover implementation of the menu component itself.

**Gap 2 (BLOCKER): Table cell operations have no UI.** `table-handle.tsx` exports four components that all return null. The `setCellBackgroundColor`, `setCellTextAlign` editor commands exist (defined in `custom-table-cell.ts`) but are never called. The `exportTableAsXlsx` function exists but is never called. Users cannot change cell colors, text alignment, merge cells, or export to xlsx because there is no accessible UI surface for these operations.

**Gap 3 (WARNING): Column sort/filter is orphaned.** `useSortFilter` and `FilterBar` are complete and correct, but not connected to any table rendering component. TableKit uses ProseMirror native node rendering — there is no React component hook point without building a custom React NodeView for the table node. This requires a separate plan.

**Gap 4 (WARNING): + button opens slash menu that doesn't render.** The WikiDragHandle `+` button inserts a `/` character into the editor, but since `SlashDropdownMenu` returns null, this produces a literal `/` in the document rather than opening the block picker. This will be resolved automatically when Gap 1 is fixed.

**Root cause for Gaps 1, 2, 4:** Both `SlashDropdownMenu` and `table-handle.tsx` were created as Pro CLI scaffolds in plan 02-01 with the explicit intention that later plans would implement them. The later plans (02-02 for table, 02-04 for slash menu) did not implement the scaffolds — they built the extension/utility layers instead, leaving the UI rendering stubs in place.

---

_Verified: 2026-04-20T17:38:32Z_
_Verifier: Claude (gsd-verifier)_
