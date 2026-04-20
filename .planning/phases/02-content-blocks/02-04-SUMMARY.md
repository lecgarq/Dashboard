---
phase: 02-content-blocks
plan: "04"
subsystem: ui
tags: [tiptap, react, image-upload, video, alignment, lightbox, caption, lucide-react]

# Dependency graph
requires:
  - phase: 02-content-blocks
    provides: "VideoNode pattern and wiki-editor structure established in 02-01"

provides:
  - "ImageNode Tiptap extension (image-node.tsx) replacing tiptap-extension-resize-image with alignment, lightbox, caption, alt text, Replace media"
  - "VideoNode extended with matching alignment, caption, and Replace media right-click menu"

affects:
  - "02-05 (WikiEditor.tsx must swap ImageResize for ImageNode in extensions array)"
  - "any future plan referencing image or video rendering in wiki pages"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Floating alignment toolbar pattern (4 options via absolute positioned bar above node, shown when selected)"
    - "Right-click context menu with fixed positioning and backdrop dismiss div"
    - "Replace media via hidden file input + fetch POST /api/wiki-media + updateAttributes({ src })"
    - "Caption via uncontrolled-friendly input with onBlur persistence to node attrs"
    - "Lightbox via fixed full-screen overlay z-50 with click-to-close"

key-files:
  created:
    - components/clash/wiki-editor/image-node.tsx
  modified:
    - components/clash/wiki-editor/video-node.tsx

key-decisions:
  - "ImageNode name is 'image' (not 'custom-image') so it parses existing img[src] tags already stored in the database — critical for backward compatibility"
  - "GIF detection via src.includes('.gif') renders img element for native browser autoplay — no special handling needed"
  - "VideoNode alignment applied to NodeViewWrapper flex container (not inner video element) so caption stays aligned with video"
  - "Replace media uses hidden file input with ref + programmatic click — avoids custom file picker complexity"

patterns-established:
  - "Alignment toolbar pattern: absolute -top-9, translate-x-1/2 centering, ghost/secondary Button variants, four options"
  - "Context menu pattern: fixed positioning at clientX/clientY, fixed inset-0 backdrop z-40, menu z-50"
  - "Media node structure: NodeViewWrapper (flex container) > media element + resize handle > caption input"

requirements-completed:
  - REQ-02

# Metrics
duration: 18min
completed: 2026-04-20
---

# Phase 02 Plan 04: Enhanced ImageNode and VideoNode Summary

**Custom Tiptap ImageNode replacing ImageResize with 4-way alignment, lightbox, caption, alt text, and Replace media upload; VideoNode extended with identical alignment/caption/right-click pattern**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-20T17:02:24Z
- **Completed:** 2026-04-20T17:20:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Built `image-node.tsx` from scratch: ImageNode with name "image" parses all existing `<img src>` tags from the database, supporting alignment (left/center/right/full-width), lightbox on click, caption field, alt text via right-click, Replace media via upload, and corner drag resize
- Extended `video-node.tsx` surgically: added `alignment` and `caption` attributes, floating toolbar, caption input, right-click menu with Replace media and Copy link — all while preserving the existing resize drag handle logic unchanged
- Both files compile with zero TypeScript errors and `npm run build` passes clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Enhanced ImageNode with alignment, caption, lightbox, alt text, Replace media** - `fdf4390` (feat)
2. **Task 2: Extend VideoNode with alignment, caption, and Replace media right-click** - `6016abf` (feat)

## Files Created/Modified
- `components/clash/wiki-editor/image-node.tsx` - New ImageNode Tiptap extension replacing tiptap-extension-resize-image; exports `ImageNode` with node name "image"
- `components/clash/wiki-editor/video-node.tsx` - Extended VideoNode with alignment, caption, and Replace media right-click menu

## Decisions Made
- ImageNode name must be `"image"` (not a custom name) so Tiptap's parseHTML matches `img[src]` tags already stored in the database. If this were changed, existing wiki content with images would fail to render.
- GIFs rendered as `<img>` elements — browser-native GIF autoplay via img src requires no special JavaScript. Detection via `src.toLowerCase().includes('.gif')` disables the click-to-lightbox behavior on GIFs.
- VideoNode gets alignment via the NodeViewWrapper flex container rather than applying it to the inner video element. This keeps caption and resize handle visually grouped with the video.
- Replace media workflow: hidden `<input type="file">` with a ref, called via `fileInputRef.current?.click()` from the menu button. This avoids building a custom file picker and reuses the browser's native picker.

## Deviations from Plan

None - plan executed exactly as written. The VideoNode alignment style was applied at the NodeViewWrapper level (matching what the plan diagram suggested) rather than on an inner div — a minor structural choice that preserves the same visual outcome.

## Issues Encountered
None. TypeScript compiled cleanly on first attempt. The `lucide-react` Lucide icon imports (`AlignLeft`, `AlignCenter`, `AlignRight`, `X`) resolved without issues — already a project dependency.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `ImageNode` (name `"image"`) and updated `VideoNode` are ready for registration in `WikiEditor.tsx` (Plan 02-05)
- 02-05 must remove `ImageResize` from the extensions `useMemo` array and replace it with `ImageNode`
- No other blockers

---
*Phase: 02-content-blocks*
*Completed: 2026-04-20*
