# Phase 2: Content Blocks - Research

**Researched:** 2026-04-20
**Domain:** Tiptap editor extensions — tables, PDF viewer (Google Drive), media blocks, slash/drag UX
**Confidence:** HIGH (core stack verified against official Tiptap docs, npm registry, and existing codebase)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Table — Insertion**
- Hover-grid size picker on insertion (like Notion/Google Docs — user drags to set dimensions)

**Table — Row & Column Operations**
- `+` hover buttons on row/column edges to add rows and columns
- Right-click context menu to delete rows/columns
- Floating toolbar appears on table selection (delete table, toggle header, add row)
- Duplicate table option in right-click menu and floating toolbar

**Table — Header Row**
- Header row on by default (visually distinct — bold text, light background)
- Sticky/frozen header row when scrolling through long tables

**Table — Column & Cell Controls**
- Drag column borders to resize column widths
- Per-cell text alignment (left/center/right) via right-click or toolbar
- Per-cell background color via right-click (for status coloring: red = critical, green = resolved)
- Cell merging via right-click (select multiple cells → merge)
- Images can be placed inside table cells

**Table — Keyboard & Navigation**
- Tab advances to next cell; Tab on last cell creates a new row
- Backspace on empty block deletes it and returns cursor to previous line

**Table — Data Features**
- Click header cell to sort rows by that column (ascending/descending toggle)
- Paste from Excel/Google Sheets auto-imports content as a table
- Optional filter bar: toggled via toolbar, allows live row filtering without deleting data
- Row drag handles on left side for reordering rows

**Table — Appearance**
- Full content width always (no user-controlled table width)
- Visible borders on all cells (classic grid style)
- No caption field (users type below the block)

**Table — Export**
- Right-click → Export as .xlsx (Excel format)

**PDF Viewer — Display**
- Inline scrollable preview within the document flow (fixed height ~500px)
- User can resize viewer height by dragging the bottom edge
- Filename label displayed above the viewer
- Optional caption field below the viewer
- Loading skeleton (filename + spinner) while PDF loads from Google Drive
- Error card if Google Drive file is unavailable with link to Google Drive

**PDF Viewer — Controls**
- Toolbar at top of viewer: zoom in/out, fit-to-width, page indicator, prev/next arrows, download button, print button, full-screen toggle
- Right-click → Replace PDF (swap file without deleting block)
- Right-click → Edit link (update Google Drive URL if file moved)

**PDF Viewer — Storage**
- PDFs uploaded to Google Drive (not UploadThing/S3) — user has unlimited Drive storage
- OAuth vs service account auth for Drive uploads: already decided by existing codebase — OAuth2 with refresh token via `buildGoogleDriveOAuthClient()`

**PDF Viewer — Access**
- All users with wiki access can view and scroll PDFs (not editors-only)
- Mobile: collapses to tappable card (filename + page count) that opens Google Drive viewer in a new tab

**Media Blocks — Alignment & Layout**
- Four alignment options: Left / Center / Right / Full-width (via floating toolbar)
- Drag handles on corners/edges to resize media
- All media blocks (images, video, GIFs) consistent behavior

**Media Blocks — Captions & Metadata**
- Optional caption field below each media block (click to add)
- Optional alt text field for images (via right-click or toolbar)

**Media Blocks — Behavior**
- GIFs: autoplay on page load
- Videos: click to play (no autoplay), native browser controls
- Images: click to open full-screen lightbox

**Media Blocks — Storage**
- All media (images, videos, GIFs) uploaded to Google Drive — same integration as PDFs

**Media Blocks — Operations**
- Loading progress bar during upload (shows filename + progress)
- Right-click → Replace media (swap file without deleting block)
- Right-click → Copy link (share Google Drive URL)
- Lightbox for images: click to expand, close button

**Block Insertion UX — Slash Command**
- Type `/` on any line to open the block insertion menu
- Menu is searchable with fuzzy match
- Menu items show icon + label
- Menu grouped by category (Basic, Media, Embeds)
- No "recent blocks" section

**Block Insertion UX — Mouse Controls**
- `+` hover button on left of ALL block types
- Drag handle on left of ALL block types on hover

**Block Insertion UX — Block Operations**
- Duplicate block: right-click → Duplicate
- Backspace on empty block: deletes block and returns cursor to previous line
- No block type conversion
- No dedicated keyboard shortcuts beyond `/`

