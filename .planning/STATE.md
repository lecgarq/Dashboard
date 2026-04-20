# Project State

## Current Position

Phase: 2 of 5 (Content Blocks)
Plan: 3 of 6 in current phase
Status: In progress
Last activity: 2026-04-20 — 02-03 complete (PDF viewer Tiptap node: PdfNode extension + PdfNodeView component)

Progress: [███░░░░░░░] 23%

## Accumulated Context

### Decisions

- [Phase 1]: EDITOR role gets implicit wiki module access — no explicit moduleAccess array required. Only VIEWERs need explicit membership.
- [Phase 1]: editorCanWrite (canEdit && !!collabSession) is the single source of truth for Tiptap editable state.
- [Phase 1]: Use Tiptap native tables for basic Notion-like tables (Phase 2).
- [Phase 1]: Use tldraw or Excalidraw for Miro-style boards (Phase 3).
- [Phase 1]: Integrate APS Viewer as a custom Tiptap Node (Phase 4).
- [Phase 2, Plan 01]: Tiptap CLI components require Pro cloud auth — use manual scaffolds with matching export shape as workaround.
- [Phase 2, Plan 01]: xlsx installed from cdn.sheetjs.com/xlsx-0.20.3 tarball (not npm) to avoid CVE in 0.18.5.
- [Phase 2, Plan 01]: SCSS imported from component files in later plans (not injected into globals.css) since globals.css is plain CSS.
- [Phase 2, Plan 03]: PdfNode addNodeView() deferred to WikiEditor.tsx via PdfNode.extend() + dynamic import — keeps pdf-node.ts SSR-safe with zero browser-only imports.
- [Phase 2, Plan 03]: pdfjs.GlobalWorkerOptions.workerSrc must be set inline in pdf-node-view.tsx (not a utility file) to guarantee module execution order.
- [Phase 2, Plan 03]: PdfNodeView is default export so dynamic(() => import('./pdf-node-view')) resolves correctly in WikiEditor.tsx.

### Blockers/Concerns

None currently.

## Session Continuity

Last session: 2026-04-20
Stopped at: Completed 02-03-PLAN.md (PDF viewer Tiptap node: PdfNode + PdfNodeView)
Resume file: None
