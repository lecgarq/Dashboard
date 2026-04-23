---
phase: 8
plan: 1
wave: 1
---

# Plan 8.1: Canvas Rendering Engine + World-Space Camera (Full Rewrite)

## Objective
Replace the entire SVG-based AccUsersGraph with a canvas-based rendering engine modeled
directly on LodGraphCanvas. This fixes the 3 critical bugs:
1. **Missing users** — the SVG clamp (`Math.max(r+4, Math.min(width-r-4, ...))`) crushes
   nodes against canvas edges when the simulation space is too small.
2. **Viewport cropping** — SVG `<g transform>` clips at the viewport boundary. Canvas with
   world-space coordinates + camera system has no such limit.
3. **No particle animation** — SVG has no animation loop. Canvas gives us requestAnimationFrame.

The graph MUST render a node for EVERY user in the `users` array (not just `found` ones).

## Context
- `app/(dashboard)/users/AccUsersGraph.tsx` — FULL OVERWRITE (890 lines → ~650 lines)
- `components/lod/LodGraphCanvas.tsx` — REFERENCE ONLY, do not modify
- `app/(dashboard)/users/AccAnalysisPanel.tsx` — exports `BulkAccUser` type (keep same interface)

## Tasks

<task type="auto">
  <name>Rewrite AccUsersGraph as a canvas-based renderer</name>
  <files>app/(dashboard)/users/AccUsersGraph.tsx</files>
  <action>
    OVERWRITE the entire file. Port the LodGraphCanvas architecture with these changes:

    ### 1. Data Model (keep existing types but store in flat arrays)

    Keep `UserNode`, `RoleNode`, `SimNode`, `Edge` types from current file.
    Keep `BulkAccUser` import and `AccUsersGraphProps` interface.
    Keep helper functions: `getFirstName`, `isHubAdmin`, `truncate`.

    After simulation, normalize all positions to [0, 1] world space (same as LOD):
    ```ts
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of settled) {
      if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
    }
    const rx = maxX - minX || 1, ry = maxY - minY || 1;
    const pos = new Float32Array(settled.length * 2);
    for (let i = 0; i < settled.length; i++) {
      pos[i * 2] = (settled[i].x - minX) / rx;
      pos[i * 2 + 1] = (settled[i].y - minY) / ry;
    }
    ```

    ### 2. Simulation Fix (DO NOT clamp to canvas bounds)

    Remove lines 189-191 from the old simulation:
    ```
    // DELETE THESE — they cause the clipping bug:
    ns[i].x = Math.max(r + 4, Math.min(width - r - 4, ns[i].x));
    ns[i].y = Math.max(r + 4, Math.min(height - r - 4, ns[i].y));
    ```
    Use a much larger virtual simulation space (e.g. 4000x4000) so nodes have room,
    then normalize to [0,1] after. The camera system handles viewport fitting.

    Include ALL users — remove the `filter(u => u.found)` on line 207. Instead:
    - Users where `found === false` get a grey node with label "?" — they still appear.
    - Users where `found === true` but `hasNoProjects === true` get amber.
    - Hub admins get green. Everyone else gets indigo.

    ### 3. Camera System (copy from LodGraphCanvas)

    ```ts
    const view = useRef({ x: 0, y: 0, scale: 1 });
    const targetView = useRef({ x: 0, y: 0, scale: 1 });
    ```

    In the render loop, lerp camera:
    ```ts
    v.x += (tv.x - v.x) * 0.2;
    v.y += (tv.y - v.y) * 0.2;
    v.scale += (tv.scale - v.scale) * 0.2;
    ```

    Implement `zoomToFit()` that measures ALL node positions and calculates the
    correct scale+offset to fit them all in the viewport with 75% padding factor.

    ### 4. Render Loop (requestAnimationFrame)

    Copy the LOD pattern exactly:
    ```ts
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;

      const render = () => {
        rafId.current = requestAnimationFrame(render);
        // ... lerp camera, handle DPR, clear, transform, draw
      };
      rafId.current = requestAnimationFrame(render);
      return () => cancelAnimationFrame(rafId.current);
    }, [dependencies]);
    ```

    Background: dark theme `hsl(var(--card))` — read the CSS variable at render time:
    ```ts
    const bg = getComputedStyle(canvas).getPropertyValue("--card").trim();
    ctx.fillStyle = bg ? `hsl(${bg})` : "#1a1a2e";
    ```

    ### 5. Node Rendering

    Use `createCircleSprite` for user nodes (pre-rendered off-screen canvases).
    Create sprites for each color: indigo, amber, green, grey.
    Draw role nodes as diamonds directly (ctx.beginPath + 4 lineTo calls).

    Node labels: only render when zoom level is high enough that text would be readable
    (e.g. `if (nodeScreenSize > 20)`). Use `ctx.fillText` centered on the node.

    ### 6. Edge Rendering

    Batch edges by color (same as LOD). Skip edge drawing while dragging/zooming for 60fps.
    Use viewport culling: skip edges where both endpoints are off-screen.

    ### 7. Input Handling

    Copy from LOD:
    - Left-click drag = pan (pointer capture)
    - Scroll wheel = zoom toward cursor
    - Middle click = zoom-to-fit
    - Click on node = select (set selectedNode state, trigger onSelectUser)

    Use spatial grid for hit testing (same cell-based approach as LOD).

    ### 8. Tooltip

    Use a positioned `<div>` overlay (same pattern as LOD tooltip):
    ```tsx
    <div ref={tooltipRef} className="absolute ... pointer-events-none" />
    ```
    Update position via `tooltipRef.current.style.transform` in onPointerMove.
    Show: name, email, projectCount, roles, admin status.

    ### 9. Keep Existing Sub-components

    Keep: `ControlButton`, `LegendDot`, `LegendDiamond`, `SidePanel`,
    `UserTooltip`, `RoleTooltip` — they render as HTML overlays, not in the canvas.

    ### 10. Controls Overlay

    Keep the existing control buttons (Show Roles, Outliers, No Projects, Reset)
    but store their state in refs that the render loop reads, not in React state
    that causes re-renders. Use `useRef` + a setter that also calls `setState`
    for the button highlight, but the render loop reads the ref.

    ### What NOT to do:
    - Do NOT install d3 or any new dependency
    - Do NOT use SVG for the graph (only for the legend diamond icon)
    - Do NOT clamp node positions to canvas pixel bounds
    - Do NOT filter out `found === false` users
    - Do NOT re-render React state every frame (use refs for animation state)
  </action>
  <verify>npx tsc --noEmit 2>&1 | Select-String "AccUsersGraph"</verify>
  <done>
    - TypeScript compiles clean
    - Component exports AccUsersGraph with same props interface as before
    - Canvas element renders (not SVG for the graph)
    - ALL users in the input array have a corresponding node
    - No canvas bounds clamping in simulation
    - Camera system uses lerped view/targetView refs
  </done>
</task>

## Success Criteria
- [ ] Full canvas rewrite compiles with zero TypeScript errors
- [ ] Every user from bulkAccSummary renders as a node (no missing users)
- [ ] Camera lerps smoothly on pan/zoom (no clipping at viewport edges)
- [ ] Zoom-to-fit shows all nodes without any cropping
- [ ] Node sprites are pre-rendered (createCircleSprite pattern)
- [ ] Edge batching by color for performance
- [ ] Spatial grid for O(1) hit testing
- [ ] 60fps with ~150 user nodes + ~20 role nodes
