# Implementation Plan: Wiki Collaboration Hardening

> Updated by Codex on 2026-04-16
> Scope: Bring the existing wiki implementation to a secure, consistent, supportable state.

---

## Planning Baseline

This is not a greenfield build plan.

The following are already implemented and should not be replanned as if they are missing:

- shared `WikiEditor` used by Clash and Sim
- Tiptap + Yjs real-time editing
- optimistic media placeholders with local `blob:` URLs
- parallel upload initiation with `Promise.all(...)`
- Prisma persistence for both HTML and Yjs binary state
- Google Drive upload and proxy routes
- default section seeding and CRUD routers

The updated plan starts from that shipped baseline and targets the actual gaps identified in `.gsd/technicaldebtwiki.md`.

---

## Target Outcome

After this plan:

- only authenticated and authorized users can read or write live wiki state
- wiki persistence has a clear source of truth and a recovery path
- backups/export stay in sync with every mutation path
- media upload failures clean up after themselves
- Clash and Sim wiki logic is shared instead of duplicated
- editors can see collaboration connectivity state

---

## Phase 1 - Secure the collaboration and media surfaces

### Goal

Close the current access-control gaps before adding more features.

### Files in scope

- `scripts/yjs-server.cjs`
- `components/clash/WikiEditor.tsx`
- `app/api/wiki-media/route.ts`
- `app/api/wiki-media/[id]/route.ts`
- `server/auth.ts`

### Work

1. Add authenticated WebSocket handshaking.
2. Pass a verifiable auth token from the client instead of only `?email=...`.
3. Validate session, role, module, and project access before joining a room.
4. Reject unknown room patterns early.
5. Protect `POST /api/wiki-media` with the same editor-or-admin rule used by wiki writes.
6. Replace the raw `fileId` media proxy with one of:
   - a signed short-lived token
   - a server-side lookup that only serves file IDs already referenced by wiki content
7. Ensure proxy responses cannot be used as a generic Drive file fetcher.

### Acceptance criteria

- An unauthenticated socket connection cannot join a wiki room.
- A `VIEWER` cannot upload wiki media.
- A raw `/api/wiki-media/[id]` request without authorization or a valid signed token is rejected.
- Existing editor flows still work for `EDITOR` and `ADMIN`.

---

## Phase 2 - Make persistence explicit and repairable

### Goal

Remove ambiguity between HTML and Yjs persistence.

### Files in scope

- `components/clash/WikiEditor.tsx`
- `scripts/yjs-server.cjs`
- `server/routers/clash.ts`
- `server/routers/sim.ts`
- `prisma/schema.prisma`

### Decision

Treat `yjsState` as the authoritative collaborative document.
Treat HTML as a derived snapshot for non-collaborative read paths, exports, search, or backup convenience.

### Work

1. Stop describing HTML upsert as "metadata only" when it still writes full content.
2. Split wiki writes into clear pathways:
   - metadata update: title/status/order
   - content snapshot update: derived HTML only when needed
3. Add a reconciliation utility that can:
   - rebuild HTML from `yjsState`
   - flag rows where `content` and `yjsState` disagree
4. Add a migration/backfill script for existing rows.
5. Document the failure policy:
   - if Yjs exists and HTML is stale, regenerate HTML
   - if HTML exists and Yjs is missing, bootstrap once and mark repaired

### Acceptance criteria

- There is one documented source of truth.
- Operators have a script or command to repair mismatched wiki rows.
- New edits no longer rely on ambiguous dual-write behavior.

---

## Phase 3 - Fix backup and export consistency

### Goal

Make backup state follow every real mutation, not just section upserts.

### Files in scope

- `server/routers/clash.ts`
- `server/routers/sim.ts`
- `lib/google-drive.ts`
- any new shared wiki service extracted during implementation

### Work

1. Centralize wiki backup/export into a shared helper.
2. Invoke backup after:
   - content upsert
   - status change
   - reorder
   - delete