### Claude's Discretion
- Exact icon set for slash menu
- Hover animation timing for `+` button and drag handle
- Specific color palette for cell background color picker
- Loading skeleton visual design
- Exact lightbox animation style
- Error state illustration/icon for PDF unavailable

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REQ-02 | Enrich Tiptap editor with Notion-parity content blocks: collaborative tables, PDF previews, improved media UX. All blocks sync via Yjs in real-time. | Tiptap TableKit extension (verified), react-pdf for PDF viewer node, extended ImageResize + VideoNode patterns (existing in codebase), `@tiptap/extension-drag-handle-react` for drag+add UX, Tiptap suggestion API for slash menu. |
</phase_requirements>

---

## Summary

Phase 1 delivered a working collaborative Tiptap editor with Yjs sync, OAuth-backed Google Drive media uploads, and the `editorCanWrite` permission pattern. Phase 2 builds directly on top of this infrastructure — no new auth, no new storage backend, no new collab system. Every new block type (table, PDF, enhanced media) plugs into the same `extensions` array in `WikiEditor.tsx`, the same `/api/wiki-media` upload route, and the same Yjs CRDT document.

The table implementation is the most complex deliverable. Tiptap 3.x ships `@tiptap/extension-table` with `TableKit` (bundles Table + TableRow + TableCell + TableHeader). The official Tiptap UI Components system (CLI-based, shadcn-style copy into project) provides `TableHandle`, `TableTriggerButton`, `TableSelectionOverlay`, and `TableCellHandleMenu` — covering the hover grid picker, row/column handles, and cell alignment. Custom work is required for: cell background color (extend `TableCell`), row sort, filter bar, row drag-reorder, and Excel paste. The `.xlsx` export uses SheetJS (installed from CDN tarball — npm registry version is stale). All table node attributes (backgroundColor, alignment) sync automatically via Yjs because they are ProseMirror node attributes.

The PDF viewer is a custom Tiptap Node using `NodeViewWrapper` + `react-pdf` (v10.x). It must be dynamically imported with `ssr: false` because pdfjs-dist accesses browser-only APIs. The existing `/api/wiki-media` route handles upload; a separate `/api/wiki-media/[id]` proxy handles authenticated streaming — both already work for PDFs (MIME type is passed through). The existing `buildGoogleDriveOAuthClient()` OAuth2 pattern already answers the CONTEXT.md open question about auth strategy — OAuth with refresh token, already implemented. Media block improvements (alignment, captions, lightbox) are enhancements to the existing `ImageResize` and `VideoNode` patterns, not new infrastructure.

**Primary recommendation:** Use Tiptap's official `TableKit` + Tiptap UI Components CLI for the table foundation, install `react-pdf` v10 with `ssr: false` for PDF viewer, and extend `@tiptap/extension-drag-handle-react` + a custom suggestion-based slash menu for block insertion UX. All storage and auth patterns are already in place — reuse `/api/wiki-media`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tiptap/extension-table` | ^3.22.4 (latest) | Table node + TableKit bundle | Official Tiptap table extension, Yjs-compatible, includes resizable columns |
| `@tiptap/extension-drag-handle-react` | ^3.x (latest) | Drag handle + reorder for all block types | Official Tiptap React component, MIT open source, verified on npm |
| `@tiptap/extension-drag-handle` | ^3.x | Core drag handle extension (required peer) | Must install alongside React variant |
| `@tiptap/extension-node-range` | ^3.x | Required peer for drag handle | Peer dependency confirmed in official docs |
| `react-pdf` | ^10.4.1 | Render PDF pages in browser via pdfjs-dist | Standard React PDF viewer, 10.x is current stable, Next.js App Router compatible |
| `xlsx` (SheetJS) | 0.20.3 from CDN | Export table to .xlsx client-side | SheetJS Community Edition — npm registry version (0.18.5) is stale, install from CDN tarball |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tiptap/extension-bubble-menu` | ^3.22.3 | Floating toolbar on selection | Table selection toolbar, media alignment toolbar |
| `@tiptap/extension-floating-menu` | ^3.22.3 | Floating menu on empty line | `/` slash trigger on empty lines (alternative trigger) |
| Tiptap UI Components (CLI) | latest via `npx @tiptap/cli@latest` | TableHandle, TableTriggerButton, TableSelectionOverlay, SlashDropdownMenu | Installed via CLI (shadcn-style copy into project) — free components |
| `sass` or `sass-embedded` | latest | Required for Tiptap UI Component `.scss` stylesheets | Must be present when CLI-installed components are added |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-pdf` (wojtekmaj) | `@pdf-viewer/react` (PDF.js Express) | react-pdf is MIT free, @pdf-viewer/react has licensing costs for production |
| SheetJS CDN tarball | `exceljs` npm | exceljs is heavier but has better cell styling; SheetJS CDN is lighter and widely used for simple export |
| Tiptap UI Components CLI | Custom-built table handles from scratch | CLI gives production-quality handles in hours vs weeks; tradeoff is SCSS dependency and copied source |
| `@tiptap/extension-drag-handle-react` | Custom drag-handle with react-dnd | Official extension is actively maintained and integrates with Tiptap's node system without ProseMirror internals knowledge |

