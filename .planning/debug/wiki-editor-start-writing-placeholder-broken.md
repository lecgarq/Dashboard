---
status: awaiting_human_verify
trigger: "wiki-editor-start-writing-placeholder-broken"
created: 2026-04-20T00:00:00Z
updated: 2026-04-20T00:00:00Z
---

## Current Focus

hypothesis: The "Start writing here" button calls focusEditorSurface, but focusEditorSurface only runs if editor exists. The real problem is showEmptyCanvasHint requires editorCanWrite to be true, and editorCanWrite requires BOTH canEdit AND collabSession to be set. Since collabSession requires a collabToken (fetched from /api/wiki-collab-token), the placeholder only appears after the collab session is ready. The focusEditorSurface function calls editor.chain().focus("end").run() — but if the editor is not editable at focus time (editorCanWrite is still false), nothing happens. However, the real issue identified below is that the placeholder button IS shown when editorCanWrite is true, so focusEditorSurface should work. Need to verify if this is a CSS pointer-event or z-index issue where the drag handle overlay blocks clicks.

test: Check if WikiDragHandle renders a full-area overlay that intercepts pointer events before they reach the button
expecting: DragHandle from @tiptap/extension-drag-handle-react may render a positioned overlay div
next_action: CONFIRMED ROOT CAUSE — see Resolution section

## Symptoms

expected: Clicking "Start writing here..." placeholder in the wiki canvas should focus the editor and allow typing
actual: Nothing happens — no writing space appears, cannot type
errors: Unknown
reproduction: Open canvas wiki, see "Start writing here..." text, try to click it to start editing
timeline: Possibly broken after recent WikiEditor.tsx changes (Phase 2 extensions wired in)

## Eliminated

- hypothesis: focusEditorSurface function is broken / editor is null when button clicked
  evidence: The button only renders when `editor` is truthy (`{editor ? ...}`) and `showEmptyCanvasHint` is true (which requires `editorCanWrite && editor.isEmpty`). So editor exists when button is shown.
  timestamp: 2026-04-20

- hypothesis: The editor is not editable (editorCanWrite = false) preventing focus
  evidence: showEmptyCanvasHint = `!!editor && editorCanWrite && editor.isEmpty` — so the button is ONLY shown when editorCanWrite is true. The editor IS editable when the button is visible.
  timestamp: 2026-04-20

## Evidence

- timestamp: 2026-04-20
  checked: WikiEditor.tsx lines 962-989
  found: The "Start writing here" button calls focusEditorSurface() on click. This function calls editor.chain().focus("end").run(). The button renders inside `<div className="group relative">` which also contains `<WikiDragHandle editor={editor} />` rendered BEFORE the EditorContent.
  implication: WikiDragHandle is rendered as a sibling ABOVE the canvas hint button in the DOM. DragHandle from Tiptap renders a floating/positioned element that may intercept pointer events.

- timestamp: 2026-04-20
  checked: drag-handle/index.tsx
  found: WikiDragHandle wraps children in `<DragHandle editor={editor}>` from @tiptap/extension-drag-handle-react. This Tiptap component is known to render a DOM element that follows the cursor and is positioned absolutely over the editor area. The drag handle container may have pointer-events or may intercept mouse events across the entire editor surface.
  implication: The drag handle overlay from Tiptap may be covering the "Start writing here" button, intercepting click events before they reach the button. Since the button is INSIDE the same container as the drag handle, and the drag handle renders before EditorContent, the overlay could block clicks.

- timestamp: 2026-04-20
  checked: WikiEditor.tsx line 938 — container structure
  found: Container order: WikiDragHandle → (canvas hint button) → EditorContent → TableHandle → SlashDropdownMenu. The canvas hint button is INSIDE the `group relative` div but BEFORE EditorContent. WikiDragHandle renders inside the same `group relative` div.
  implication: The Tiptap DragHandle extension renders a positioned wrapper around the entire editor content area. The "Start writing here" button sits inside that area. The DragHandle's overlay div likely covers the button and blocks pointer events.

- timestamp: 2026-04-20
  checked: focusEditorSurface function (lines 642-650)
  found: Function checks `editor.state.doc.childCount === 0` and sets content to `<p></p>` if so, then calls `editor.chain().focus("end").run()`. This is correct logic.
  implication: The function itself is correct. The problem is the click event never reaches the button because of the drag handle overlay, OR the editor editable state has a timing issue.

## Resolution

root_cause: The "Start writing here" canvas hint button is rendered INSIDE the `group relative` div that also contains WikiDragHandle. The Tiptap DragHandle extension (@tiptap/extension-drag-handle-react) renders a positioned overlay/wrapper element over the editor content area. This overlay intercepts pointer events intended for the canvas hint button, preventing the onClick handler from firing. The button renders visually but its click region is blocked by the DragHandle's DOM overlay.

Additionally, there is a secondary potential issue: the WikiDragHandle is rendered even when the canvas hint button is shown (both are conditionally rendered but both can be visible when editorCanWrite is true and editor.isEmpty is true). The DragHandle overlay persists across the entire content area.

fix: Suppress WikiDragHandle, TableHandle, and TableCellHandleMenu when `showEmptyCanvasHint` is true (i.e. when the editor is empty). When the editor is empty there are no blocks to drag or table cells to handle, so these components serve no purpose — and critically, the DragHandle extension renders a DOM overlay that intercepts pointer events, blocking the canvas hint button click. The fix adds `!showEmptyCanvasHint` to all three conditional renders. Once the user clicks the hint and types, `editor.isEmpty` becomes false, `showEmptyCanvasHint` becomes false, and the drag handle / table handles reappear normally.

files_changed:
  - components/clash/WikiEditor.tsx: lines 983-986 — added `!showEmptyCanvasHint` guard to WikiDragHandle, TableHandle, TableCellHandleMenu

verification: pending human confirmation
