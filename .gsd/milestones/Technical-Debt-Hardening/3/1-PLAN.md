---
phase: 3
plan: 1
wave: 1
---

# Plan 3.1: Collaborative Data Persistence Hardening

## Objective
Harden the synchronization between the real-time Hocuspocus/Yjs server and the PostgreSQL database. Currently, only the binary `yjsState` is persisted, leaving the searchable `content` field stale. This plan ensures both fields are kept in sync and adds a fallback mechanism to seed collaborative rooms from existing static content.

## Context
- .gsd/SPEC.md
- scripts/yjs-server.mjs
- prisma/schema.prisma

## Tasks

<task type="auto">
  <name>Implement Content Extraction in Yjs Server</name>
  <files>
    <file>scripts/yjs-server.mjs</file>
  </files>
  <action>
    1. Research how Tiptap/Yjs stores content in the `Y.Doc` (usually a `Y.XmlFragment` named "default").
    2. Add logic to the `store` hook in `yjs-server.mjs` to extract the text or XML content from the Yjs state.
    3. Since we don't have the full Tiptap environment on the server, use `Y.Doc` directly to get the `default` fragment's content as a string.
  </action>
  <verify>Check `yjs-server.mjs` for the inclusion of `Y.Doc` processing in the `store` hook.</verify>
  <done>Yjs server can extract human-readable content from the binary state.</done>
</task>

<task type="auto">
  <name>Sync Dual Fields and Implement Seeding Fallback</name>
  <files>
    <file>scripts/yjs-server.mjs</file>
  </files>
  <action>
    1. Update the `Database` extension's `store` method to update both `yjsState` and `content` fields in Prisma.
    2. Update the `fetch` method to handle cases where `yjsState` is null but `content` is not. In this case, initialize the Yjs document with the static content (if possible, or log it as a gap).
    3. Add error handling and retries for Prisma operations to prevent data loss on transient DB issues.
  </action>
  <verify>Modify a wiki section collaboratively and check if the `content` column in the database is updated along with `yjsState`.</verify>
  <done>Prisma/Hocuspocus synchronization is robust and keeps both binary and text fields updated.</done>
</task>

## Success Criteria
- [ ] `ClashWiki` and `SimWiki` `content` fields are updated automatically on collaborative edits.
- [ ] `yjs-server.mjs` handles database connection drops gracefully with retries.
- [ ] No data loss occurs during high-frequency collaborative sessions.
