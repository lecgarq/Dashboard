# Research: Spatial Canvas Integration (Phase 3)

## Objective
Select and evaluate a spatial canvas (whiteboarding) library to integrate as a collaborative Tiptap node in the LECG Super Wiki.

## Options Evaluated

### 1. tldraw (Selected)
- **Architecture**: Modern React-based whiteboard SDK.
- **Tiptap Synergy**: Uses Tiptap/ProseMirror internally for text shapes. Highly modular.
- **Yjs Support**: Native. Designed to be backend-agnostic with clear "Sync" provider interfaces.
- **Pros**:
  - First-class developer experience for embedding.
  - Granular CRDT updates (synced via Yjs).
  - Matches the "Premium" aesthetic of the dashboard.
- **Cons**: Still in rapid development (can have API shifts).

### 2. Excalidraw
- **Architecture**: Hand-drawn aesthetic diagramming tool.
- **Tiptap Synergy**: Minimal. Requires community extensions.
- **Yjs Support**: Community-driven bindings (`y-excalidraw`).
- **Pros**: Instantly recognizable and user-friendly.
- **Cons**: Harder to customize and integrate deeply into the Tiptap node lifecycle.

## Technical Approach

### Integration Strategy
1. **Custom Tiptap Node**: Create a `SpatialCanvas` node extension.
2. **Yjs Persistence**: The node will store its state in a dedicated Yjs Map or Fragment within the same Yjs Document used by the wiki page.
3. **Lazy Loading**: Use `next/dynamic` to ensure the heavy `tldraw` bundle only loads when a canvas block is present.
4. **Permissions**: Inherit editor permissions (`editorCanWrite`) to enable/disable the canvas interaction.

## Conclusion
**tldraw** is the superior choice for a highly integrated, collaborative "Super Wiki". Its modularity allows us to treat it as a true block within our document flow while leveraging our existing Yjs infrastructure.
