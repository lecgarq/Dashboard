# Debug Session: 20260406-OAUTH-LOGIN-ERROR

## Symptom
**Sign-in error. Please try again.** when returning from the Google/Autodesk OAuth flow.

**When:** Occurs immediately upon clicking the OAuth provider buttons or completing the provider sign-in flow.
**Expected:** The user should be successfully authenticated and redirected to the dashboard.
**Actual:** User is redirected to `/login?error=undefined`, and the server logs display `Error querying the database: Error code 14: Unable to open database file`.

## Evidence Checklist
- [x] Check Server Logs (`error=undefined` and DB code 14)
- [x] Check `.env` configuration for Database (`DATABASE_URL`)
- [x] Verify file existence at configured DB path

## Hypotheses
| # | Hypothesis | Likelihood | Status |
|---|------------|------------|--------|
| 1 | SQLite database path in `.env` is incorrect or outdated | 99% | CONFIRMED |
| 2 | SQLite database file lacks read/write permissions | 1% | UNTESTED |
| 3 | Prisma Client is out of sync with schema | 0% | ELIMINATED |

## Attempts

### Attempt 1
**Testing:** H1 — Database Path Check
**Action:** Ran `Test-Path` on the configured `DATABASE_URL` path vs current directory.
**Result:** `DATABASE_URL` is hardcoded to `C:\Users\luis.cortes\Desktop\Dashboard\prisma\dev.db` which returns `False`. The actual file resides at `C:\LECG\Dashboard\prisma\dev.db` (`True`).
**Conclusion:** CONFIRMED. The project was moved, but the explicit absolute path in `.env` wasn't updated.

## Resolution
**Root Cause:** The `DATABASE_URL` in `.env` was using a hardcoded, outdated absolute path from the `Desktop` directory.
**Fix:** Modified the `.env` file to use a standard local relative path: `DATABASE_URL="file:./dev.db"`. This makes the project portable regardless of what folder it resides in.
**Verified:** Restarted the Next.js server to pick up the revised database link.
**Regression Check:** N/A - Path change only affects the DB connection string.

# Debug Session: 20260408-NGROK-UNDEFINED

## Symptom
`ERR_NGROK_8012` with `undefined://undefined` upstream address.

## Evidence
- Port 3000 was LISTENING but ngrok reported `undefined`.
- A hidden `ngrok.exe` process (PID 48656) was found via `taskkill` even though `tasklist` missed it.

## Resolution
**Root Cause**: A stale background ngrok process was mismatched with its config.
**Fix**: Killed all Node/Ngrok processes and patched `scripts/run-tunnel.js` to read port from env after loading the file.
**Verified**: Fresh tunnel established and domain released.

# Debug Session: 20260408-CONNECTION-REFUSED

## Symptom
`failed to dial backend ... (os error 10061)`

## Evidence
- `netstat` showed port 3000 listening on `0.0.0.0` (IPv4) but NOT on `[::]` (IPv6).
- ngrok agent defaulting to IPv6 (`::1`) when hitting `localhost`, resulting in refusal.

## Resolution
**Root Cause**: IPv6/IPv4 binding mismatch on Windows.
**Fix**: Modified `scripts/run-tunnel.js` to force the `addr` to `127.0.0.1:${LOCAL_PORT}`.
**Verified**: Tunnel successfully established connection to the upstream backend.

# Debug Session: 20260408-INTERNAL-SERVER-ERROR

## Symptom
`500 Internal Server Error` in browser.

## Evidence
- `npm run dev` logs mentioned `Cannot find module './5611.js'`.
- Occurred during a large refactor while a dev server was already running.

## Resolution
**Root Cause**: Stale Next.js build cache and stalled background processes.
**Fix**: Cold boot—stopped all Node processes, deleted `.next` folder, and restarted `npm run dev`.
**Verified**: TBD (Waiting for server boot).
