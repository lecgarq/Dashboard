# Project State

## Current Position

Phase: 6 of 6 (ACC Project Intelligence)
Plan: 2 of 4 in current phase
Status: In progress
Last activity: 2026-04-22 — 06-02 complete (lib/server/acc-admin.ts created: typed ACC Admin API wrappers for fetchAccUserByEmail, fetchAccUserProjects, fetchAccUserProducts)

Progress: [█████░░░░░] 40% (Phase 2 at 5/6; Phase 6 at 2/4 plans complete)

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
- [Phase 2, Plan 02]: TableCell imported from @tiptap/extension-table (v3 — no separate extension-table-cell package). setCellAttribute is built into TableKit; CustomTableCell addCommands() delegates to it.
- [Phase 2, Plan 02]: table-overrides.css imported into globals.css via plain CSS @import (not SCSS @use). CSS path: ../components/clash/wiki-editor/table-node/styles/table-overrides.css.
- [Phase 2, Plan 03]: PdfNode addNodeView() deferred to WikiEditor.tsx via PdfNode.extend() + dynamic import — keeps pdf-node.ts SSR-safe with zero browser-only imports.
- [Phase 2, Plan 03]: pdfjs.GlobalWorkerOptions.workerSrc must be set inline in pdf-node-view.tsx (not a utility file) to guarantee module execution order.
- [Phase 2, Plan 03]: PdfNodeView is default export so dynamic(() => import('./pdf-node-view')) resolves correctly in WikiEditor.tsx.
- [Phase 2, Plan 04]: ImageNode name must be "image" (not a custom name) to parse existing img[src] tags already stored in the database — backward compatibility critical.
- [Phase 2, Plan 04]: GIF detection via src.includes('.gif') renders img element for native browser autoplay — no special JS handling needed.
- [Phase 2, Plan 04]: Replace media uses hidden file input with ref + programmatic click — avoids custom file picker complexity.
- [Phase 2, Plan 05]: TableKit sort/filter deferred — TableKit uses ProseMirror native node view; useSortFilter is standalone utility; full sort requires custom React NodeView for table node (future plan).
- [Phase 2, Plan 05]: SlashDropdownMenu is scaffold (renders null); WIKI_SLASH_ITEMS is fully defined and passed as items prop — slash menu activates when scaffold is replaced with real implementation.
- [Phase 2, Plan 05]: XHR replaces fetch() in media upload handler to enable upload progress events; namedUploadProgress state shows {fileName, progress} in UI progress bar.
- [Phase 6, Plan 02]: fetchAccUserByEmail returns null (not throw) for empty results — ACC Admin API returns 200 with empty results array when email not found (not a 404).
- [Phase 6, Plan 02]: accountId b. prefix stripping is caller responsibility — acc-admin.ts helpers receive pre-stripped bare UUID.
- [Phase 6, Plan 02]: fetchApsJson copied from aps-search.ts pattern into acc-admin.ts (not imported) — the function is not exported from aps-search.ts.

### Blockers/Concerns

None currently.

## Session Continuity

Last session: 2026-04-22
Stopped at: Completed 06-02-PLAN.md (lib/server/acc-admin.ts: typed ACC Admin API wrappers, fetchAccUserByEmail/fetchAccUserProjects/fetchAccUserProducts, server-only guard, pagination, (Removed) role filtering)
Resume file: None
