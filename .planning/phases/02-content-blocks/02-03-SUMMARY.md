---
phase: 02-content-blocks
plan: "03"
subsystem: ui
tags: [tiptap, react-pdf, pdfjs, google-drive, wiki-editor, custom-node]

# Dependency graph
requires:
  - phase: 02-content-blocks/02-01
    provides: npm deps installed (react-pdf, pdfjs-dist) and component scaffolds

provides:
  - PdfNode Tiptap extension with fileId, fileName, caption, height attributes (pdf-node.ts)
  - PdfNodeView React component with full toolbar, resize, error/loading states, mobile fallback, right-click menu (pdf-node-view.tsx)

affects:
  - 02-05 (WikiEditor.tsx registration of PdfNode + dynamic import of PdfNodeView)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SSR-safe Tiptap custom node: extension definition in .ts file (no browser imports), view in "use client" .tsx file with dynamic() import wired in WikiEditor.tsx
    - pdfjs.GlobalWorkerOptions.workerSrc configured inline in same file as Document/Page components (prevents module execution order override)
    - div[data-type="pdf"] HTML serialization tag (avoids unknown element rendering in browsers)
    - Drag-to-resize pattern matching VideoNode: mousedown + document mousemove/mouseup listeners cleaned up on mouseup

key-files:
  created:
    - components/clash/wiki-editor/pdf-node.ts
    - components/clash/wiki-editor/pdf-node-view.tsx
  modified: []

key-decisions:
  - "PdfNode addNodeView() deferred to WikiEditor.tsx via PdfNode.extend() + dynamic import — keeps pdf-node.ts SSR-safe with zero browser-only imports"
  - "pdfjs.GlobalWorkerOptions.workerSrc set inline in pdf-node-view.tsx (not a utility file) to guarantee module execution order"
  - "div[data-type='pdf'] chosen as HTML serialization tag per plan spec — unknown HTML elements are unparseable by browsers"
  - "PdfNodeView is default export (not named) so dynamic(() => import('./pdf-node-view')) resolves correctly in WikiEditor.tsx"

patterns-established:
  - "SSR-safe custom Tiptap node split: .ts for node schema, 'use client' .tsx for React view, dynamic import in editor"
  - "Inline pdfjs worker config: workerSrc must be in same file as Document/Page to avoid override"

requirements-completed:
  - REQ-02

# Metrics
duration: 3min
completed: 2026-04-20
---

# Phase 02 Plan 03: PDF Viewer Node Summary

**react-pdf inline PDF viewer Tiptap node with toolbar, drag-resize, caption, error states, right-click Replace/Edit, and mobile Drive fallback**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-20T16:55:08Z
- **Completed:** 2026-04-20T16:58:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- PdfNode Tiptap extension (pdf-node.ts) with fileId, fileName, caption, height attributes — SSR-safe, no browser imports, addNodeView() deferred to WikiEditor.tsx
- PdfNodeView (pdf-node-view.tsx) with full spec: react-pdf Document/Page viewer, 8-button toolbar (zoom/nav/fit/download/print/fullscreen), drag-to-resize height handle, loading skeleton, error card with Drive link
- Right-click context menu fully wired: Replace PDF (hidden file input + POST /api/wiki-media + updateAttributes) and Edit link (inline panel parsing Drive URL or raw fileId)
- Mobile fallback: tappable card linking to Google Drive viewer when window width <= 768px

## Task Commits

Each task was committed atomically:

1. **Task 1: PdfNode Tiptap extension definition** - `ea1c0fd` (feat)
2. **Task 2: PdfNodeView React component with react-pdf viewer and right-click menu** - `b672a17` (feat)

**Plan metadata:** (docs commit pending)

## Files Created/Modified

- `components/clash/wiki-editor/pdf-node.ts` — PdfNode extension: node schema, attribute parseHTML/renderHTML, div[data-type="pdf"] serialization
- `components/clash/wiki-editor/pdf-node-view.tsx` — PdfNodeView: "use client", pdfjs worker inline, full viewer UI with all interactive features

## Decisions Made

- pdfjs.GlobalWorkerOptions.workerSrc configured inline in pdf-node-view.tsx (not a shared utility), as required by RESEARCH.md to prevent module execution order override
- addNodeView() intentionally omitted from pdf-node.ts — will be registered in WikiEditor.tsx via PdfNode.extend() + dynamic import (plan 02-05)
- Default export used on PdfNodeView so dynamic(() => import('./pdf-node-view')) resolves the component correctly
- div[data-type="pdf"] used as HTML tag (browsers cannot render unknown tags like `<pdf>`)
- fileId extraction regex handles both `?id=FILE_ID` and `/d/FILE_ID` Drive URL formats

## Output Notes (per plan spec)

- **Proxy URL format:** `/api/wiki-media/${fileId}` — correct format for react-pdf Document `file` prop (same-origin proxy avoids CORS issues with direct Drive URLs)
- **TypeScript:** No errors in pdf-node.ts or pdf-node-view.tsx. Pre-existing .next/types TS6053 errors are unrelated (stale build cache)
- **Lucide icons confirmed present:** ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Download, Printer, Maximize — all in lucide-react@0.575.0
- **fileId extraction regex:** `/[?&]id=([^&]+)/` handles `?id=` and `&id=` formats; `/\/d\/([^/]+)/` handles Drive share URL format `/file/d/FILE_ID/view`

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- pdf-node.ts and pdf-node-view.tsx are complete and TypeScript-clean
- Ready for WikiEditor.tsx registration in plan 02-05 via:
  `PdfNode.extend({ addNodeView: () => ReactNodeViewRenderer(DynamicPdfNodeView) })`
- No blockers or concerns

---
*Phase: 02-content-blocks*
*Completed: 2026-04-20*