**Installation:**
```bash
# New Tiptap extensions
npm install @tiptap/extension-table @tiptap/extension-drag-handle @tiptap/extension-drag-handle-react @tiptap/extension-node-range

# PDF viewer
npm install react-pdf

# SCSS for Tiptap UI Components (if not already installed)
npm install --save-dev sass

# SheetJS from CDN (not npm registry — registry version is stale and insecure)
npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

# Tiptap UI Components via CLI (installs table-node, drag-context-menu, slash-dropdown-menu)
npx @tiptap/cli@latest add table-node
npx @tiptap/cli@latest add drag-context-menu
npx @tiptap/cli@latest add slash-dropdown-menu
```

---

## Architecture Patterns

### Recommended Project Structure
```
components/clash/
├── WikiEditor.tsx                    # Main editor — add new extensions to extensions[] useMemo
├── wiki-editor/
│   ├── media.ts                      # Image compression (existing)
│   ├── video-node.tsx                # VideoNode custom node (existing — enhance for GIF + alignment)
│   ├── yjs-provider.ts               # Yjs provider singleton (existing — no changes)
│   ├── WikiLinkDialog.tsx            # Link dialog (existing)
│   ├── table-node/                   # NEW: Tiptap CLI-installed table UI components
│   │   ├── extensions/               # TableKit, TableHandleExtension (copied by CLI)
│   │   ├── ui/                       # TableHandle, TableTriggerButton, etc. (copied by CLI)
│   │   └── styles/                   # prosemirror-table.scss, table-node.scss
│   ├── pdf-node.tsx                  # NEW: Custom Tiptap Node for PDF viewer
│   ├── image-node.tsx                # NEW: Replace ImageResize with enhanced version (alignment, caption, lightbox, alt text)
│   ├── slash-menu/                   # NEW: Slash command menu (CLI-installed or custom)
│   └── drag-handle/                  # NEW: Drag handle + add button wrapper

app/api/
├── wiki-media/
│   ├── route.ts                      # Existing upload POST — works for PDFs, images, video, GIFs unchanged
│   └── [id]/
│       └── route.ts                  # Existing proxy GET — works for PDFs (streams with correct MIME type)
```

### Pattern 1: Tiptap Extension Extension (Extend Existing for New Attributes)
**What:** Override an existing Tiptap extension's attributes using `.extend()` to add custom node attributes (e.g., backgroundColor on TableCell) that sync via Yjs automatically.
**When to use:** Any time a built-in extension needs a new custom attribute that serializes to HTML.
**Example:**
```typescript
// Source: https://tiptap.dev/docs/editor/extensions/custom-extensions/extend-existing
// Source: https://tiptap.dev/docs/editor/extensions/nodes/table-cell
import { TableCell } from '@tiptap/extension-table-cell';

export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: element => element.style.backgroundColor || null,
        renderHTML: attributes => {
          if (!attributes.backgroundColor) return {};
          return { style: `background-color: ${attributes.backgroundColor}` };
        },
      },
      textAlign: {
        default: null,
        parseHTML: element => element.style.textAlign || null,
        renderHTML: attributes => {
          if (!attributes.textAlign) return {};
          return { style: `text-align: ${attributes.textAlign}` };
        },
      },
    };
  },
});
```

