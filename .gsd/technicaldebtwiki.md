# Technical Debt: Wiki Collaboration Subsystem

> Updated by Codex on 2026-04-16

---

## Execution Status

The previous version of this document mixed shipped behavior with planned work.
This updated audit is based on the current repo state.

### Confirmed current behavior

- The wiki is live in `app/(dashboard)/clash-detection/page.tsx` and `app/(dashboard)/sim-automation/page.tsx`.
- `components/clash/WikiEditor.tsx` already implements:
  - Tiptap + Yjs collaboration
  - optimistic media placeholders via `blob:` URLs
  - parallel media upload with `Promise.all(...)`
  - debounced HTML autosave through tRPC
- `scripts/yjs-server.cjs` persists Yjs binary state to Prisma in `ClashWiki.yjsState` and `SimWiki.yjsState`.
- `/api/wiki-media` uploads files to Google Drive and returns a proxy URL served by `/api/wiki-media/[id]`.
- Clash and Sim wiki CRUD is implemented in `server/routers/clash.ts` and `server/routers/sim.ts`.

### What the previous draft got wrong

- Parallel media upload is not a future task. It is already implemented.
- Optimistic local media rendering is not a future task. It is already implemented.
- Yjs persistence is not a future task. It is already implemented.
- The real unresolved debt is now concentrated in security, consistency, backup coverage, duplication, and observability.

---

## Current Architecture Snapshot

| Area | Current implementation | Notes |
| --- | --- | --- |
| Editor UI | `components/clash/WikiEditor.tsx` | Shared by both Clash and Sim |
| Collaboration transport | `WebsocketProvider` -> `scripts/yjs-server.cjs` | Room naming: `wiki-room-${module}-${section.id}` |
| Durable storage | Prisma `content` + `yjsState` | Two persisted representations of the same document |
| Media upload | `app/api/wiki-media/route.ts` | Google Drive upload via OAuth refresh token |
| Media delivery | `app/api/wiki-media/[id]/route.ts` | Backend proxy stream by raw Drive file ID |
| Section defaults | `lib/wiki-sections.ts` | Seeded on first read |
| Backups | `upsertDriveJsonFile(...)` from router upsert | Only runs on content upsert |
| Write access control | `editorProcedure` | Covers tRPC writes only, not WebSocket/media routes |

---

## Ranked Debt Inventory

### P0 - Security and Data Integrity

| Issue | Files | Impact |
| --- | --- | --- |
| WebSocket collaboration is unauthenticated | `scripts/yjs-server.cjs`, `components/clash/WikiEditor.tsx` | The Yjs server accepts any client that knows a room name. The client appends `?email=...`, but the server does not validate a session, JWT, role, or project membership before allowing read/write sync. |
| Media upload and proxy routes are unauthenticated | `app/api/wiki-media/route.ts`, `app/api/wiki-media/[id]/route.ts` | Any caller that can reach these routes can upload files or request a proxied Drive file by raw `fileId`. This bypasses the editor role checks enforced in tRPC. |
| Dual persistence has no authoritative source of truth | `components/clash/WikiEditor.tsx`, `scripts/yjs-server.cjs`, `server/routers/clash.ts`, `server/routers/sim.ts`, `prisma/schema.prisma` | The same document is stored as HTML (`content`) and Yjs binary (`yjsState`). There is no reconciliation job, checksum, repair tool, or explicit authority rule when they diverge. |

### P1 - Consistency and Recovery

| Issue | Files | Impact |
| --- | --- | --- |
| Drive backup coverage is partial | `server/routers/clash.ts`, `server/routers/sim.ts`, `lib/google-drive.ts` | `backupWikiToDrive(...)` only runs on `upsertWikiSection`. Status changes, reorders, deletes, and Yjs-server-only persistence can leave the Drive JSON backup stale. |
| HTML bootstrap is one-way and brittle | `components/clash/WikiEditor.tsx` | On first sync, the editor injects HTML only if the Yjs doc is empty. There is no inverse rebuild path from `yjsState` to `content`, and no mismatch detection when both exist but disagree. |
| Project scoping is nominal rather than real | `server/trpc.ts`, `lib/wiki-utils.ts`, `prisma/schema.prisma` | The schema stores `projectId`, but tRPC caches the first project globally for the process, and `section` is globally unique with string prefixing. This is not clean multi-project isolation. |

### P2 - Maintainability and Correctness

| Issue | Files | Impact |
| --- | --- | --- |
| Wiki implementation is duplicated across Clash and Sim | `server/routers/clash.ts`, `server/routers/sim.ts`, `prisma/schema.prisma` | CRUD, events, backup logic, and schema structure are effectively copy-pasted. Every wiki fix requires touching both modules. |
| `WikiEditor.tsx` is a 776-line mixed-concern component | `components/clash/WikiEditor.tsx` | Provider lifecycle, autosave, upload pipeline, toolbar UI, title editing, and rendering all live in one file. This slows safe changes and makes behavior harder to test. |
| Media batch failure handling is all-or-nothing | `components/clash/WikiEditor.tsx` | `Promise.all(...)` rejects on the first failed upload. Failed optimistic nodes are not removed, failed blob URLs may remain unreleased, and partial success is handled poorly. |
| Awareness cleanup is likely incorrect | `scripts/yjs-server.cjs` | On socket close, the server removes `room.doc.clientID` from awareness instead of the disconnected client's awareness IDs. This risks stale cursors/presence state. |
| Section key normalization is heuristic | `lib/wiki-sections.ts`, `lib/wiki-utils.ts` | `normalizeWikiSectionKey(...)` assumes a long first segment means "project prefix". This is fragile and compensates for schema design rather than fixing it. |

### P3 - UX, Operations, and Observability

| Issue | Files | Impact |
| --- | --- | --- |
| No explicit collaboration/offline indicator | `components/clash/WikiEditor.tsx` | Users see autosave state for tRPC HTML upserts, but there is no clear "connected/disconnected/resyncing" state for the Yjs provider itself. |
| Client/runtime logging is still console-based | `components/clash/WikiEditor.tsx`, `components/clash/WikiEditorBoundary.tsx`, `scripts/yjs-server.cjs` | Diagnostics are hard to aggregate and noisy in production. There are no structured metrics for room counts, save failures, upload failures, or reconnect churn. |
| Link insertion still uses `window.prompt()` | `components/clash/WikiEditor.tsx` | Functional but poor UX and not aligned with the rest of the dashboard UI. |
| Yjs persistence writes full state snapshots | `scripts/yjs-server.cjs` | Every debounced save writes the entire encoded document. Fine at current scale, but inefficient for larger docs or heavier concurrent use. |

---

## Debt That Is Already Resolved

These items should no longer appear as open work in wiki planning docs:

- Parallel media upload
- Optimistic media placeholders
- Media proxy route existence
- Prisma-backed Yjs state persistence
- Shared editor component reuse across Clash and Sim pages
- Default wiki section seeding

---

## Recommended Fix Order

1. Lock down WebSocket and media route access.
2. Define one authoritative wiki document format and add reconciliation tooling.
3. Make backup/export coverage match every mutating pathway.
4. Fix media batch cleanup and awareness teardown correctness.
5. Extract shared wiki server/client logic and clean up project scoping.
6. Add provider connection UX and structured telemetry.

---

## Bottom Line

The wiki subsystem is no longer in a "feature missing" state. It is in a "shipped but under-hardened" state.

The biggest remaining risks are not editor capability. They are:

- unauthenticated real-time and media surfaces
- inconsistent dual persistence
- stale backup paths
- duplicated module logic that makes every fix cost double
