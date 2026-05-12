# External Integrations

**Analysis Date:** 2026-05-12

## Autodesk APS (BIM 360 / Construction Cloud)

**Purpose:** Source-of-truth for projects, users, folders, members, roles, model derivatives, and activity.

**SDKs:**
- `@aps_sdk/authentication` — 3-legged + 2-legged OAuth
- `@aps_sdk/model-derivative` — Model viewer / translation
- `@aps_sdk/oss` — Object Storage Service uploads

**Endpoints used (representative):**
- Data Management API — hubs, projects, folders, items, versions
- Account Admin v1 (HQ) — companies, account-admin lookup (gated; see MISS-001)
- ACC `bim360/admin/v1` — project members, project users
- Account Activity (Data Connector export ZIP) — `lib/acc/ingestActivityZip.ts`
- Model Derivative — translation manifests, viewable URNs

**Auth flow:**
- User-tied OAuth via NextAuth `Autodesk` provider (`server/auth.ts`)
- Refresh handled per-request; tokens stored on `Account`/`Session`

**Key files:**
- `lib/acc/acc-sync.ts`, `lib/acc/quick-sync-extraction.ts`
- `server/routers/acc-sync.ts`, `server/routers/acc-folders.ts`, `server/routers/acc-graph.ts`, `server/routers/acc-members.ts`, `server/routers/acc-activity.ts`, `server/routers/aps-search.ts`

**Known blocker:** Production APS `client_id` is not authorized for the **Data Connector** API. Must be enabled in `aps.autodesk.com/myapps` + provisioned in ACC Account Admin before Phase 3 UAT.

## Google APIs

**SDK:** `googleapis` (v171)

**Services used:**
| Service          | Purpose                                       | Files                          |
|------------------|-----------------------------------------------|--------------------------------|
| Gmail            | Read/draft messages, label management         | `lib/google/gmail*`, `server/routers/gmail.ts` |
| Google Sheets    | Import/export structured data                 | `lib/google/sheets*`           |
| Google Drive     | File storage option, document linkage         | `lib/google/drive*`            |
| Google Calendar  | Event sync                                    | `lib/google/calendar*`, `server/routers/calendar.ts` |
| Google Forms     | Survey / exam responses                       | `lib/google/forms*`            |
| Google Chat      | OAuth provider + bot messaging                | `lib/google/chat*`, `server/routers/chat.ts` |

**Auth:** NextAuth `Google` provider (OAuth 2.0). Scopes requested per service. Refresh tokens persisted in `Account`.

## Database — PostgreSQL

**Driver:** `pg` 8.x + `@prisma/adapter-pg`
**ORM:** Prisma 7.8

**Connection:**
- `DATABASE_URL` (pooled, via PgBouncer on Railway)
- `DIRECT_URL` (unpooled, used by Prisma Migrate)

**Schema:** `prisma/schema.prisma` — single-file schema; models span ACC sync, NextAuth, modules, tasks, exam, families, LOD, clash, sim.

**Migrations:** `prisma/migrations/*.sql` — autoincrementing timestamped directories.

## File Storage

| Provider          | Use                                             |
|-------------------|-------------------------------------------------|
| Uploadthing       | App-managed file uploads (attachments, images)  |
| Autodesk OSS      | Model / BIM file uploads tied to ACC project    |
| Google Drive      | Document linkage from Drive (no upload)         |

## Cache & Messaging

**Upstash Redis** (`@upstash/redis`)
- Used for short-lived caching and rate-limit/lock primitives
- Client in `lib/redis.ts`
- Optional in dev (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)

## Real-Time Collaboration

**Hocuspocus + Yjs**
- Standalone WebSocket server (`Dockerfile.yjs`, `railway.yjs.toml`)
- Persists Yjs docs via `@hocuspocus/extension-database` → PostgreSQL
- Client connects via `@hocuspocus/provider`
- Powers TipTap collaborative editing in wiki/notes

## Authentication — NextAuth v5

**Providers:**
1. **Google** — primary login
2. **Google Chat** — bot identity / chat messaging scopes
3. **Autodesk APS** — required for ACC data access (per-user tokens)
4. **Credentials** — bcrypt password fallback (admin / dev accounts)

**Adapter:** `@auth/prisma-adapter` — sessions and accounts persisted in DB

**Config:** `auth.config.ts` + `server/auth.ts`

## OpenAI

- `openai` v6 — generative descriptions (project summaries, family descriptions)
- Env: `OPENAI_API_KEY`

## Incoming Webhooks

| Source            | Endpoint                                    | Purpose                       |
|-------------------|---------------------------------------------|-------------------------------|
| Trello            | `app/api/webhooks/trello/route.ts`          | Card/list change notifications |
| Clash detection   | `app/api/webhooks/clash/route.ts`           | Pipeline finish callbacks      |
| Sim updates       | `app/api/webhooks/sim/route.ts`             | Simulation pipeline updates    |

## Outgoing Integrations

- **Trello** — REST API (board/card sync) via API key + token
- **Google Chat** — message posting from bot account
- **ngrok** (dev only) — expose local webhook receiver

## Cron / Background

Three Railway services, each with its own toml:
- `railway.toml` — main web app
- `railway.cron.toml` — Quick Sync + folder crawl cron
- `railway.yjs.toml` — Hocuspocus collab server
- `railway.submitter.toml` — submission worker

Cron triggers `acc-sync` quick path on a schedule; weekly path for folder crawl gated by `FOLDER_CRAWL_IN_RELEASE`.

## Required Environment Variables

**Core:**
- `DATABASE_URL`, `DIRECT_URL`
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET` (or `AUTH_SECRET`)
- `NODE_ENV`

**Autodesk APS:**
- `APS_CLIENT_ID`, `APS_CLIENT_SECRET`
- `APS_CALLBACK_URL`
- `APS_SCOPES` (optional override)

**Google:**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CHAT_CLIENT_ID`, `GOOGLE_CHAT_CLIENT_SECRET`
- `GOOGLE_API_KEY` (where unauthenticated calls used)

**Optional / Service:**
- `OPENAI_API_KEY`
- `UPLOADTHING_TOKEN`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `TRELLO_API_KEY`, `TRELLO_TOKEN`
- `HOCUSPOCUS_URL`, `HOCUSPOCUS_SECRET`

**Feature flags:**
- `FOLDER_CRAWL_IN_RELEASE` (default OFF) — gates weekly folder-crawl path
- `PHASE7_TOPOLOGY_ENABLED` — feature flag for Phase 7 topology UI (currently disabled)

**Dev-only:**
- `NGROK_AUTHTOKEN`
- `LOCAL_POSTGRES_PORT`

See `.env` and `texti.env` for current local set.

---

*Integrations analysis: 2026-05-12*
