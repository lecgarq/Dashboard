"use client";

import { useCallback, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { AlignCenter, AlignLeft, AlignRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";

const alignmentStyle: Record<string, string> = {
  left: "mr-auto",
  center: "mx-auto",
  right: "ml-auto",
  "full-width": "w-full",
};

function ImageNodeView({
  node,
  selected,
  updateAttributes,
}: ReactNodeViewProps) {
  const attrs = node.attrs as {
    id: string | null;
    isOptimistic: boolean;
    src: string | null;
    alt: string | null;
    width: number | null;
    alignment: string;
    caption: string | null;
  };

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [captionValue, setCaptionValue] = useState(attrs.caption ?? "");
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [replacing, setReplacing] = useState(false);
  const [editingAlt, setEditingAlt] = useState(false);
  const [altValue, setAltValue] = useState(attrs.alt ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startX = event.pageX;
      const startWidth = attrs.width || 400;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const nextWidth = Math.max(
          80,
          startWidth + (moveEvent.pageX - startX)
        );
        updateAttributes({ width: nextWidth });
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [attrs.width, updateAttributes]
  );

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowContextMenu(true);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => {
    setShowContextMenu(false);
    setEditingAlt(false);
  };

  const handleReplaceMedia = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReplacing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/wiki-media", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const json = await res.json();
        updateAttributes({ src: json.url });
      }
    } finally {
      setReplacing(false);
      if (e.target) e.target.value = "";
    }
  };

  const isGif = attrs.src?.toLowerCase().includes(".gif");
  const alignment = attrs.alignment ?? "full-width";

  return (
    <NodeViewWrapper
      className={cn(
        "group relative my-4 flex flex-col",
        alignmentStyle[alignment] === "w-full" ? "w-full" : "inline-flex"
      )}
      style={
        attrs.width && alignment !== "full-width"
          ? { width: `${attrs.width}px`, maxWidth: "100%" }
          : { maxWidth: "100%" }
      }
    >
      {/* Floating alignment toolbar — shown when selected */}
      {selected && (
        <div className="absolute -top-9 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-background p-0.5 shadow-lg">
          {(
            ["left", "center", "right", "full-width"] as const
          ).map((align) => (
            <Button
              key={align}
              variant={attrs.alignment === align ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => updateAttributes({ alignment: align })}
            >
              {align === "left" ? (
                <AlignLeft size={12} />
              ) : align === "center" ? (
                <AlignCenter size={12} />
              ) : align === "right" ? (
                <AlignRight size={12} />
              ) : (
                <span className="text-xs">↔</span>
              )}
            </Button>
          ))}
        </div>
      )}

      {/* Image container */}
      <div
        className={cn(
          "relative overflow-hidden rounded-xl",
          alignment === "full-width" ? "w-full" : "inline-block"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attrs.src ?? ""}
          alt={attrs.alt ?? ""}
          className={cn(
            "block max-w-full rounded-xl border border-border/50 shadow-lg",
            isGif ? "cursor-pointer" : "cursor-zoom-in",
            alignment === "full-width" ? "w-full" : "h-auto"
          )}
          style={
            attrs.width && alignment !== "full-width"
              ? { width: `${attrs.width}px` }
              : undefined
          }
          onClick={() => !isGif && setLightboxOpen(true)}
          onContextMenu={handleContextMenu}
        />

        {/* Resize handle — bottom-right corner */}
        <div
          className="pointer-events-auto absolute bottom-0 right-0 flex h-4 w-4 cursor-nwse-resize items-center justify-center rounded-tl-md bg-primary/80 opacity-0 backdrop-blur-sm group-hover:opacity-100"
          onMouseDown={handleDrag}
        >
          <div className="h-1.5 w-1.5 rounded-full bg-white shadow-sm" />
        </div>
      </div>

      {/* Caption input */}
      <input
        type="text"
        placeholder="Add caption..."
        value={captionValue}
        onChange={(e) => setCaptionValue(e.target.value)}
        onBlur={() => updateAttributes({ caption: captionValue || null })}
        className="mt-1 w-full border-0 bg-transparent text-center text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none"
      />

      {/* Hidden file input for Replace media */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,image/gif"
        className="hidden"
        onChange={handleReplaceMedia}
      />

      {/* Right-click context menu */}
      {showContextMenu && (
        <>
          {/* Backdrop to dismiss */}
          <div
            className="fixed inset-0 z-40"
            onClick={closeContextMenu}
          />
          <div
            className="fixed z-50 min-w-[160px] rounded-lg border border-border bg-background p-1 shadow-xl"
            style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
          >
            <button
              className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
              disabled={replacing}
              onClick={() => {
                fileInputRef.current?.click();
                setShowContextMenu(false);
              }}
            >
              {replacing ? "Replacing..." : "Replace media"}
            </button>
            <button
              className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                navigator.clipboard.writeText(attrs.src ?? "");
                closeContextMenu();
              }}
            >
              Copy link
            </button>
            <button
              className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm hover:bg-accent"
              onClick={() => setEditingAlt(true)}
            >
              Edit alt text
            </button>
            {editingAlt && (
              <div className="mt-1 px-2 pb-1">
                <input
                  autoFocus
                  type="text"
                  value={altValue}
                  onChange={(e) => setAltValue(e.target.value)}
                  onBlur={() => {
                    updateAttributes({ alt: altValue || null });
                    closeContextMenu();
                  }}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Alt text..."
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attrs.src ?? ""}
            alt={attrs.alt ?? ""}
            className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            onClick={() => setLightboxOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const ImageNode = Node.create({
  name: "image",
  group: "block",
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-id"),
        renderHTML: (attrs) => (attrs.id ? { "data-id": attrs.id } : {}),
      },
      isOptimistic: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-is-optimistic") === "true",
        renderHTML: (attrs) =>
          attrs.isOptimistic ? { "data-is-optimistic": "true" } : {},
      },
      src: { default: null },
      alt: {
        default: null,
        parseHTML: (el) => el.getAttribute("alt"),
        renderHTML: (attrs) => (attrs.alt ? { alt: attrs.alt } : {}),
      },
      width: {
        default: null,
        parseHTML: (el) =>
          el.style.width ? parseInt(el.style.width, 10) : null,
        renderHTML: (attrs) =>
          attrs.width ? { style: `width: ${attrs.width}px` } : {},
      },
      alignment: {
        default: "full-width",
        parseHTML: (el) =>
          el.getAttribute("data-alignment") || "full-width",
        renderHTML: (attrs) => ({ "data-alignment": attrs.alignment }),
      },
      caption: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-caption"),
        renderHTML: (attrs) =>
          attrs.caption ? { "data-caption": attrs.caption } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(HTMLAttributes, { class: "max-w-full rounded-xl" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
