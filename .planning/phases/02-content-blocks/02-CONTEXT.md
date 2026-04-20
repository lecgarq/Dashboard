# Phase 2: Content Blocks - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Enrich the existing Tiptap collaborative editor with Notion-parity content blocks: collaborative tables, Google Drive-backed PDF previews, and improved media (image/video/GIF) UX. All new blocks sync via Yjs in real-time. The Yjs infrastructure, editor permissions, and base editor are already complete (Phase 1). Creating new block types beyond tables/PDFs/media belongs in later phases.

</domain>

<decisions>
## Implementation Decisions

### Table — Insertion
- Hover-grid size picker on insertion (like Notion/Google Docs — user drags to set dimensions)

### Table — Row & Column Operations
- `+` hover buttons on row/column edges to add rows and columns
- Right-click context menu to delete rows/columns
- Floating toolbar appears on table selection (delete table, toggle header, add row)
- Duplicate table option in right-click menu and floating toolbar

### Table — Header Row
- Header row on by default (visually distinct — bold text, light background)
- Sticky/frozen header row when scrolling through long tables

### Table — Column & Cell Controls
- Drag column borders to resize column widths
- Per-cell text alignment (left/center/right) via right-click or toolbar
- Per-cell background color via right-click (for status coloring: red = critical, green = resolved)
- Cell merging via right-click (select multiple cells → merge)
- Images can be placed inside table cells

### Table — Keyboard & Navigation
- Tab advances to next cell; Tab on last cell creates a new row
- Backspace on empty block deletes it and returns cursor to previous line

### Table — Data Features
- Click header cell to sort rows by that column (ascending/descending toggle)
- Paste from Excel/Google Sheets auto-imports content as a table
- Optional filter bar: toggled via toolbar, allows live row filtering without deleting data
- Row drag handles on left side for reordering rows

### Table — Appearance
- Full content width always (no user-controlled table width)
- Visible borders on all cells (classic grid style)
- No caption field (users type below the block)

### Table — Export
- Right-click → Export as .xlsx (Excel format)

### PDF Viewer — Display
- Inline scrollable preview within the document flow (fixed height ~500px)
- User can resize viewer height by dragging the bottom edge
- Filename label displayed above the viewer
- Optional caption field below the viewer
- Loading skeleton (filename + spinner) while PDF loads from Google Drive
- Error card if Google Drive file is unavailable ("PDF unavailable — file may have been moved or deleted") with link to Google Drive

### PDF Viewer — Controls
- Toolbar at top of viewer: zoom in/out, fit-to-width, page indicator ("Page X of Y"), prev/next arrows, download button, print button, full-screen toggle
- Right-click → Replace PDF (swap file without deleting block)
- Right-click → Edit link (update Google Drive URL if file moved)

### PDF Viewer — Storage
- PDFs uploaded to Google Drive (not UploadThing/S3) — user has unlimited Drive storage
- Researcher must investigate: OAuth vs service account auth for Drive uploads

### PDF Viewer — Access
- All users with wiki access can view and scroll PDFs (not editors-only)
- Mobile: collapses to tappable card (filename + page count) that opens Google Drive viewer in a new tab

### Media Blocks — Alignment & Layout
- Four alignment options: Left / Center / Right / Full-width (via floating toolbar)
- Drag handles on corners/edges to resize media
- All media blocks (images, video, GIFs) consistent behavior

### Media Blocks — Captions & Metadata
- Optional caption field below each media block (click to add)
- Optional alt text field for images (via right-click or toolbar)

### Media Blocks — Behavior
- GIFs: autoplay on page load
- Videos: click to play (no autoplay), native browser controls (play/pause, seek, volume, fullscreen)
- Images: click to open full-screen lightbox

### Media Blocks — Storage
- All media (images, videos, GIFs) uploaded to Google Drive — same integration as PDFs

### Media Blocks — Operations
- Loading progress bar during upload (shows filename + progress)
- Right-click → Replace media (swap file without deleting block)
- Right-click → Copy link (share Google Drive URL)
- Lightbox for images: click to expand, close button

### Block Insertion UX — Slash Command
- Type `/` on any line to open the block insertion menu
- Menu is searchable with fuzzy match (e.g. `/table` jumps to table)
- Menu items show icon + label
- Menu grouped by category (Basic, Media, Embeds)
- No "recent blocks" section — consistent category order always

### Block Insertion UX — Mouse Controls
- `+` hover button on left of ALL block types (paragraphs, headings, lists, new blocks) — appears on hover
- Drag handle on left of ALL block types on hover — drag to reorder anywhere in document

### Block Insertion UX — Block Operations
- Duplicate block: right-click → Duplicate (available on all block types)
- Backspace on empty block: deletes block and returns cursor to previous line
- No block type conversion (no "convert paragraph to table") — insert fresh
- No dedicated keyboard shortcuts beyond `/` for insertion

### Claude's Discretion
- Exact icon set for slash menu
- Hover animation timing for `+` button and drag handle
- Specific color palette for cell background color picker
- Loading skeleton visual design
- Exact lightbox animation style
- Error state illustration/icon for PDF unavailable

</decisions>

<specifics>
## Specific Ideas

- Table export must be .xlsx specifically (not CSV) — user preference
- Google Drive chosen for storage across all media types (PDFs, images, videos) due to unlimited space — consistent integration matters
- Tables need all data-grid-like features (sort, filter, merge, color, drag rows) because BIM managers use them for clash detection results and simulation status tracking — these are working tables, not just decorative ones
- Cell background color use case: red for critical clashes, green for resolved — status coloring is a real workflow need

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-content-blocks*
*Context gathered: 2026-04-20*
