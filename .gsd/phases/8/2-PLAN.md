---
phase: 8
plan: 2
wave: 2
---

# Plan 8.2: Flowing Particle Animation + Visual Polish

## Objective
Add the signature visual effect: animated particles that flow along edges between user
and role nodes, making the graph feel alive. Also add visual polish: subtle grid background,
node glow on selection, smooth fade-in on load, and ensure the "Highlight Outliers" /
"Highlight No Projects" effects work with canvas (animated pulse rings instead of SVG
attribute toggles).

## Context
- `app/(dashboard)/users/AccUsersGraph.tsx` — add particle system to the canvas render loop
- `components/lod/LodGraphCanvas.tsx` — REFERENCE for render loop structure

## Tasks

<task type="auto">
  <name>Add particle system to the canvas render loop</name>
  <files>app/(dashboard)/users/AccUsersGraph.tsx</files>
  <action>
    ### Particle Data Structure

    After simulation completes and edges are built, create a particle array:
    ```ts
    interface Particle {
      edgeIdx: number;     // which edge this particle travels along
      t: number;           // position along edge [0, 1]
      speed: number;       // how fast it moves per frame (0.002 - 0.008)
      size: number;        // radius in world space (0.001 - 0.003)
      alpha: number;       // opacity (0.3 - 0.7)
    }
    ```

    Create 2-3 particles per visible edge. Store in a ref:
    ```ts
    const particles = useRef<Particle[]>([]);
    ```

    Initialize particles with random `t` values so they don't all start at the same point.
    Randomize speed slightly so particles don't move in lockstep.

    ### Particle Update (in render loop, BEFORE drawing nodes)

    Each frame, advance each particle:
    ```ts
    for (const p of particles.current) {
      p.t += p.speed;
      if (p.t > 1) p.t -= 1;  // wrap around
    }
    ```

    ### Particle Rendering

    For each particle, interpolate position along its edge:
    ```ts
    const edge = edgesRef.current[p.edgeIdx];
    const srcIdx = nodeIndexMap.get(edge.source);
    const tgtIdx = nodeIndexMap.get(edge.target);
    if (srcIdx == null || tgtIdx == null) continue;

    const px = pos[srcIdx * 2] + (pos[tgtIdx * 2] - pos[srcIdx * 2]) * p.t;
    const py = pos[srcIdx * 2 + 1] + (pos[tgtIdx * 2 + 1] - pos[srcIdx * 2 + 1]) * p.t;
    ```

    Draw as small glowing circles:
    ```ts
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = edge.color.replace(/[\d.]+\)/, `${p.alpha})`);
    // Or use a pre-rendered tiny white/colored sprite for performance
    ctx.beginPath();
    ctx.arc(px, py, p.size, 0, Math.PI * 2);
    ctx.fill();
    ```

    ### Particle Color

    Particles inherit the edge color but at higher opacity (more visible than the edge).
    User→Role edges: violet particles (`rgba(139, 92, 246, 0.6)`)
    Use a small radial gradient or just a solid dot — performance matters more than beauty
    at this scale.

    ### Performance Considerations

    - Cap total particles at ~1000 (even if there are 500 edges, only 2 per edge)
    - When roles are hidden (`showRolesRef.current === false`), skip particle rendering
    - Particles are purely visual — they don't affect hit testing or selection
    - Viewport-cull particles the same way as nodes (skip if off-screen)

    ### Subtle Grid Background

    Before drawing nodes/edges, draw a faint dot grid:
    ```ts
    const gridSpacing = 0.05;  // in world space
    const dotRadius = 0.5 / v.scale;
    ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
    const startX = Math.floor(minWX / gridSpacing) * gridSpacing;
    const startY = Math.floor(minWY / gridSpacing) * gridSpacing;
    for (let gx = startX; gx < maxWX; gx += gridSpacing) {
      for (let gy = startY; gy < maxWY; gy += gridSpacing) {
        ctx.beginPath();
        ctx.arc(gx, gy, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ```

    Only draw grid dots that are within the visible viewport.

    ### Pulse Animation for Outliers / No-Project Users

    Instead of the old SVG pulse ring (which used React state `pulseTick`), implement
    a canvas-based pulse using the render loop's timestamp:

    ```ts
    // In the render loop, track time for animation
    const now = performance.now();
    const pulsePhase = (Math.sin(now * 0.004) + 1) * 0.5;  // 0..1 oscillating
    ```

    When `highlightOutliersRef.current` or `highlightNoProjectsRef.current` is true:
    - For qualifying user nodes, draw an extra ring around them:
      ```ts
      const pulseR = (nodeScreenRadius + 3 + pulsePhase * 5) / v.scale;
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.5 / v.scale;
      ctx.globalAlpha = 0.3 + pulsePhase * 0.4;
      ctx.beginPath();
      ctx.arc(nx, ny, pulseR, 0, Math.PI * 2);
      ctx.stroke();
      ```

    Remove the old `pulseTick` state and `setInterval` — the animation loop handles it.

    ### Selection Glow

    When a node is selected (clicked), draw a soft glow behind it:
    ```ts
    if (selectedNodeRef.current === node.id) {
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = node.color;
      ctx.beginPath();
      ctx.arc(nx, ny, 20 / v.scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2 / v.scale;
      ctx.beginPath();
      ctx.arc(nx, ny, nodeRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ```

    ### Fade-in on Load

    When simulation finishes and `isReady` becomes true, start a 500ms opacity
    transition on the canvas container (same as LOD: `transition-opacity duration-500`
    with conditional `opacity-100` / `opacity-0`).
  </action>
  <verify>npx tsc --noEmit 2>&1 | Select-String "AccUsersGraph"</verify>
  <done>
    - TypeScript compiles clean
    - Particles visibly flow along edges in the browser (manual verification)
    - Pulse rings animate on outlier/no-project nodes without setInterval
    - Grid dots render in the background
    - Selected node has a glow effect
    - Canvas fades in smoothly on first load
  </done>
</task>

<task type="checkpoint:human-verify">
  <name>Visual verification of the complete graph</name>
  <files>app/(dashboard)/users/AccUsersGraph.tsx</files>
  <action>
    Open the deployed app at the Users page, switch to the "ACC Users Graph v1" tab.

    Verify all of the following:
    1. ALL users from the ACC data appear as nodes (compare count with ACC Analysis tab)
    2. Particles flow along edges continuously (subtle, not distracting)
    3. Zooming in/out works smoothly with no cropping/clipping at edges
    4. Zoom-to-fit (middle click) shows the entire graph
    5. Clicking a user node opens the side panel with their info
    6. "View Profile" button in side panel switches to General tab
    7. "Highlight Outliers" makes outlier nodes pulse amber
    8. "Highlight No Projects" makes no-project nodes pulse amber
    9. Graph background uses the dark theme card color
    10. Performance feels smooth (60fps) with all users loaded
  </action>
  <verify>User confirms visual quality matches or exceeds LOD Checker graph</verify>
  <done>User approves the visual quality and confirms all users are displayed</done>
</task>

## Success Criteria
- [ ] Particles flow along edges at ~2-3 per edge, wrapping continuously
- [ ] Pulse rings animate smoothly via performance.now() (no setInterval)
- [ ] Background grid dots render within viewport only
- [ ] Selected node shows glow + white outline ring
- [ ] Canvas fades in with 500ms opacity transition on load
- [ ] Total particle count capped at ~1000 for performance
- [ ] No React state updates per frame (all animation via refs)
- [ ] User confirms visual quality matches LOD Checker standard