### Pattern 2: Custom Tiptap Node (ReactNodeViewRenderer for Rich Block UI)
**What:** Build a custom block type as a React component using `Node.create()` + `ReactNodeViewRenderer`. This is the established pattern in this codebase (VideoNode already uses it).
**When to use:** PDF viewer, enhanced image block with lightbox/alignment/caption.
**Example:**
```typescript
// Source: Existing VideoNode pattern in components/clash/wiki-editor/video-node.tsx
// Source: https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/react
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

export const PdfNode = Node.create({
  name: "pdf",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      fileId: { default: null },      // Google Drive file ID (proxied via /api/wiki-media/[id])
      fileName: { default: null },
      caption: { default: null },
      height: { default: 500 },       // User-resizable height
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="pdf"]' }]; },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'pdf' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PdfNodeView);
  },
});
```

### Pattern 3: PDF Node View with react-pdf (Dynamic Import Required)
**What:** The PDF viewer React component must use `dynamic` import with `ssr: false` to avoid pdfjs-dist crashing on server render.
**When to use:** Anywhere pdfjs-dist or react-pdf is referenced in a component file.
**Example:**
```typescript
// Source: https://www.npmjs.com/package/react-pdf (updated 2026-02-25)
// "use client" component containing the PDF viewer
import { Document, Page } from 'react-pdf';
import { pdfjs } from 'react-pdf';

// Worker must be configured in same module where components are used
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
```

```typescript
// In WikiEditor.tsx or wherever PdfNodeView is imported:
const PdfNodeView = dynamic(() => import('./wiki-editor/pdf-node-view'), { ssr: false });
```

### Pattern 4: Excel Paste Detection
**What:** Use `transformPastedHTML` in editor props to detect Excel-originated clipboard HTML and normalize it to a Tiptap table. Excel pastes HTML with `<meta name='Generator' content='Microsoft Excel'>`.
**When to use:** The `editorProps.handlePaste` is already customized in WikiEditor.tsx — add Excel detection there.
**Example:**
```typescript
// Source: https://tiptap.dev/docs/guides/faq — transformPastedHTML
// Source: https://codepen.io/azam/pen/GRRRjdL — Excel HTML detection pattern
transformPastedHTML: (html: string) => {
  // Excel adds a Generator meta — if detected, let Tiptap's table
  // parseHTML rules handle it (TableKit registers <table> as parseable)
  return html; // TableKit's parseHTML handles <table> tags natively
},
```

### Pattern 5: SheetJS Export from Tiptap Table
**What:** Walk the ProseMirror document tree to extract table data, then use SheetJS to write an `.xlsx` file and trigger browser download.
**When to use:** Right-click → Export as .xlsx on any table block.
**Example:**
```typescript
// Source: https://docs.sheetjs.com/docs/getting-started/examples/export/
import * as XLSX from 'xlsx';

function exportTableAsXlsx(editor: Editor) {
  // Find table node at cursor, extract cell data as 2D array
  const rows: string[][] = [];
  // ... walk editor.state.doc descendants for table rows and cells
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Table');
  XLSX.writeFile(wb, 'table-export.xlsx');
}
```

### Pattern 6: DragHandle React + Add Button
**What:** `DragHandle` React component is rendered outside `EditorContent`. It wraps block-level nodes and provides a drag handle. Add a `+` button as a sibling in the same container using `onNodeChange` to track current node position.
**When to use:** The drag handle + add-button must appear on all block types (paragraphs, headings, lists, tables, PDF, media).
**Example:**
```typescript
// Source: https://tiptap.dev/docs/editor/extensions/functionality/drag-handle-react
import DragHandle from '@tiptap/extension-drag-handle-react';

// In WikiEditor render:
<DragHandle editor={editor} onNodeChange={({ node, pos }) => setCurrentNode({ node, pos })}>
  <div className="flex items-center gap-1">
    <button onClick={() => insertBlockAt(currentNode.pos)}>+</button>
    <GripVertical size={14} />
  </div>
</DragHandle>
```

