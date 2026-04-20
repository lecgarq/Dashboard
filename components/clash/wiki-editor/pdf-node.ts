import { Node, mergeAttributes } from "@tiptap/core";

// PdfNodeView is dynamically imported in WikiEditor.tsx to avoid SSR issues.
// This file only defines the node schema and attributes.

export const PdfNode = Node.create({
  name: "pdf",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      fileId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-file-id"),
        renderHTML: (attrs) =>
          attrs.fileId ? { "data-file-id": attrs.fileId } : {},
      },
      fileName: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-file-name"),
        renderHTML: (attrs) =>
          attrs.fileName ? { "data-file-name": attrs.fileName } : {},
      },
      caption: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-caption"),
        renderHTML: (attrs) =>
          attrs.caption ? { "data-caption": attrs.caption } : {},
      },
      height: {
        default: 500,
        parseHTML: (el) =>
          parseInt(el.getAttribute("data-height") || "500", 10),
        renderHTML: (attrs) => ({ "data-height": String(attrs.height ?? 500) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="pdf"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "pdf" })];
  },

  // Note: addNodeView() is NOT added here — it's registered in WikiEditor.tsx
  // via a dynamically-imported PdfNodeView to keep SSR safe.
  // Pattern: WikiEditor.tsx calls PdfNode.extend({ addNodeView: () => ReactNodeViewRenderer(DynamicPdfNodeView) })
});
