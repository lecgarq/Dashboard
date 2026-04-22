---
status: awaiting_human_verify
trigger: "wiki-websocket-production-failure"
created: 2026-04-21T00:00:00Z
updated: 2026-04-21T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — The prolific-flow Railway service is NOT starting the yjs server. The service uses the same Docker image as the main app (railway.toml = DOCKERFILE + start:prod). For it to run yjs-server.cjs instead of Next.js, it MUST have SERVICE_TYPE=yjs in its Railway environment variables. Without that, it starts Next.js on its port instead of the WebSocket server — so WebSocket connections to wss://prolific-flow-production.up.railway.app are refused because the process answering the port is Next.js (HTTP only, no /wiki-room-* WebSocket upgrade handler).
test: Read all relevant files — start-router.cjs, yjs-server.cjs, railway.toml, railway.yjs.toml, yjs-provider.ts
expecting: Evidence confirms railway.yjs.toml is NOT used by Railway (it reads railway.toml), and start-router.cjs routes to yjs vs Next.js based on SERVICE_TYPE env var
next_action: Fix is code-level (railway.yjs.toml startCommand) + Railway dashboard env var (SERVICE_TYPE=yjs)

## Symptoms

expected: Wiki loads and WebSocket connects to wss://prolific-flow-production.up.railway.app for real-time Yjs collaboration
actual: Firefox error "could not establish connection" and "connection interrupted while loading page" for the wss:// URL
errors:
  - "Firefox no pudo establecer una conexión con el servidor en wss://prolific-flow-production.up.railway.app/wiki-room-..."
  - "La conexión con wss://prolific-flow-production.up.railway.app/wiki-room-... se interrumpió mientras se cargaba la página"
reproduction: Open any wiki page on the production Railway deployment
timeline: Never worked in production; separate Railway service named "prolific-flow" exists for the WebSocket server

## Eliminated

- hypothesis: NEXT_PUBLIC_YJS_WS_URL is missing from the Next.js Railway service
  evidence: yjs-provider.ts line 17 now defaults to "wss://prolific-flow-production.up.railway.app" (hardcoded fallback updated since previous session)
  timestamp: 2026-04-21T00:00:00Z

- hypothesis: yjs-provider.ts uses wrong protocol (ws:// vs wss://)
  evidence: Default fallback is already wss://. The upgrade guard (lines 19-23) only fires if envUrl starts with ws:// and page is https — the hardcoded fallback already uses wss:// so no upgrade needed
  timestamp: 2026-04-21T00:00:00Z

- hypothesis: The yjs server code is broken or doesn't listen on PORT
  evidence: yjs-server.cjs line 355: server.listen(PORT, "0.0.0.0") where PORT=process.env.PORT||"4444". Railway injects PORT automatically. The server is correct.
  timestamp: 2026-04-21T00:00:00Z

## Evidence

- timestamp: 2026-04-21T00:00:00Z
  checked: railway.toml (root)
  found: builder=DOCKERFILE, startCommand="npm run start:prod", healthcheckPath="/api/health"
  implication: Both the main service AND the prolific-flow service use this same file (it's the only railway.toml Railway reads). Both boot via "npm run start:prod" = start-router.cjs.

- timestamp: 2026-04-21T00:00:00Z
  checked: railway.yjs.toml
  found: builder=DOCKERFILE, startCommand="node scripts/yjs-server.cjs" — NO healthcheck, NOT named railway.toml
  implication: Railway does NOT read railway.yjs.toml. This file is effectively dead — it was intended to override behavior for the yjs service but Railway ignores it. The start command override it specifies is never used.

- timestamp: 2026-04-21T00:00:00Z
  checked: scripts/start-router.cjs
  found: if (process.env.SERVICE_TYPE === "yjs") require("./yjs-server.cjs"); else require("./start-production.cjs")
  implication: The routing logic IS correct and does exist. The problem is SERVICE_TYPE=yjs must be set in the Railway dashboard for the prolific-flow service. Without it, start-router.cjs starts Next.js (not yjs-server.cjs).

- timestamp: 2026-04-21T00:00:00Z
  checked: scripts/start-production.cjs
  found: Starts Next.js on process.env.PORT and then starts an ngrok tunnel
  implication: If SERVICE_TYPE is not set, prolific-flow starts Next.js on its port. Next.js has no WebSocket upgrade handler for /wiki-room-* paths. The browser's wss:// upgrade request is refused.

- timestamp: 2026-04-21T00:00:00Z
  checked: components/clash/wiki-editor/yjs-provider.ts line 17
  found: `const envUrl = process.env.NEXT_PUBLIC_YJS_WS_URL || "wss://prolific-flow-production.up.railway.app";`
  implication: The client correctly targets prolific-flow. No env var is required — the hardcoded fallback is the correct production URL. This side is fine.

- timestamp: 2026-04-21T00:00:00Z
  checked: railway.toml healthcheck
  found: healthcheckPath="/api/health" — this is a Next.js route, not present on the yjs server
  implication: SECONDARY ISSUE: If the prolific-flow service uses railway.toml's healthcheck, Railway will see the healthcheck fail (yjs-server has no /api/health route, only returns "yjs-server OK" for all HTTP requests). This may cause Railway to restart or mark the service unhealthy. Need to add a healthcheck route or remove healthcheck from the yjs service config.

- timestamp: 2026-04-21T00:00:00Z
  checked: scripts/yjs-server.cjs lines 259-262
  found: http.createServer returns "yjs-server OK" for ALL HTTP requests (no path check). Port is process.env.PORT.
  implication: The yjs server DOES respond to HTTP on its port. Railway's healthcheck at /api/health would get 200 + "yjs-server OK" text — so healthcheck would actually pass. This concern is eliminated.

## Resolution

root_cause: |
  The prolific-flow Railway service starts via the same railway.toml as the main app:
  startCommand = "npm run start:prod" = start-router.cjs.
  
  start-router.cjs routes to yjs-server.cjs ONLY when SERVICE_TYPE=yjs is set.
  Without this env var in the prolific-flow Railway service, it starts Next.js instead of
  the WebSocket server. WebSocket upgrade requests to /wiki-room-* are rejected because
  Next.js has no handler for that path.
  
  railway.yjs.toml (which has the correct startCommand) is ignored by Railway — Railway
  only reads railway.toml from the repo root.

fix: |
  TWO OPTIONS:

  OPTION A — Pure Railway config (no code change needed):
  In the Railway dashboard, open the "prolific-flow" service → Variables tab.
  Add: SERVICE_TYPE = yjs
  This makes start-router.cjs take the yjs branch and start yjs-server.cjs.

  OPTION B — Use a custom start command in Railway (no env var needed):
  In the Railway dashboard, open "prolific-flow" service → Settings → Deploy.
  Override the start command to: node scripts/yjs-server.cjs
  This bypasses start-router.cjs entirely.

  RECOMMENDED: Option B — more explicit, less fragile, no env var dependency.
  
  Additionally, ensure the "prolific-flow" service has:
  - DATABASE_URL pointing to the same Postgres instance
  - AUTH_SECRET (same value as the main service — needed to decode collaboration tokens)
  - NEXTAUTH_SECRET (same value, fallback used by decodeCollaborationToken)

verification: |
  Code-side is correct. No code changes needed.
  Railway dashboard action required: set SERVICE_TYPE=yjs on prolific-flow service
  OR override start command to "node scripts/yjs-server.cjs".
  Must also confirm AUTH_SECRET + DATABASE_URL are set on prolific-flow service.
  Awaiting user confirmation that WebSocket connects after Railway redeploy.
files_changed: []