### Anti-Patterns to Avoid
- **Installing `xlsx` from npm registry:** The npm-hosted version (0.18.5) has high severity vulnerabilities and hasn't been updated in 4 years. Always install from the SheetJS CDN tarball.
- **Importing react-pdf without `ssr: false`:** pdfjs-dist accesses `window`, `document`, and `canvas` — server render will crash. Always use `dynamic(() => import(...), { ssr: false })`.
- **Setting pdfjs workerSrc in a separate utility file:** Module execution order can cause the default worker to override your setting. Set `pdfjs.GlobalWorkerOptions.workerSrc` in the same file that renders `<Document>` / `<Page>`.
- **Building a custom table from ProseMirror primitives:** Tiptap's `@tiptap/extension-table` handles all the complex cell selection, merging, and keyboard navigation via `prosemirror-tables`. Don't recreate this.
- **Putting PDF viewer logic inside `StarterKit`:** StarterKit must be configured with `history: false` (already done). New custom nodes are registered separately in the `extensions` array — never inside StarterKit.
- **Adding `TableKit` alongside individual table extensions:** TableKit bundles Table + TableRow + TableCell + TableHeader. Don't also import them individually — it will cause duplicate node type errors.
- **Registering Tiptap UI Component extensions before `Collaboration`:** Collaboration must remain last or at least after document-structure extensions to avoid CRDT initialization order issues.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Column resizing | Custom mousedown resize logic | `TableKit.configure({ table: { resizable: true } })` | ProseMirror handles resize via column width attributes with handle drag — very complex to replicate |
| Cell selection across rows | Custom cell range tracking | `@tiptap/extension-table` built-in cell selection | prosemirror-tables handles multi-cell selection, merge, split — hundreds of edge cases |
| Tab-to-next-cell keyboard nav | Custom keydown handler | `@tiptap/extension-table` built-in `goToNextCell()` | Already handles Tab → next cell and Tab on last cell → new row |
| PDF page rendering | Custom canvas-based renderer | `react-pdf` (wojtekmaj/react-pdf) | pdfjs-dist is complex; react-pdf wraps it with proper React lifecycle management |
| Drag-reorder blocks | Custom drag-and-drop with react-dnd | `@tiptap/extension-drag-handle-react` | Integrates directly with ProseMirror's node position system, handles nested nodes |
| Block add button positioning | Manual floating UI | Combine DragHandle's `onNodeChange` with Floating UI | DragHandle already tracks node position; extend it rather than building parallel tracking |
| Excel clipboard detection | Custom clipboard HTML parser | `transformPastedHTML` + TableKit's native `parseHTML` | TableKit registers `<table>` HTML as parseable; Excel pastes HTML tables — they parse automatically |

**Key insight:** Tiptap 3.x has built the table internals on top of `prosemirror-tables`, which has thousands of lines of battle-tested table selection, navigation, and cell management code. Any custom table implementation will lack merge, split, multi-cell keyboard navigation, and column resizing — all of which exist for free in `TableKit`.

---

## Common Pitfalls

### Pitfall 1: pdfjs Worker Version Mismatch
**What goes wrong:** PDF pages render blank or the console shows "Setting up fake worker" warnings.
**Why it happens:** pdfjs-dist package version and the worker script version must match exactly. react-pdf v10 ships a specific pdfjs-dist version — if the worker URL points to a CDN version that doesn't match, rendering silently fails.
**How to avoid:** Use `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()` — this resolves to the exact version bundled with react-pdf automatically.
**Warning signs:** Blank PDF viewer, console warning about fake worker, `pdfjs-dist` appears twice in bundle analysis.

### Pitfall 2: TableKit + Collaboration Extension Order
**What goes wrong:** Yjs CRDT state gets corrupted or tables don't sync, especially on first sync.
**Why it happens:** The `Collaboration` extension must be initialized with a consistent document structure. If table-related extensions run after Collaboration's initial sync, node type mismatches can occur.
**How to avoid:** In `WikiEditor.tsx`'s `extensions` useMemo array, place table extensions before the `Collaboration.configure({...})` call — match the existing pattern where all structural extensions precede Collaboration.
**Warning signs:** Tables show as empty for newly connected users, merge undo is inconsistent across clients.

### Pitfall 3: Tiptap UI Components SCSS Import Required
**What goes wrong:** Table handles render with broken layout (wrong positions, no borders, handles floating off-screen).
**Why it happens:** The CLI-installed components ship `.scss` stylesheets that define critical layout and positioning. If `sass`/`sass-embedded` is not installed or the imports are missing from `globals.css`, handles break.
**How to avoid:** After running `npx @tiptap/cli@latest add table-node`, the CLI automatically injects SCSS imports into `app/globals.css`. Verify `sass` or `sass-embedded` is in devDependencies. If using `sass-embedded`, ensure `next.config.ts` does not conflict.
**Warning signs:** Table row/column handles appear but are mispositioned; no hover border appears on column drag.

