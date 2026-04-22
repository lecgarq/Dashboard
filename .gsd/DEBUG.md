# Debug Session: Wiki Sync Hang & Security Hardening

## Symptom
Clients were stuck on "Please wait while we sync..." when opening a wiki. Supabase reported critical security vulnerabilities (RLS disabled).

**When:** Every attempt to open a collaborative wiki room.
**Expected:** Instant sync and secure data access.
**Actual:** Handshake hung indefinitely; tables were publicly exposed.

## Evidence
- Server logs showed `Upgrading connection …` but never reached authentication.
- Local tests revealed `DATABASE_URL` was undefined because `.env` was not being loaded.
- Supabase Advisor flagged 28 tables for lack of Row Level Security.

## Hypotheses
- H1: Missing environment variables in standalone script. (CONFIRMED)
- H2: Hocuspocus v3 API mismatch. (CONFIRMED)
- H3: Prisma adapter missing for Supabase pooler. (CONFIRMED)

## Resolution

**Root Cause:**
1. **Environment Isolation**: `yjs-server.mjs` was not loading `.env`, so it had no database credentials.
2. **API Mismatch**: Hocuspocus v3 hooks behave differently than v2.
3. **Token Routing**: Auth tokens from the client (URL params) were not being extracted.
4. **Security Gaps**: RLS was disabled on all tables.

**Fix:**
1. Added `process.loadEnvFile(".env")` and environment validation.
2. Implemented `PrismaPg` adapter with a `pg.Pool`.
3. Added manual query parameter parsing in `onAuthenticate`.
4. Created and ran `fix-supabase-security.js` to enable RLS on 28 tables.

**Verified:**
- Local DB connection test: PASS.
- RLS Hardening: PASS (28 tables secured).
- Production: Pushed to `deploy` branch.
