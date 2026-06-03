# Technical Debt Log

Tracks known sub-optimal implementations, scaling concerns, and known workarounds. Update after each completed plan.

---

## 2026-06-03 — Access-analysis redesign: organic user-blob default (feat/access-analysis-redesign)

### TD-015: /users/spatial-graph defaults to a flat 2D user-blob; other layout kinds are unreachable

- **Location:** `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`, `blobDescriptor.ts`, `layoutDescriptor.ts`, `curatedSliders.ts`
- **What shipped:** The graph now ALWAYS clusters by **user name** on load. The User-name slider drives only tightness (0 = organic/loose, 100 = packed tight clumps) via a smoothstep morph over pre-computed `loose` and `packed` positions. Node color is derived from `clusterColorBuffer` (one hue per user blob) rather than the semantic `colorMode` state. Same-user links are rendered as faint grey. Node names appear on hover only (persistent `ClusterLabels` overlay was removed). `CURATED_SLIDER_IDS = ["user"]`.
- **Deferred / dead code:**
  - **Other clustering dimensions** (project, role, company, …): the full `dimensionCatalog` is defined and the curated filter keeps them safe — re-enable by expanding `CURATED_SLIDER_IDS`. No implementation work needed for the catalog; only the layout-descriptor wiring (blob per-dim or multi-dim stacking) is unbuilt.
  - **Color presets + legend:** the `colorMode` select still exists and works for non-blob rendering paths (3D, future rest layouts). A per-blob color legend (one chip per user) and color preset bar are not yet built.
  - **Multi-slider stacking:** the `LayoutDescriptor` union type still carries `"rest"` and `"grid"` variants; `descriptorTarget` handles them. `buildRestLayout` and `restXyz` are not produced by the default path and are effectively unused until a multi-slider mode is re-added.
  - **Slider sidebar P4 tests** (`slider-group-Primary`, `slider-group-Affiliation`, `slider-group-Access & permissions`, `preset-bar`): these tests pre-date the curated-single-slider redesign. They will fail against the live sidebar (which now shows only the structural/activity/folder catalog sections). Update when the sidebar is re-expanded.
- **Why acceptable now:** the single-slider blob is the approved UAT baseline (2026-06-02). Adding dimensions back is intentionally staged so each dimension's organic-layout behavior can be verified independently before re-enabling.
- **Tracking:** Non-blocking. Next milestone: re-add Project slider as a second organic blob dimension (pure organic, NOT the grid layout).
