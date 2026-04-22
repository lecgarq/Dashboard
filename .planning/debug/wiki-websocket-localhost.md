---
status: awaiting_human_verify
trigger: "wiki-websocket-pointing-to-localhost"
created: 2026-04-20T00:00:00Z
updated: 2026-04-20T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — two separate root causes identified with full evidence
test: Reading source code directly
expecting: Both fixes are clear and ready to apply
next_action: Apply fixes to yjs-provider.ts (wrong default) and WikiEditor.tsx (duplicate extensions)

## Symptoms

expected: Wiki WebSocket connects to the production Hocuspocus/Yjs server
actual: WebSocket tries to connect to wss://localhost:4444 — connection refused
errors:
  - "Firefox no pudo establecer una conexión con el servidor en wss://localhost:4444/wiki-room-..."
  - NS_ERROR_CONNECTION_REFUSED
  - "[tiptap warn]: Duplicate extension names found: ['link', 'underline', 'tableCell']"
reproduction: Open any wiki/clash-detection page on https://dashboard-production-42cf.up.railway.app
started: Likely from the start; local .env has NEXT_PUBLIC_YJS_WS_URL=ws://192.168.104.75:4444, but Railway does not have this env var set

## Eliminated

- hypothesis: The env var name might be wrong or the code ignores it
  evidence: yjs-provider.ts line 17 reads `process.env.NEXT_PUBLIC_YJS_WS_URL || "ws://localhost:4444"` — correct name, correct code, just missing in Railway env
  timestamp: 2026-04-20T00:00:00Z

- hypothesis: StarterKit might not include link/underline in this version
  evidence: node_modules/@tiptap/starter-kit/dist/index.d.ts clearly imports LinkOptions and UnderlineOptions — this StarterKit version bundles both
  timestamp: 2026-04-20T00:00:00Z

## Evidence

- timestamp: 2026-04-20T00:00:00Z
  checked: components/clash/wiki-editor/yjs-provider.ts line 17
  found: `const envUrl = process.env.NEXT_PUBLIC_YJS_WS_URL || "ws://localhost:4444";`
  implication: When NEXT_PUBLIC_YJS_WS_URL is not set in Railway, it falls back to localhost:4444. The .env file has ws://192.168.104.75:4444 (local network IP). Railway has RAILWAY-YJS-SERVER variable but NOT NEXT_PUBLIC_YJS_WS_URL pointing to the deployed yjs server.

- timestamp: 2026-04-20T00:00:00Z
  checked: .env file line 78
  found: NEXT_PUBLIC_YJS_WS_URL=ws://192.168.104.75:4444
  implication: Local dev points to a LAN IP (the dev machine's yjs-server.cjs running locally). Railway has no such variable set, so it falls back to localhost.

- timestamp: 2026-04-20T00:00:00Z
  checked: .env file lines 93-95
  found: RAILWAY-YJS-SERVER=d26ac1a5-5b6e-4479-9515-d5a332083843 and RAILWAY-YJS-SERVER-TOKEN — these are Railway project/service IDs, not the actual public URL
  implication: A separate Railway service for yjs-server exists (service ID d26ac1a5). We need to find or construct its public URL.

- timestamp: 2026-04-20T00:00:00Z
  checked: scripts/yjs-server.cjs
  found: A standalone WebSocket server that listens on PORT (default 4444), handles y-websocket protocol, persists to Prisma DB. This is a separate process that must be deployed separately.
  implication: The yjs server is NOT part of the Next.js app — it is a separate Railway service. Its public URL must be set as NEXT_PUBLIC_YJS_WS_URL in the Next.js Railway service.

- timestamp: 2026-04-20T00:00:00Z
  checked: node_modules/@tiptap/starter-kit/dist/index.d.ts
  found: StarterKit imports LinkOptions from @tiptap/extension-link and UnderlineOptions from @tiptap/extension-underline — both are bundled by default
  implication: Adding Underline and Link.configure() separately after StarterKit causes "duplicate extension names: link, underline"

- timestamp: 2026-04-20T00:00:00Z
  checked: WikiEditor.tsx extensions array (lines 238-290)
  found: StarterKit is used WITHOUT link:false or underline:false config options, PLUS Underline (line 249) and Link.configure() (line 255) are added separately
  implication: StarterKit registers 'link' and 'underline', then they're added again = duplicate warning

- timestamp: 2026-04-20T00:00:00Z
  checked: WikiEditor.tsx lines 262-265 + table-node-extension.ts vs custom-table-cell.ts
  found: TableKit from @tiptap/extension-table bundles TableCell (name: 'tableCell'). CustomTableCell from custom-table-cell.ts also extends TableCell with name: 'tableCell' (line 40). Both are added: TableKit.configure() at line 262 and CustomTableCell at line 263.
  implication: TableKit registers 'tableCell', then CustomTableCell registers it again = duplicate warning. Fix: configure TableKit with tableCell:false and keep only CustomTableCell, OR check if TableKit has a way to override its tableCell.

## Resolution

root_cause: |
  ISSUE 1 — WebSocket to localhost:
  The yjs-provider.ts defaults to "ws://localhost:4444" when NEXT_PUBLIC_YJS_WS_URL is not set.
  The .env has a local LAN IP (192.168.104.75). Railway does NOT have NEXT_PUBLIC_YJS_WS_URL set.
  A Railway yjs-server service exists (ID d26ac1a5-5b6e-4479-9515-d5a332083843) but its public URL
  has never been wired into the Next.js service as an env var.

  ISSUE 2 — Duplicate extensions:
  a) StarterKit (new version) bundles 'link' and 'underline' by default. WikiEditor.tsx adds both
     again explicitly, causing duplicate name warnings.
  b) TableKit bundles 'tableCell'. CustomTableCell also uses name 'tableCell'. Both are registered.

fix: |
  ISSUE 1: Set NEXT_PUBLIC_YJS_WS_URL in Railway to the yjs-server public URL.
           Pattern: wss://<yjs-service-domain>.railway.app
           This must be set in Railway dashboard for the Next.js service.

  ISSUE 2a: In WikiEditor.tsx StarterKit.configure(), add link: false and underline: false
            so StarterKit doesn't register them. The standalone Link.configure() and Underline
            already registered below will be the single source of truth.

  ISSUE 2b: In WikiEditor.tsx, configure TableKit with tableCell: false so TableKit
            does not register its built-in TableCell. CustomTableCell (which extends it)
            becomes the sole 'tableCell' extension.

verification: |
  Code fixes applied to WikiEditor.tsx.
  Railway env var requires manual user action (cannot be done via code).
  Awaiting user confirmation that yjs-server Railway URL is set and collaboration works.
files_changed:
  - components/clash/WikiEditor.tsx (StarterKit config + TableKit config)
  - Railway env var NEXT_PUBLIC_YJS_WS_URL must be set manually by user
