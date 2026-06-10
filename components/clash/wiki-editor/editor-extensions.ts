"use client";

// Extension configuration for the WikiEditor (extracted verbatim from WikiEditor.tsx).
// IMPORTANT: wiki documents are stored content — the node/extension set built here
// must remain identical in effect; do not change any configure() options.

import { ReactNodeViewRenderer } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Underline } from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
import { FontFamily } from "@tiptap/extension-font-family";
import { TextStyle } from "@tiptap/extension-text-style";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";
import dynamic from "next/dynamic";
import type * as Y from "yjs";
import type { HocuspocusProvider } from "@hocuspocus/provider";

// Phase 2: Image (replaces tiptap-extension-resize-image)
import { ImageNode } from "./image-node";
import { VideoNode } from "./video-node";

// Phase 2: PDF node (schema only — NodeView wired below via dynamic import)
import { PdfNode } from "./pdf-node";

// Phase 2: Table extensions
import { TableKit } from "./table-node/extensions/table-node-extension";
import { CustomTableCell } from "./table-node/extensions/custom-table-cell";

// Dynamic import for PdfNodeView — keeps this file SSR-safe (pdf.js uses browser APIs)
const DynamicPdfNodeView = dynamic(
  () => import("./pdf-node-view"),
  { ssr: false }
);

export function buildStaticExtensions() {
  return [
    StarterKit.configure({
      history: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      // Disable built-ins that we register explicitly below to avoid
      // "[tiptap warn]: Duplicate extension names found: ['link', 'underline']"
      link: false,
      underline: false,
    } as any),
    BulletList,
    OrderedList,
    ListItem,
    Placeholder.configure({ placeholder: "Write section content here..." }),
    Underline,
    TextStyle,
    FontFamily,
    // Phase 2: ImageNode replaces ImageResize — same node name "image" preserves backward compat
    ImageNode,
    VideoNode,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'text-primary underline cursor-pointer',
      },
    }),

    // Phase 2: Table (registered BEFORE Collaboration)
    // tableCell: false prevents TableKit from registering the built-in TableCell —
    // CustomTableCell below is the sole 'tableCell' extension, avoiding the
    // "[tiptap warn]: Duplicate extension names found: ['tableCell']" warning.
    TableKit.configure({ table: { resizable: true }, tableCell: false } as any),
    CustomTableCell,

    // Phase 2: PDF node with dynamic NodeView (avoids SSR crash)
    PdfNode.extend({
      addNodeView() {
        return ReactNodeViewRenderer(DynamicPdfNodeView as any);
      },
    }),
  ];
}

export function buildCollaborationExtensions(
  ydoc: Y.Doc,
  provider: HocuspocusProvider,
  user: { name: string; color: string }
) {
  return [
    Collaboration.configure({
      document: ydoc,
    }),
    CollaborationCaret.configure({
      provider: provider,
      user: user,
    }),
  ];
}