### Pitfall 4: react-pdf SSR in Next.js App Router
**What goes wrong:** Build fails or runtime error: "canvas is not defined" or "window is not defined".
**Why it happens:** pdfjs-dist uses browser globals. Next.js App Router renders server-side by default. Even with `"use client"`, top-level imports execute at module evaluation time before hydration.
**How to avoid:** The `PdfNodeView` component that imports react-pdf must be wrapped in `dynamic(() => import(...), { ssr: false })` in the file that registers it with Tiptap. The `PdfNode` extension definition itself can be non-dynamic — only the view component needs dynamic import.
**Warning signs:** `Error: canvas is not defined` during `next build` or during SSR.

### Pitfall 5: SheetJS npm Registry Version Security Issue
**What goes wrong:** `npm install xlsx` installs version 0.18.5 with a high-severity vulnerability (Prototype Pollution — CVE history).
**Why it happens:** SheetJS moved off npm registry years ago but the old package name still resolves to the stale version.
**How to avoid:** Always install from the CDN tarball: `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
**Warning signs:** `npm audit` reports high severity on `xlsx`; installed version shows 0.18.5.

### Pitfall 6: Cell Background Color Not Syncing in Collaboration
**What goes wrong:** Cell background color applied by one user doesn't appear for another connected user.
**Why it happens:** `setCellAttribute` sets ProseMirror node attributes. These DO sync via Yjs because y-prosemirror tracks all document transactions. The pitfall is failing to include `backgroundColor` in the `addAttributes()` of the extended `TableCell` — without the attribute declaration, it's stripped on serialization/deserialization.
**How to avoid:** Always declare custom cell attributes in the `.extend()` `addAttributes()` block with both `parseHTML` and `renderHTML`. Verify the attribute survives a save → reload cycle.
**Warning signs:** Color appears initially but disappears after page reload or for other connected users.

### Pitfall 7: GIF Autoplay Blocked by Browser
**What goes wrong:** GIFs don't autoplay on load.
**Why it happens:** GIFs rendered as `<img>` tags autoplay natively. But if served through the `/api/wiki-media/[id]` proxy with incorrect `Content-Type`, the browser may not animate them.
**How to avoid:** The proxy route already reads `meta.data.mimeType` and sets `Content-Type` accordingly. Verify that the upload route preserves `image/gif` MIME type — it does (`file.type` is passed directly). No additional work needed for GIF autoplay; this is already handled by the existing media proxy.
**Warning signs:** GIF appears as static image, check `Content-Type` header in network tab.

---

## Code Examples

Verified patterns from official sources:

### Table Extension Setup (Minimal Working Config)
```typescript
// Source: https://tiptap.dev/docs/editor/extensions/nodes/table
// Source: https://tiptap.dev/docs/ui-components/node-components/table-node
import { TableKit } from '@/components/tiptap-node/table-node/extensions/table-node-extension'; // CLI-installed
import { TableHandleExtension } from '@/components/tiptap-node/table-node/extensions/table-handle'; // CLI-installed
import { TextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';

// In WikiEditor.tsx extensions useMemo (before Collaboration):
TableKit.configure({
  table: { resizable: true },
}),
TableHandleExtension,
CustomTableCell,   // extended with backgroundColor + textAlign
TextStyle,
Highlight.configure({ multicolor: true }),
```

### TableCell Extension with Custom Attributes
```typescript
// Source: https://tiptap.dev/docs/editor/extensions/nodes/table-cell
// Source: GitHub Issue #862 ueberdosis/tiptap — confirmed pattern
import { TableCell } from '@tiptap/extension-table-cell';

export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: el => el.style.backgroundColor || null,
        renderHTML: attrs => attrs.backgroundColor
          ? { style: `background-color: ${attrs.backgroundColor}` }
          : {},
      },
      textAlign: {
        default: null,
        parseHTML: el => el.style.textAlign || null,
        renderHTML: attrs => attrs.textAlign
          ? { style: `text-align: ${attrs.textAlign}` }
          : {},
      },
    };
  },
});
```

### react-pdf Worker Configuration (Next.js App Router)
```typescript
// Source: https://www.npmjs.com/package/react-pdf (v10.4.1, published 2026-02-25)
// Must be in same file as <Document> / <Page> components
"use client";
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
```

### SheetJS XLSX Export (Client-Side)
```typescript
// Source: https://docs.sheetjs.com/docs/getting-started/examples/export/
import * as XLSX from 'xlsx';

