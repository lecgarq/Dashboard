# Project State

> Last Updated: 2026-04-16

## Active Position

The roadmap debt pass for phases `9-12` is functionally complete. The repo is on Next.js `16.2.4`, the tracked technical-debt ledger is cleared in code, and the production recovery work from earlier in the day remains intact.

## Current Status

- Architecture and stack mapping are current.
- Sim/Clash now share a common module router and documentation page implementation.
- The live families route uses the virtualized Kanban board.
- APS project search caching now lives in Redis instead of Prisma.
- Proxy no longer intercepts `/api/*` requests, and UploadThing routes enforce editor/admin auth directly.
- The LOD engine supports CUDA device pinning for both query encoding and the batch pipeline.

## Verified Outcomes

- `npm run build` passes on Next.js `16.2.4`.
- `python -m py_compile services/lod-engine/server.py` passes.
- Railway public production was previously restored and remains represented in state as healthy.

## Residual Notes

- `npx prisma generate` could not complete on this workstation because Windows is holding a lock on `node_modules/.prisma/client/query_engine-windows.dll.node`.
- The repo now treats `AUTH_URL` / `AUTH_SECRET` as canonical. Legacy `NEXTAUTH_*` env vars remain compatibility fallbacks if present.

## Next Action

1. Run browser smoke tests for `/login`, `/families`, `/clash-detection`, `/sim-automation`, and `/trello`.
2. Re-run `npx prisma generate` after the Prisma engine DLL lock is cleared.
3. If desired, prune legacy `NEXTAUTH_*` variables from live Railway environments after confirming the deployed service already has canonical `AUTH_*` values.
