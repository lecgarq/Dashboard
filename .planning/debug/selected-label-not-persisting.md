# Debug: Selected-node label not persisting

## ROOT CAUSE FOUND

The active renderer in production is **Cosmos (WebGL2)**, not Canvas2D. The
late-zoom label pass that draws `frame.labelOverrideIndices` lives **only** in
`CanvasGraphRenderer.draw()` (`app/(dashboard)/users/graphRenderers.ts` lines
281–419). `CosmosGraphRenderer.draw()` (same file, lines 682–828) never reads
`frame.labelOverrideIndices`, `labelFadeStartScale`, `labelFadeEndScale`, or
`GraphRenderNode.label`. There is also no `onPointMouseOver` handler wired in
the Cosmos `baseConfig` (only `onPointClick` and `onBackgroundClick` exist at
lines 566–574), so Cosmos has zero label-rendering pathway — neither hover nor
selection.

The frame builder side is correct:
- `app/(dashboard)/users/AccUsersGraph.tsx:1460-1467` builds `overrides` from
  `hoveredNodeRef.current` and `selectedIndex`, and `selectIndex >= 0` does add
  the selected node.
- `setSelectedNode` call sites (lines 952–960, 1614–1625, 2306–2308) all pair
  with `markGraphDirty()`, so the rAF loop redraws.
- The frame is delivered with `labelOverrideIndices: overrides` (line 1487).

But `renderer.draw(frame)` (line 1490) dispatches to whichever backend was
chosen at line 345:

```ts
const [renderBackend, setRenderBackend] = useState<"canvas2d" | "cosmos">(() =>
  isWebGL2Available() ? "cosmos" : "canvas2d"
);
```

On any modern browser this resolves to `"cosmos"`, which means the entire
override-label pass is dead code at runtime. The user sees no hover label, no
selection label, and no zoom-threshold labels — matching the verbatim symptom
("no it doesnt show its label" on hover, and the same on click/select).

The summary doc itself acknowledges this: "Canvas2D-only pass; Cosmos hover
labels via onPointMouseOver remain untouched" — but `onPointMouseOver` was
never actually wired in `baseConfig`, so there is no Cosmos hover-label path
to "remain untouched." Plan 03-01 implemented the override mechanism only on
the inactive renderer.

## Scope

This is the shared root cause for all three sibling UAT gaps: hover labels,
zoom-threshold labels, and selected-node-persistent labels. Fixing requires
adding a label-rendering pass to `CosmosGraphRenderer` (e.g. a 2D overlay
canvas reading `spaceToScreen()` projections, or `setPointLabels` if the v3
API exposes it), driven by the same `labelOverrideIndices` + fade-band fields
already on `GraphRenderFrame`.

## Files

- `app/(dashboard)/users/graphRenderers.ts` (Cosmos draw lacks label pass)
- `app/(dashboard)/users/AccUsersGraph.tsx:345` (default backend = cosmos)
- `app/(dashboard)/users/AccUsersGraph.tsx:1460-1488` (frame override build — correct)
- `.planning/phases/03-graph-ui-completion/03-01-SUMMARY.md` (deferred-Cosmos decision)
