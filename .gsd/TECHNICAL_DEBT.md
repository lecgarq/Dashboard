# Technical Debt

> Last verified: 2026-04-16

## Status

All tracked debt items `D1` through `D10` are now addressed in the repo and verified with a successful `npm run build`.

## Resolution Ledger

| ID | Item | Resolution | Evidence |
| --- | --- | --- | --- |
| D1 | Sim/Clash BaseModule Abstraction | Shared module router + shared documentation page now back both modules. | `server/routers/module-router.ts`, `components/modules/ModuleDocumentationPage.tsx` |
| D2 | Yjs WebSocket Authentication | Collaboration tokens are issued server-side and validated by the Yjs server before room access. | `app/api/wiki-collab-token/route.ts`, `scripts/yjs-server.cjs` |
| D3 | Wiki Dual-Persistence (HTML/YJS) | Wiki sections persist both HTML content and Yjs state. | `prisma/schema.prisma`, `scripts/yjs-server.cjs`, `components/clash/WikiEditor.tsx` |
| D4 | Decompose Oversized Components | Clash/Sim pages were collapsed into thin wrappers, Trello page was split into dedicated components, and WikiEditor internals were extracted into focused modules. | `app/(dashboard)/clash-detection/page.tsx`, `app/(dashboard)/sim-automation/page.tsx`, `app/(dashboard)/trello/page.tsx`, `components/clash/wiki-editor/*`, `components/trello/*` |
| D5 | Family Table Infinite Scroll | The live families route now uses the virtualized Kanban board instead of rendering every card in-page. | `app/(dashboard)/families/page.tsx`, `components/families/KanbanBoard.tsx` |
| D6 | tRPC Zod Schema Drift | Shared module and family schemas now back the affected routes and UI flows. | `lib/shared/module-schemas.ts`, `server/routers/module-router.ts`, `app/(dashboard)/families/page.tsx` |
| D7 | ApsProject Cache -> Redis | APS project search cache moved to Upstash Redis with search-text-aware keys and invalidation index tracking. | `server/routers/aps-search.ts`, `lib/redis.ts` |
| D8 | LOD Engine: CUDA Affinity | The query encoder and batch pipeline can now pin to specific CUDA device indices. | `services/lod-engine/server.py`, `services/lod-engine/README.md` |
| D9 | Middleware Payload Limit | `proxy.ts` no longer runs on `/api/*`, removing request-body buffering from upload/API paths; upload handlers now enforce their own auth. | `proxy.ts`, `app/api/uploadthing/core.ts` |
| D10 | Railway ENV Cleanup | `AUTH_URL` / `AUTH_SECRET` are now the canonical runtime inputs, with `NEXTAUTH_*` kept only as legacy compatibility fallbacks in repo tooling. | `lib/auth-env.ts`, `next.config.ts`, `proxy.ts`, `README.md`, `scripts/env-utils.cjs`, `scripts/dashboard_manager.py` |

## Verification

- `npm run build` passes on Next.js `16.2.4`.
- `python -m py_compile services/lod-engine/server.py` passes.
- `npx prisma generate` is currently blocked on this workstation by a locked Windows Prisma engine DLL (`query_engine-windows.dll.node`), so schema regeneration was not re-run in this pass.
