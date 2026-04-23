# Project State

## Current Position

Phase: 7 of 7 (ACC Analysis Graph)
Plan: 2 of 2 in current phase
Status: Phase complete
Last activity: 2026-04-23 — 07-02 complete (AccAnalysisPanel + bulkAccSummary extended with allRoles/allModules/projects[] + ACC Analysis tab in Users section)

Progress: [████████░░] 60% (Phase 2 at 5/6; Phase 6 at 4/4; Phase 7 at 2/2 plans complete)

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
- [Phase 6, Plan 01]: Used prisma migrate deploy (not migrate dev) for non-interactive migration — migrate dev requires interactive TTY, deploy does not.
- [Phase 6, Plan 01]: Direct Supabase URL (port 5432) required for DDL migrations — pgbouncer pooler (port 6543) rejects prepared statements used by Prisma schema engine.
- [Phase 6, Plan 02]: fetchAccUserByEmail returns null (not throw) for empty results — ACC Admin API returns 200 with empty results array when email not found (not a 404).
- [Phase 6, Plan 02]: accountId b. prefix stripping is caller responsibility — acc-admin.ts helpers receive pre-stripped bare UUID.
- [Phase 6, Plan 02]: fetchApsJson copied from aps-search.ts pattern into acc-admin.ts (not imported) — the function is not exported from aps-search.ts.
- [Phase 6, Plan 03]: getAccProfile placed in usersRouter (not a new router) — it is a user data query aligned with existing user profile procedures.
- [Phase 6, Plan 03]: toAccRouterError defined locally in users.ts (not imported from aps-search.ts) — avoids importing from sibling router files.
- [Phase 6, Plan 04]: forceRefresh implemented via useState toggle (not refetch()) — tRPC useQuery does not support passing new input on refetch; changing query input via state triggers a fresh network request.
- [Phase 6, Plan 04]: PRECONDITION_FAILED detection via error?.data?.code === "PRECONDITION_FAILED" used to distinguish 403 Account Admin gate from other errors in AccProfileSection.
- [Phase 7, Plan 01]: bulkAccSummary is adminProcedure (not protectedProcedure) — consistent with other admin-only data queries in usersRouter.
- [Phase 7, Plan 01]: AccBadge extracted as standalone component to avoid duplicating badge logic across PersonCard and PersonRow.
- [Phase 7, Plan 01]: accSummaryMap built with useMemo keyed by email for O(1) per-card lookup without re-renders.
- [Phase 7, Plan 02]: bulkAccSummary extended in-place (replaced Plan 7.1 lightweight version) — additive fields (allRoles, allModules, projects[]) with backward-compatible existing fields preserved.
- [Phase 7, Plan 02]: AccAnalysisPanel receives BulkAccUser[] as prop — no separate tRPC call, reuses existing query from Plan 7.1.
- [Phase 7, Plan 02]: CSS-width bar chart used for module patterns — no chart library dependency added.

### Blockers/Concerns

None currently.

## Session Continuity

Last session: 2026-04-23
Stopped at: Completed 07-02-PLAN.md (AccAnalysisPanel + bulkAccSummary extended with roles/modules + ACC Analysis tab in Users section)
Resume file: None
