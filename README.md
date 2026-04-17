# BIM Engineering Dashboard

A data-driven dashboard for managing Revit Families, Clash Detection workflows, and Revit Certification Exams.

## Getting Started

### 1. Prerequisites

- Node.js 18+
- SQLite (default) or PostgreSQL

### 2. Installation

```bash
npm install
npx prisma generate
npx prisma db push
```

### 3. Environment Setup

Edit `.env` and configure your keys:

- Google OAuth
- Autodesk APS
- UploadThing

### 4. Development

```bash
npm run dev
```

## Public URL Rules

Treat the public auth host in `.env` as the source of truth. Startup scripts preserve it exactly and only update LAN-only service endpoints.

Required `.env` alignment:

```text
AUTH_URL=https://your-existing-subdomain.loca.lt
APS_CALLBACK_URL=https://your-existing-subdomain.loca.lt/api/auth/callback/autodesk
```

Important:

- `AUTH_URL` is the canonical public auth origin.
- `NEXTAUTH_URL` is optional legacy compatibility only. If present, it must match `AUTH_URL`.
- `APS_CALLBACK_URL` must use the same origin and the Autodesk callback path shown above.
- `node scripts/patch-env.js` updates only `NEXT_PUBLIC_LOD_CHECKER_URL` and `NEXT_PUBLIC_YJS_WS_URL`.
- Do not mix `localhost` with the public host in the same auth session.

## Tunnel Workflow

Run the app and tunnel separately:

```bash
npm run dev
npm run tunnel
```

`npm run tunnel` preserves the `*.loca.lt` host already configured in `.env`, launches Localtunnel with that exact subdomain, and restarts it automatically when the process exits or the public URL starts returning upstream gateway errors.

Validation without launching a tunnel:

```bash
node scripts/run-tunnel.js --check
```

## OAuth Callback Configuration

Set provider callbacks to the same `*.loca.lt` host already configured in `.env`:

| Provider | Callback URL |
| --- | --- |
| Google | `https://your-existing-subdomain.loca.lt/api/auth/callback/google` |
| Autodesk | `https://your-existing-subdomain.loca.lt/api/auth/callback/autodesk` |

## Project Structure

- `app/`: Next.js App Router (Dashboard, Auth, Families, Clash, Exams).
- `components/`: Reusable UI components and module-specific cards.
- `server/`: tRPC routers and server-side logic (Prisma, Auth).
- `prisma/`: Database schema and migrations.

## Tech Stack

- Framework: Next.js 15 (App Router)
- Styling: Tailwind CSS + Shadcn UI
- API: tRPC
- Database: Prisma ORM + SQLite
- Auth: NextAuth.js v5
