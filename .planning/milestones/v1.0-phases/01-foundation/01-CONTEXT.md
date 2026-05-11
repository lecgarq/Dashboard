# Phase 1: Foundation - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the ACC Users Graph module work correctly in production — no blank canvas after navigation, no WebGL context leaks, safe hub ID handling (automatic `b.` prefix stripping), and validated position cache data. This phase does NOT add new features — it stabilizes what's already built.

</domain>

<decisions>
## Implementation Decisions

### Cache Corruption Prompt
- Show a non-blocking banner at the top of the graph page when position cache contains NaN or Infinity values
- Banner includes a "Rebuild Cache" button — user triggers the rebuild, it's not automatic
- Graph still attempts to render while banner is showing (nodes will be mispositioned, but visible)
- Banner persists across page reloads until the user clicks "Rebuild Cache" — it does not auto-dismiss

### Cache Rebuild Behavior
- Claude's Discretion: choose the most reliable rebuild approach (clearing cache and re-running physics auto-layout is the expected default)

### Navigation State Memory
- Remember zoom level and pan position when user navigates away and returns
- Do NOT remember selected node — selection clears on return (clean slate for the detail panel)
- Remember applied filter state on return
- State is persistent across browser sessions (localStorage) — not just in-session

### Error Recovery
- Physics worker crash at runtime → fall back to static layout (freeze nodes in current position, graph stays readable, no error message unless user interacts)
- API failure (can't fetch user data) → show "Could not load graph data. Try again." with a Retry button
- Non-critical node failure (one node's detail can't load) → isolate to that node with a placeholder/grayed state; rest of graph works normally
- Error logging strategy → Claude's Discretion (console-only vs. pre-wired monitoring hook)

### Loading Experience
- While graph is loading: show a centered spinner with "Loading graph..." in the canvas area — page header and navigation remain visible (not full-page loading)
- Timeout: if graph hasn't loaded in ~10 seconds, show "This is taking longer than expected. Try reloading." with a Reload button
- Entrance animation: nodes use physics settle animation (start clustered, spread out via simulation) — not instant appear

</decisions>

<specifics>
## Specific Ideas

- No specific references given — standard spinner and banner patterns are fine
- Timeout threshold of ~10 seconds was explicitly agreed; Claude can tune slightly based on network + data size heuristics

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-28*