export function exportTableToXlsx(rows: string[][], fileName = 'table-export.xlsx') {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, fileName);
}
```

### DragHandle React Component Usage
```typescript
// Source: https://tiptap.dev/docs/editor/extensions/functionality/drag-handle-react
import DragHandle from '@tiptap/extension-drag-handle-react';
import { Editor } from '@tiptap/react';

// Render alongside EditorContent (not inside it):
<DragHandle editor={editor}>
  <div className="flex items-center gap-1 text-muted-foreground">
    <button
      className="hover:text-foreground p-0.5 rounded"
      onClick={() => { /* trigger slash menu / floating menu at cursor */ }}
    >
      <Plus size={14} />
    </button>
    <GripVertical size={14} />
  </div>
</DragHandle>
```

### Slash Menu — Extensions Required
```typescript
// Source: https://tiptap.dev/docs/ui-components/components/slash-dropdown-menu
// CLI installs SlashDropdownMenu component — configure items and groups:
import { SlashDropdownMenu } from '@/components/tiptap-ui/slash-dropdown-menu'; // CLI-installed

// Custom items for table, PDF, media:
const customSlashItems = [
  {
    title: 'Table',
    description: 'Insert a table',
    searchAliases: ['table', 'grid'],
    icon: <TableIcon size={16} />,
    group: 'Embeds',
    onSelect: ({ editor }: { editor: Editor }) => {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    title: 'PDF',
    description: 'Embed a PDF from Google Drive',
    searchAliases: ['pdf', 'document', 'file'],
    icon: <FileText size={16} />,
    group: 'Embeds',
    onSelect: () => { /* trigger file picker */ },
  },
];
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@tiptap/extension-table` imported individually with TableRow/TableCell/TableHeader | `TableKit` bundles all four | Tiptap 3.x | Use `TableKit` — no need to install four separate packages |
| `xlsx` from npm registry (0.18.5) | Install from SheetJS CDN tarball (0.20.3) | SheetJS moved off npm ~2022 | npm version has known vulnerabilities; CDN version is current |
| react-pdf v7/v8 with older pdfjs | react-pdf v10 with pdfjs v4.x | react-pdf v10 released ~2024 | Major pdfjs upgrade; breaking changes in worker config syntax |
| Custom ImageResize via `tiptap-extension-resize-image` | Enhanced custom `ImageNode` with alignment, caption, alt text, lightbox | Phase 2 | Replace the existing `ImageResize` usage with a purpose-built node that matches `VideoNode` pattern |
| No slash menu (manual toolbar buttons) | Tiptap UI Components `SlashDropdownMenu` via CLI | Phase 2 | CLI-installed, shadcn-style component copied into project — customize freely |
| No drag handles (toolbar-only reorder) | `@tiptap/extension-drag-handle-react` | Phase 2 | Official Tiptap MIT extension — installed via npm |

**Deprecated/outdated:**
- `tiptap-extension-resize-image` (currently used for images): Replace with a custom ImageNode following the `VideoNode` pattern — gives full control over alignment, caption, lightbox, alt text, and GIF autoplay detection.
- Using separate `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header` installs: Use `@tiptap/extension-table` (which exports `TableKit`) instead.

---

## Open Questions

1. **Row Drag-Reorder Inside Table**
   - What we know: `@tiptap/extension-drag-handle-react` handles block-level drag-reorder. Tiptap's `TableMoveRowColumnButton` (part of CLI table-node component) handles moving rows/columns.
   - What's unclear: Whether `TableMoveRowColumnButton` supports drag-to-reorder visually (drag handle on row left edge) vs click-based move up/down. The CONTEXT.md requires "row drag handles on left side for reordering rows."
   - Recommendation: During Wave 1 (table implementation), test `TableMoveRowColumnButton` behavior. If it's click-based only, implement a custom row drag using ProseMirror transactions + CSS drag handle indicator.

2. **Filter Bar Implementation**
   - What we know: The CONTEXT.md requires a "filter bar: toggled via toolbar, allows live row filtering without deleting data."
   - What's unclear: No Tiptap extension provides this natively. This is a React state-based UI feature, not a ProseMirror feature — the filter hides rows visually without altering the document.
   - Recommendation: Implement as a `NodeViewWrapper` React state feature in the custom table wrapper component. Filter state does NOT need to sync via Yjs (it's view-only, not document state).

3. **react-pdf Proxy URL Compatibility**
   - What we know: The existing `/api/wiki-media/[id]` proxy streams PDFs with `Content-Type: application/pdf` and `Content-Disposition: inline`. react-pdf's `<Document file={url}>` accepts a URL string.
   - What's unclear: Whether the proxy's streaming response (no `Content-Length` header) works with react-pdf's `Document` component on all browsers, or if it requires a direct Google Drive URL.
   - Recommendation: Test proxy URL compatibility in Wave 1. If react-pdf fails to load from the streaming proxy, use `drive.files.get` to generate a temporary signed URL on the backend and return it alongside the file ID.

4. **Tiptap UI Components CLI and Existing Tailwind/shadcn Setup**
   - What we know: The project uses shadcn/ui (components.json exists), Tailwind, and the project uses `className` conventions with `cn()`. Tiptap's CLI injects SCSS imports into `globals.css`.
   - What's unclear: Whether the Tiptap CLI's SCSS variables conflict with the existing Tailwind/shadcn dark theme variables. The project uses CSS variables for theming.
   - Recommendation: After `npx @tiptap/cli@latest add table-node`, review the injected `_variables.scss` for variable name conflicts with the project's existing CSS custom properties. Override Tiptap's SCSS variables to use the project's design tokens where needed.

---

## Google Drive Auth — CONTEXT.md Open Question Resolved

The CONTEXT.md noted: "Researcher must investigate: OAuth vs service account auth for Drive uploads."

**Answer:** Already solved. The project uses **OAuth2 with a stored refresh token** via `buildGoogleDriveOAuthClient()` in `lib/server/google-service-auth.ts`. This function reads `GOOGLE_DRIVE_REFRESH_TOKEN` (or `GMAIL_REFRESH_TOKEN`) and wraps it in a cached OAuth2 client. All uploads go through `/api/wiki-media` (POST) and all reads go through `/api/wiki-media/[id]` (GET proxy). **PDFs use the exact same pattern as images and videos** — no new auth code is needed for Phase 2.

---

## Sources

### Primary (HIGH confidence)
- `https://tiptap.dev/docs/editor/extensions/nodes/table` — TableKit features, setCellAttribute command, resizable config
- `https://tiptap.dev/docs/ui-components/node-components/table-node` — TableHandle, TableTriggerButton, TableSelectionOverlay, TableCellHandleMenu, TableSortRowColumnButton sub-components
- `https://tiptap.dev/docs/editor/extensions/functionality/drag-handle-react` — DragHandle React component, install, configuration
- `https://tiptap.dev/docs/ui-components/install/next` — CLI-based installation for Next.js (`npx @tiptap/cli@latest add`)
- `https://www.npmjs.com/package/react-pdf` — v10.4.1 (published 2026-02-25), current stable, Next.js App Router patterns
- `https://docs.sheetjs.com/docs/getting-started/examples/export/` — SheetJS export API, XLSX.utils.aoa_to_sheet, XLSX.writeFile
- `https://tiptap.dev/docs/editor/extensions/functionality/bubble-menu` — BubbleMenu for floating table toolbar
- Existing codebase: `components/clash/WikiEditor.tsx`, `wiki-editor/video-node.tsx`, `lib/server/google-service-auth.ts`, `app/api/wiki-media/route.ts` — establishes patterns that new code must follow

### Secondary (MEDIUM confidence)
- `https://github.com/ueberdosis/tiptap/issues/862` — Cell background color via `.extend()` + setCellAttribute confirmed by community + maintainer response
- `https://tiptap.dev/docs/ui-components/components/drag-context-menu` — Drag Context Menu for right-click block operations
- `https://tiptap.dev/docs/ui-components/components/slash-dropdown-menu` — Slash dropdown configuration API

### Tertiary (LOW confidence)
- `https://codepen.io/azam/pen/GRRRjdL` — Excel clipboard HTML format detection (`Generator: Microsoft Excel` meta tag)
- Row drag-reorder inside tables: undocumented — needs empirical test in Wave 1

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified on npm registry with current versions; Tiptap v3.x docs verified directly
- Architecture: HIGH — patterns derived directly from existing codebase (VideoNode, wiki-media route) and official Tiptap node view docs
- Pitfalls: HIGH (SSR, worker, TableKit conflicts) / MEDIUM (row drag inside table, filter bar — needs in-sprint testing)
- Google Drive auth: HIGH — already implemented; no investigation needed

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — Tiptap 3.x is stable; react-pdf v10 recently released, watch for patch updates)
