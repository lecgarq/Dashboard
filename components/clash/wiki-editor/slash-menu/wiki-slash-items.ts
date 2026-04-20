"use client";

import React from "react";
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Image,
  Video,
  FileText,
  Table2,
  Film,
} from "lucide-react";
import type { SlashMenuItem } from "./index";

/**
 * WIKI_SLASH_ITEMS
 *
 * Full list of slash command menu items for the WikiEditor, grouped into:
 *   - Basic: text, headings, lists
 *   - Media: image, video, GIF
 *   - Embeds: table, PDF
 *
 * Consumed by SlashDropdownMenu in WikiEditor.tsx.
 */
export const WIKI_SLASH_ITEMS: SlashMenuItem[] = [
  // ─── Basic ────────────────────────────────────────────────────────────────
  {
    title: "Paragraph",
    description: "Plain text paragraph",
    searchAliases: ["paragraph", "text", "plain", "p"],
    icon: React.createElement(Type, { size: 16 }),
    group: "Basic",
    onSelect: ({ editor }) => {
      editor.chain().focus().setParagraph().run();
    },
  },
  {
    title: "Heading 1",
    description: "Large section heading",
    searchAliases: ["heading", "h1", "title", "large"],
    icon: React.createElement(Heading1, { size: 16 }),
    group: "Basic",
    onSelect: ({ editor }) => {
      editor.chain().focus().setHeading({ level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    searchAliases: ["heading", "h2", "subtitle", "medium"],
    icon: React.createElement(Heading2, { size: 16 }),
    group: "Basic",
    onSelect: ({ editor }) => {
      editor.chain().focus().setHeading({ level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    searchAliases: ["heading", "h3", "small"],
    icon: React.createElement(Heading3, { size: 16 }),
    group: "Basic",
    onSelect: ({ editor }) => {
      editor.chain().focus().setHeading({ level: 3 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Unordered bullet list",
    searchAliases: ["bullet", "list", "ul", "unordered"],
    icon: React.createElement(List, { size: 16 }),
    group: "Basic",
    onSelect: ({ editor }) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    title: "Ordered List",
    description: "Numbered ordered list",
    searchAliases: ["ordered", "number", "list", "ol", "numbered"],
    icon: React.createElement(ListOrdered, { size: 16 }),
    group: "Basic",
    onSelect: ({ editor }) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },

  // ─── Media ────────────────────────────────────────────────────────────────
  {
    title: "Image",
    description: "Upload an image (JPG, PNG, WebP)",
    searchAliases: ["image", "photo", "picture", "img", "upload"],
    icon: React.createElement(Image, { size: 16 }),
    group: "Media",
    onSelect: () => {
      // Uses the hidden file input rendered in WikiEditor.tsx
      const input = document.getElementById("wiki-image-upload") as HTMLInputElement | null;
      input?.click();
    },
  },
  {
    title: "Video",
    description: "Upload a video file (MP4, WebM)",
    searchAliases: ["video", "mp4", "film", "upload"],
    icon: React.createElement(Video, { size: 16 }),
    group: "Media",
    onSelect: () => {
      const input = document.getElementById("wiki-video-upload") as HTMLInputElement | null;
      input?.click();
    },
  },
  {
    title: "GIF",
    description: "Upload an animated GIF",
    searchAliases: ["gif", "animation", "animated", "image"],
    icon: React.createElement(Film, { size: 16 }),
    group: "Media",
    onSelect: () => {
      // GIF is an image — uses the same image upload input
      const input = document.getElementById("wiki-image-upload") as HTMLInputElement | null;
      input?.click();
    },
  },

  // ─── Embeds ───────────────────────────────────────────────────────────────
  {
    title: "Table",
    description: "Insert a 3×3 table (paste from Excel or Google Sheets)",
    searchAliases: ["table", "grid", "spreadsheet", "excel", "sheet"],
    icon: React.createElement(Table2, { size: 16 }),
    group: "Embeds",
    onSelect: ({ editor }) => {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    title: "PDF",
    description: "Embed a PDF document",
    searchAliases: ["pdf", "document", "file", "embed"],
    icon: React.createElement(FileText, { size: 16 }),
    group: "Embeds",
    onSelect: () => {
      // PDF upload uses a separate hidden input rendered in WikiEditor.tsx
      const input = document.getElementById("wiki-pdf-upload") as HTMLInputElement | null;
      input?.click();
    },
  },
];
