---
phase: 7
plan: 3
wave: 2
---

# Plan 7.3: ACC Users Graph v1 — Spatial Permission Visualizer

## Objective
Build the `ACC Users Graph v1` module — a force-directed spatial graph that visually maps
the relationships between Users, Roles, and Projects in the ACC environment. Users with
identical role patterns cluster together. Outliers (unusual access, no projects, orphan roles)
are visually distinct. This connects with the LOD Checker graph visual direction already
established in `LodGraphCanvas`. The implementation uses D3-force or a lightweight custom
canvas approach — no heavy graph library required.

## Context
- `app/(dashboard)/users/AccUsersGraph.tsx` — NEW component
- `app/(dashboard)/users/UsersDirectoryClient.tsx` — add "Graph" tab (3rd tab)
- `app/(dashboard)/users/AccAnalysisPanel.tsx` — reference for data shape and metrics pattern
- `server/routers/users.ts` — `bulkAccSummary` already has all needed data (plan 7.2)
- `services/lod-engine/` — reference for graph node/edge visual patterns
- `components/` — check for any existing canvas/graph components to reuse patterns

## Tasks

<task type="auto">
  <name>Build AccUsersGraph.tsx — spatial force-directed permission graph</name>
  <files>app/(dashboard)/users/AccUsersGraph.tsx (NEW)</files>
  <action>
    Create a canvas/SVG-based force graph component. Do NOT install d3 if it is not already
    in package.json. Check first with `grep "\"d3\"" package.json`.

    If d3 is available: use `d3-force` simulation.
    If d3 is NOT available: implement a simple spring simulation using requestAnimationFrame
    (Hooke's law repulsion + attraction, ~100 iterations to stabilize, then render static SVG).

    ### Node Types and Visual Encoding:

    1. **User nodes** (circle, radius 14)
       - Color: `#6366f1` (indigo/primary) for normal users
       - Color: `#f59e0b` (amber) for users with NO projects
       - Color: `#10b981` (green) for users who are Hub Admin
       - Label: first name only (or initials if name unavailable)
       - On hover: tooltip showing name, email, projectCount, roles

    2. **Role nodes** (diamond shape — rotated square, size 20)
       - Color: `#8b5cf6` (violet)
       - Label: role name (truncated to 12 chars)
       - Size scales with frequency (more users = larger node)

    3. **Project nodes** (NOT rendered by default — too many at 440)
       - Only shown when a user node is clicked (expand mode)
       - Color: `#06b6d4` (cyan)
       - Small circle, radius 8

    ### Edges:
    - User → Role: thin line, `rgba(139, 92, 246, 0.3)`, weight by count
    - User → Project (expand mode only): dashed cyan line
    - Duplicate role users get a highlighted amber edge between them

    ### Simulation Layout:
    - Roles act as gravity centers — users who share a role are pulled toward it
    - Users with no roles float to the periphery
    - Users with identical role sets overlap/cluster near each other
    - Repulsion between all nodes prevents complete overlap

    ### Controls (top-right overlay):
    - Toggle: [Show Roles] [Hide Roles] — shows/hides role diamond nodes
    - Toggle: [Highlight Outliers] — pulses amber outline on users with unusual access
    - Toggle: [Highlight No-Project Users] — pulses amber on users with hasNoProjects
    - Zoom: scroll wheel or pinch to zoom (transform the SVG/canvas viewBox)
    - Click node: select it, show detail panel on the right

    ### Side Panel (appears on node click):
    - User nodes: name, email, role list, project count, "View Profile" button that sets
      `selectedEmail` state and switches to General tab with that user's modal open
    - Role nodes: role name, list of users with this role, count

    ### Implementation notes:
    - Render as `<svg>` with a `<g transform="translate(cx,cy) scale(zoom)">` wrapper
    - Use React state for node positions (updated by simulation)
    - Run simulation once on mount (or when data changes), then freeze
    - Add `useResizeObserver` or listen to container resize to re-center
    - Export a `resetLayout()` function via ref for the "Reset Layout" button

    The visual style should match the dark dashboard theme:
    `bg-[hsl(var(--card))]` canvas background, white/muted node labels, subtle grid lines.
  </action>
  <verify>npx tsc --noEmit 2>&1 | Select-String "AccUsersGraph"</verify>
  <done>
    - TypeScript compiles clean
    - Component renders SVG with at least user nodes positioned
    - No runtime errors in browser console on mount
  </done>
</task>

<task type="auto">
  <name>Wire Graph tab into UsersDirectoryClient + connect selectedUser back to General tab</name>
  <files>app/(dashboard)/users/UsersDirectoryClient.tsx</files>
  <action>
    1. Add "Graph" as a third tab value: `"general" | "analysis" | "graph"`.

    2. Extend the tab switcher UI from Plan 7.2 to include the Graph tab:
       ```
       [General]  [ACC Analysis]  [ACC Users Graph v1]
       ```
       The Graph tab label should have a small "v1" superscript or badge.

    3. When `activeTab === "graph"`, render:
       ```tsx
       <div className="w-full h-[calc(100vh-200px)]">
         <AccUsersGraph users={accSummary ?? []} onSelectUser={(email) => {
           setActiveTab("general")
           // trigger modal open for that user by setting selectedPersonEmail state
         }} />
       </div>
       ```

    4. Add `selectedPersonEmail` state (`string | null`, default null).
       In the General tab person list render loop, if a person's email matches
       `selectedPersonEmail`, auto-open their PersonDetailModal and clear the state.

    5. The `AccUsersGraph` component receives `onSelectUser: (email: string) => void`
       prop so clicking a user node in the graph navigates to their profile in General tab.

    Avoid: don't change any existing General tab logic — only add the tab switcher and
    the graph render block. The accSummary query is already running from Plan 7.1.
  </action>
  <verify>npx tsc --noEmit 2>&1 | Select-String "UsersDirectoryClient|AccUsersGraph"</verify>
  <done>
    - TypeScript compiles clean
    - Three tabs render in Users page header
    - Clicking "ACC Users Graph v1" shows the graph canvas
    - Clicking a node in the graph switches to General tab
  </done>
</task>

## Success Criteria
- [ ] `AccUsersGraph.tsx` renders a force-positioned SVG graph with user + role nodes
- [ ] Users with no projects render as amber nodes (visually distinct)
- [ ] Hub Admin users render as green nodes
- [ ] Clicking a user node opens their profile in the General tab
- [ ] Three-tab navigation (General / ACC Analysis / ACC Users Graph v1) works
- [ ] Graph uses zero new npm dependencies if d3 is not already installed
- [ ] TypeScript compiles clean across all files