3. Decide whether Yjs-server flushes should also trigger or queue backup refresh.
4. Store backup metadata such as:
   - last successful backup time
   - last attempted backup time
   - failure reason
5. Make backup drift visible in logs or admin diagnostics.

### Acceptance criteria

- Drive JSON export reflects the current DB state after every mutating workflow.
- Backup failures are visible and debuggable.

---

## Phase 4 - Make media upload failure-safe

### Goal

Keep optimistic upload UX without leaving broken nodes behind.

### Files in scope

- `components/clash/WikiEditor.tsx`
- `app/api/wiki-media/route.ts`

### Work

1. Replace `Promise.all(...)` with `Promise.allSettled(...)` or equivalent per-file handling.
2. Track each optimistic node independently.
3. On upload failure:
   - remove the optimistic node, or mark it failed with a visible retry state
   - revoke the local blob URL
   - keep successful uploads committed
4. Improve progress reporting so partial completion is accurate.
5. Add client-side guards for unsupported types and oversized uploads.

### Acceptance criteria

- One failed file does not poison the whole batch.
- No orphaned optimistic nodes remain after a failed upload.
- Blob URLs are revoked on both success and failure paths.

---

## Phase 5 - Remove duplication and fix tenancy shape

### Goal

Reduce maintenance cost and stop encoding project scoping into string keys.

### Files in scope

- `server/routers/clash.ts`
- `server/routers/sim.ts`
- `lib/wiki-utils.ts`
- `lib/wiki-sections.ts`
- `server/trpc.ts`
- `prisma/schema.prisma`

### Work

1. Extract a shared wiki router factory or shared service layer for:
   - default section seeding
   - CRUD
   - backup/export
   - event emission
2. Replace global `section @unique` with composite uniqueness that matches the data model, such as `@@unique([projectId, section])`.
3. Stop prefixing raw section names with `projectId` strings.
4. Remove `normalizeWikiSectionKey(...)` heuristics once schema-level scoping exists.
5. Decide explicitly whether the dashboard is:
   - truly single-project, in which case simplify the schema/context
   - multi-project capable, in which case remove the process-wide cached `findFirst()` project selection

### Acceptance criteria

- A wiki fix lands in one shared code path, not two copy-pasted routers.
- Project scoping is enforced by schema and context, not string munging.

---

## Phase 6 - Presence, status UX, and telemetry

### Goal

Make the subsystem operable and understandable during failures.

### Files in scope

- `components/clash/WikiEditor.tsx`
- `components/clash/WikiEditorBoundary.tsx`
- `scripts/yjs-server.cjs`
- logging helpers under `lib/server/*`

### Work

1. Surface provider state in the editor:
   - connected
   - reconnecting
   - offline
   - sync error
2. Separate "HTML snapshot saved" from "real-time collaboration connected".
3. Replace ad hoc `console.*` calls with structured logging where possible.
4. Track useful server metrics:
   - active rooms
   - active connections
   - save duration
   - save failures
   - upload failures
5. Fix awareness teardown so disconnected clients do not leave stale presence behind.
6. Replace `window.prompt()` link entry with a proper modal/popover.

### Acceptance criteria

- Users can tell whether collaboration is connected.
- Operators can identify room churn, failed saves, and upload errors.
- Presence state clears correctly after disconnect.

---

## Suggested Delivery Order

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6

Phases 3 and 4 can overlap after Phase 2 starts, but Phase 1 should not wait.

---

## Out of Scope for This Pass

- replacing Yjs with another collaboration backend
- redesigning the editor visual language
- advanced delta/snapshot optimization before auth and consistency are fixed
- module-specific feature expansion for Clash or Sim

---

## Bottom Line

The wiki does not need another invention pass.
It needs a hardening pass.

The fastest safe path is:

1. secure the open surfaces
2. pick one authoritative document format
3. make backup/export follow every mutation
4. then clean up the duplicated implementation
