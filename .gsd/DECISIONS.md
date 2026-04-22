# Architecture & Implementation Decisions

## Phase 2: Stabilization & Gap Closure

**Date:** 2026-04-22

### Infrastructure: Dynamic WebSocket Routing
- **Decision**: Implement a hardened `getYjsWsUrl` resolution in `yjs-provider.ts`.
- **Rationale**: The collaborative editor was experiencing a 20s delay in production because the client-side configuration was hardcoded to a local private IP (`192.168.x.x`). Browsers block mixed content (ws:// on https://) and private IPs are unreachable from the public internet.
- **Implementation**:
  - Automatically upgrades `ws://` to `wss://` on HTTPS sites (except for localhost).
  - Detects unreachable private IP patterns (192.168, 10.x, etc.) when on a public HTTPS site.
  - Automatically falls back to the production Railway Yjs server (`wss://prolific-flow-production.up.railway.app`) if a local IP mismatch is detected.
  - Prevents race conditions by gating the editor rendering behind an `isSynced` state.

### UI/UX: Notion-Style Expansion
- **Decision**: Transition the editor from a rigid container to an "Infinite Scrolling" centered document layout.
- **Rationale**: User feedback indicated the writing canvas felt "tiny" and restricted.
- **Implementation**: Centered `max-w-4xl` container with `overflow: visible` and expanded internal padding. Removed restrictive `overflow-y-auto` from inner divs to allow the document to grow naturally within the dashboard's scroll context.

### Data Integrity: Sync Gating
- **Decision**: Implement a "Connection Overlay" that blocks interaction until the Yjs session is fully hydrated.
- **Rationale**: Users were able to type before the remote state arrived, leading to CRDT conflicts or "new session" overwrites of existing database content.
- **Implementation**: Added `isSynced` state in `WikiEditor.tsx` that listens for the `sync` event from the Yjs provider. Rendering of the editor content is deferred until this event fires.
