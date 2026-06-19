# External Integrations

**Analysis Date:** 2026-06-19

**Primary Sources:**
- `.tools/repo-map/manifest.json`
- `.tools/repo-map/architecture-summary.md`
- `.env.example`
- `package.json`
- `server/routers/root.ts`
- `server/db.ts`
- `auth.config.ts`

## APIs & External Services

**Autodesk Platform Services / ACC:**
- Purpose: Autodesk Construction Cloud data ingestion, account/project/member/activity/folder/issue workflows, model derivative access, OSS, and access-analysis datasets.
- SDK/Client: `@aps_sdk/authentication`, `@aps_sdk/model-derivative`, `@aps_sdk/oss`, plus ACC/Data Connector scripts under `scripts/acc-*.cjs`, `scripts/dc-*.cjs`, and server/lib code under `lib/acc/`.
- Auth/env: `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_CALLBACK_URL`, `APS_SCOPES`, `APS_PROJECT-ID`, `APS_HUB_ID`.
- Key code paths: `server/routers/acc-sync.ts`, `server/routers/acc-activity.ts`, `server/routers/acc-members.ts`, `server/routers/acc-folders.ts`, `server/routers/acc-dc-graph.ts`, `lib/acc/`.

**Google APIs:**
- Purpose: OAuth sign-in, Gmail/mail panel, Calendar, Drive/Sheets-backed workflows, and chat/mail support surfaces.
- SDK/Client: `googleapis`.
- Auth/env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_SHEETS_ID`.
- Key code paths: `lib/google/`, `server/routers/gmail.ts`, `server/routers/calendar.ts`, `server/routers/chat.ts`, `components/dashboard/MailPanel.tsx`, `components/dashboard/chat-panel/`.

**OpenAI API:**
- Purpose: AI generation features, including description generation.
- SDK/Client: `openai`.
- Auth/env: `OPENAI_API_KEY`, `OPENAI_MODEL`.
- Key code paths: `app/api/ai/generate-description/route.ts` and server/client helpers that call the OpenAI SDK.

**UploadThing / UTFS:**
- Purpose: Upload and serve media/files.
- SDK/Client: `uploadthing`, `@uploadthing/react`.
- Auth/env: `UPLOADTHING_SECRET`, `UPLOADTHING_APP_ID`, `UPLOADTHING_TOKEN`.
- Key code paths: `app/api/uploadthing/route.ts`, `lib/server/uploadthing.ts`.
- Image hosts allowed in `next.config.ts`: `uploadthing.com`, `utfs.io`.

**Resend:**
- Purpose: Password reset / transactional email support.
- Auth/env: `RESEND_API_KEY`, `RESEND_EMAIL`, `RESEND_ID`.
- Key code paths: `lib/server/email.ts`.

**Redis / Upstash:**
- Purpose: Cache or realtime coordination where configured.
- SDK/Client: `@upstash/redis`, `ws`.
- Auth/env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `REDIS_URL`.

**Trello:**
- Purpose: Trello board/card integrations and callback flows.
- Integration method: API route callbacks and router/client helpers.
- Key code paths: `server/routers/trello.ts`, `lib/trello/client.ts`, `app/api/auth/callback/trello/route.ts`, `app/api/connect/trello/route.ts`, `components/trello/`.

## Data Storage

**PostgreSQL:**
- Purpose: Primary application datastore.
- Client: Prisma 7 via `@prisma/adapter-pg` in `server/db.ts`.
- Connection/env: `DATABASE_URL`, `DIRECT_URL`.
- Pool/env: `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS`.
- Schema/migrations: `prisma/schema.prisma`, `prisma/migrations/`, `prisma/migrations-raw/`.
- ERD: `docs/erd.md`.

**Prisma ORM:**
- Purpose: ORM and model access for auth, project modules, ACC/Data Connector data, LOD data, tasks, wiki, and sync state.
- Client lifecycle: global Prisma singleton in `server/db.ts` for dev reuse.
- Guardrail: Prisma access belongs in server/lib/scripts, not client components.

**Upload/File Storage:**
- UploadThing/UTFS handles uploads and file URLs.
- Additional media routes exist under `app/api/wiki-media/`, `app/api/chat/media/`, `app/api/chat/upload/`, and `app/api/lod-img/[fileId]/route.ts`.

## Authentication & Identity

**NextAuth:**
- Implementation: `auth.config.ts`, `server/auth.ts`, `app/api/auth/[...nextauth]/route.ts`, and Prisma adapter-backed auth models in `prisma/schema.prisma`.
- Public routes: `/login`, `/unauthorized`, `/register`, `/forgot-password`, `/reset-password`.
- API routes bypassed by the auth guard include `/api/auth`, `/api/connect`, `/api/trpc`, `/api/wiki-collab-token`, and `/api/wiki-media`.
- Session/authorization helpers: `protectedProcedure`, `adminProcedure`, and `editorProcedure` in `server/trpc.ts`.

**Google OAuth:**
- Provider credentials: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Google image host allowed in `next.config.ts`: `lh3.googleusercontent.com`.

**Admin Promotion:**
- Env: `ADMIN_EMAIL`.
- Role checks are enforced at the tRPC procedure boundary through `adminProcedure` and `editorProcedure`.

## Realtime and Collaboration

**Yjs / Hocuspocus:**
- Purpose: Collaborative editing and document state.
- Packages: `yjs`, `y-protocols`, `@hocuspocus/server`, `@hocuspocus/provider`, `@hocuspocus/extension-database`, `@hocuspocus/extension-logger`.
- Key code paths: `scripts/yjs-server.mjs`, wiki/collaboration API routes, TipTap editor components.

**Server-Sent Events / Events:**
- Key routes: `app/api/events/trello/route.ts`, `app/api/events/users/route.ts`, `app/api/clash-updates/route.ts`, `app/api/sim-updates/route.ts`.
- Client helpers: `hooks/use-event-source.ts`, notification hooks under `hooks/`.

## Monitoring & Observability

**Application Logs:**
- No dedicated external error-tracking SDK was detected in the fresh repo-map.
- Runtime logging is mostly console/server logs and script output.
- `next.config.ts` strips `console.log` in production while preserving `error` and `warn`.

**Repo Structural Observability:**
- `npm run repo-map:check` records dependency, AST, and Repomix artifacts under `.tools/repo-map/`.
- Quality gate status on 2026-06-19: 0 dependency errors, 0 circulars, 6 dependency warnings within baseline, 0 new blocking AST findings.

## CI/CD & Deployment

**Build/Start:**
- Build: `npm run build` -> `next build --webpack`.
- Production start: `npm run start` or `npm run start:prod`.
- Dev stack: `npm run dev`, `npm run dev:next`, and `npm run dev:restart`.

**Local Infrastructure:**
- PostgreSQL helpers: `scripts/postgres-local.js` via `npm run db:start|db:stop|db:status`.
- LOD service: `npm run lod:engine`.
- Tunnel/public preview: `npm run tunnel`, `npm run preview`.

## Environment Configuration

**Development:**
- Copy `.env.example` to `.env` and fill values locally.
- Do not commit `.env` or generated secret-bearing artifacts.
- Important dev feature flags: `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS`, `NEXT_PUBLIC_ACC_GPU_2D`, `NEXT_PUBLIC_ACC_GRAPH_TEST`.

**Testing:**
- `vitest.setup.ts` sets test `DATABASE_URL` and `NODE_ENV=test` and mocks server-only/NextAuth boundaries.
- `playwright.config.ts` uses isolated `NEXT_DIST_DIR=.next-e2e` and default `E2E_PORT=3100`.

**Production:**
- Store secrets in the deployment environment, not in repo docs.
- `server/db.ts` prefers `DIRECT_URL` in production when available.
- `AUTH_TRUST_HOST` and configured auth hosts affect `next.config.ts` allowed origins.

## Webhooks & Callbacks

**Incoming/Callback Routes:**
- `app/api/auth/[...nextauth]/route.ts` - NextAuth callbacks.
- `app/api/auth/callback/trello/route.ts` - Trello auth callback.
- `app/api/connect/[provider]/route.ts` and `app/api/connect/trello/route.ts` - Provider connection flows.
- `app/api/uploadthing/route.ts` - UploadThing route handler.
- `app/api/chat/stream/route.ts` and event routes - realtime/dashboard streams.

**Outgoing:**
- Autodesk/APS, Google, UploadThing, Resend, OpenAI, Redis/Upstash, and Trello calls originate from server routes, server helpers, and scripts.

---

*Integration audit: 2026-06-19*
*Update when adding/removing external services or changing auth/env contracts.*
