## 2026-04-16 - Client logging and typecheck sweep

- Added `lib/client-logger.ts` and migrated the following files off direct client-side `console.*` usage:
  - `hooks/use-event-source.ts`
  - `hooks/use-chat-pulse.ts`
  - `components/families/FamilyDetailPanel.tsx`
  - `components/clash/WikiEditorBoundary.tsx`
  - `app/(dashboard)/error.tsx`
- Reduced the remaining client-side raw `console.*` debt to the 6 calls still isolated in `components/clash/WikiEditor.tsx`.
- Cleared repo-wide TypeScript blockers in:
  - `app/api/gmail/attachment/route.ts`
  - `app/api/wiki-media/[id]/route.ts`
  - `lib/email.ts`
  - `lib/server/google-service-auth.ts`
  - `lib/sound-engine.ts`
- Updated `.gsd/TECHNICAL_DEBT.md` to reflect the new logging count and the broader verification state for this turn.
- Validation:
  - `npx tsc --noEmit --pretty false` -> passed.
  - `rg -n "console\\.(log|warn|error|info|debug)" app components hooks lib --glob '!**/*.md'` -> only `components/clash/WikiEditor.tsx` plus centralized logger sinks remain.

## 2026-04-16 - Users router debt reduction

- Replaced legacy raw SQL in `server/routers/users.ts` with Prisma model operations for:
  - directory/profile reads
  - `PendingRequest`
  - `PasswordResetToken`
  - `UserModuleAccess`
  - avatar updates
- Removed the manual raw-SQL row helper interfaces from `users.ts`.
- Updated `.gsd/TECHNICAL_DEBT.md` to reflect that `users.ts` is no longer an open raw-SQL debt item and to align the current raw-SQL/type-safety priorities with the codebase.
- Validation:
  - `npx tsc --noEmit --pretty false` -> passed.
  - `rg -n '\$queryRaw|\$executeRaw|\$queryRawUnsafe|\$executeRawUnsafe' server/routers/users.ts` -> no matches.

## 2026-04-08 - Google Chat upload/status continuation

- Updated Google Chat attachment handling so uploaded content uses `attachmentDataRef.resourceName` end-to-end.
- Reworked the upload route to accept multiple files, upload them to Chat, and create a single message with the returned attachment refs.
- Replaced the misleading recipient-avatar "read receipt" UI with a simple sent indicator on the user's own messages.
- Validation:
  - `npx tsc --noEmit --pretty false` -> passed.
  - `npx eslint components/dashboard/ChatPanel.tsx app/api/chat/upload/route.ts app/api/chat/media/route.ts lib/google-chat.ts` -> no errors; repo ESLint config is effectively empty and reported only "File ignored because no matching configuration was supplied" warnings.

## 2026-04-08 - Architecture debt remediation

- Added shared server infrastructure for:
  - structured JSON logging
  - centralized Google OAuth/Drive service config resolution
  - normalized Google integration error classification
- Migrated the current Google-backed routes/helpers and tRPC boundary onto the shared infrastructure.
- Updated `.gsd/ARCHITECTURE.md` and `.gsd/STATE.md` to reflect the completed debt items and the remaining PostgreSQL architecture migration.
- Validation:
  - `npx tsc --noEmit --pretty false` -> passed.

## 2026-04-08 - SQLite to PostgreSQL migration

- Downloaded and extracted the official PostgreSQL 18.3 Windows x64 binaries into `.local/postgresql18` because the system-wide installer was unavailable from the current shell.
- Initialized a local PostgreSQL cluster, started it on `localhost:5432`, created the `dashboard` database, and switched `.env` plus `prisma/schema.prisma` to PostgreSQL.
- Created the initial Prisma migration, exported the existing `prisma/dev.db` data, and imported it into PostgreSQL with matching row counts.
- Added local database control scripts in `package.json` backed by `scripts/postgres-local.js`.
