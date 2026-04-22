"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
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

const MIN_IMAGE_WIDTH = 120;
const MAX_IMAGE_WIDTH = 1400;

type ResizeSide = "left" | "right";

function clampWidth(value: number, maxWidth: number) {
  return Math.min(Math.max(value, MIN_IMAGE_WIDTH), maxWidth);
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

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
  const [lightboxClosing, setLightboxClosing] = useState(false);
  const [captionValue, setCaptionValue] = useState(attrs.caption ?? "");
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [replacing, setReplacing] = useState(false);
  const [editingAlt, setEditingAlt] = useState(false);
  const [altValue, setAltValue] = useState(attrs.alt ?? "");
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">(
    attrs.src ? "loading" : "error"
  );
  const [lightboxStatus, setLightboxStatus] = useState<
    "loading" | "loaded" | "error"
  >(attrs.src ? "loading" : "error");

  const figureRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCaptionValue(attrs.caption ?? "");
  }, [attrs.caption]);

  useEffect(() => {
    setAltValue(attrs.alt ?? "");
  }, [attrs.alt]);

  useEffect(() => {
    setImageStatus(attrs.src ? "loading" : "error");
    setLightboxStatus(attrs.src ? "loading" : "error");
  }, [attrs.src]);

  const closeLightbox = useCallback(() => {
    if (prefersReducedMotion()) {
      setLightboxOpen(false);
      setLightboxClosing(false);
      return;
    }

    setLightboxClosing(true);
    window.setTimeout(() => {
      setLightboxOpen(false);
      setLightboxClosing(false);
    }, 160);
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeLightbox, lightboxOpen]);

  const handleResizePointerDown = useCallback(
    (side: ResizeSide) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      const startWidth =
        figureRef.current?.getBoundingClientRect().width || attrs.width || 400;
      const containerWidth =
        figureRef.current?.parentElement?.getBoundingClientRect().width ||
        MAX_IMAGE_WIDTH;
      const maxWidth = Math.max(
        MIN_IMAGE_WIDTH,
        Math.min(MAX_IMAGE_WIDTH, containerWidth)
      );
      const direction = side === "right" ? 1 : -1;

      const updateWidthFromPointer = (clientX: number) => {
        const delta = (clientX - startX) * direction;
        const nextWidth = Math.round(clampWidth(startWidth + delta, maxWidth));
        updateAttributes({
          width: nextWidth,
          alignment: attrs.alignment === "full-width" ? "center" : attrs.alignment,
        });
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault();
        updateWidthFromPointer(moveEvent.clientX);
      };

      const onPointerUp = (upEvent: PointerEvent) => {
        updateWidthFromPointer(upEvent.clientX);
        if (target.hasPointerCapture(event.pointerId)) {
          target.releasePointerCapture(event.pointerId);
        }
        document.body.style.cursor = "";
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);
      };

      document.body.style.cursor = "ew-resize";
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", onPointerUp);
    },
    [attrs.alignment, attrs.width, updateAttributes]
  );

  const handleContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    setShowContextMenu(true);
    setContextMenuPos({ x: event.clientX, y: event.clientY });
  };

  const closeContextMenu = () => {
    setShowContextMenu(false);
    setEditingAlt(false);
  };

  const handleReplaceMedia = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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
      event.target.value = "";
    }
  };

  const isGif = attrs.src?.toLowerCase().includes(".gif");
  const alignment = attrs.alignment ?? "full-width";
  const resizeSides: ResizeSide[] =
    alignment === "left"
      ? ["right"]
      : alignment === "right"
        ? ["left"]
        : alignment === "center"
          ? ["left", "right"]
          : [];

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
      {selected && (
        <div
          contentEditable={false}
          className="absolute -top-9 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-background p-0.5 shadow-lg"
        >
          {(["left", "center", "right", "full-width"] as const).map((align) => (
            <Button
              key={align}
              variant={attrs.alignment === align ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => updateAttributes({ alignment: align })}
              type="button"
              title={align === "full-width" ? "Full width" : `Align ${align}`}
            >
              {align === "left" ? (
                <AlignLeft size={12} />
              ) : align === "center" ? (
                <AlignCenter size={12} />
              ) : align === "right" ? (
                <AlignRight size={12} />
              ) : (
                <span className="text-xs">Full</span>
              )}
            </Button>
          ))}
        </div>
      )}

      <div
        ref={figureRef}
        className={cn(
          "relative overflow-hidden rounded-xl transition-shadow",
          selected && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background",
          alignment === "full-width" ? "w-full" : "inline-block"
        )}
      >
        {imageStatus === "loading" && (
          <div className="absolute inset-0 z-[1] flex items-center justify-center rounded-xl bg-muted/60 text-xs text-muted-foreground backdrop-blur-sm">
            Loading image...
          </div>
        )}

        {imageStatus === "error" && (
          <div className="absolute inset-0 z-[1] flex items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10 px-4 text-center text-xs text-destructive">
            Image could not be loaded.
          </div>
        )}

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
          onClick={() => {
            if (!isGif && imageStatus !== "error") {
              setLightboxStatus(attrs.src ? "loading" : "error");
              setLightboxOpen(true);
            }
          }}
          onContextMenu={handleContextMenu}
          onLoad={() => setImageStatus("loaded")}
          onError={() => setImageStatus("error")}
        />

        {selected &&
          resizeSides.map((side) => (
            <button
              key={side}
              type="button"
              aria-label={`Resize image from the ${side}`}
              contentEditable={false}
              className={cn(
                "absolute top-1/2 z-[2] flex h-16 w-3 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-background/80 bg-primary shadow-lg transition-opacity motion-reduce:transition-none",
                side === "left" ? "left-1" : "right-1"
              )}
              onPointerDown={handleResizePointerDown(side)}
            >
              <span className="h-8 w-0.5 rounded-full bg-primary-foreground/90" />
            </button>
          ))}
      </div>

      <div contentEditable={false} className="mt-2 space-y-2">
        <label className="block">
          <span className="sr-only">Image caption</span>
          <input
            type="text"
            placeholder="Add caption..."
            value={captionValue}
            onChange={(event) => setCaptionValue(event.target.value)}
            onBlur={() => updateAttributes({ caption: captionValue || null })}
            className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-center text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:border-border focus:bg-background focus:outline-none"
          />
        </label>

        {selected && (
          <label className="block rounded-md border border-border bg-background/90 px-2 py-1.5 shadow-sm">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Alt text
            </span>
            <input
              type="text"
              value={altValue}
              onChange={(event) => setAltValue(event.target.value)}
              onBlur={() => updateAttributes({ alt: altValue || null })}
              className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
              placeholder="Describe the image"
            />
          </label>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,image/gif"
        className="hidden"
        onChange={handleReplaceMedia}
      />

      {showContextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} />
          <div
            className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-background p-1 shadow-xl"
            style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
            contentEditable={false}
          >
            <button
              className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
              disabled={replacing}
              onClick={() => {
                fileInputRef.current?.click();
                setShowContextMenu(false);
              }}
              type="button"
            >
              {replacing ? "Replacing..." : "Replace media"}
            </button>
            <button
              className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                navigator.clipboard.writeText(attrs.src ?? "");
                closeContextMenu();
              }}
              type="button"
            >
              Copy link
            </button>
            <button
              className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm hover:bg-accent"
              onClick={() => setEditingAlt(true)}
              type="button"
            >
              Edit alt text
            </button>
            {editingAlt && (
              <div className="mt-1 px-2 pb-1">
                <input
                  autoFocus
                  type="text"
                  value={altValue}
                  onChange={(event) => setAltValue(event.target.value)}
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

      {lightboxOpen && (
        <div
          className={cn(
            "fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 opacity-100 transition-opacity duration-150 motion-reduce:transition-none",
            lightboxClosing && "opacity-0"
          )}
          onClick={closeLightbox}
        >
          <div
            className={cn(
              "relative max-h-[92vh] max-w-[92vw] scale-100 overflow-hidden rounded-xl bg-black/30 shadow-2xl transition-transform duration-150 motion-reduce:transition-none",
              lightboxClosing && "scale-95"
            )}
            onClick={(event) => event.stopPropagation()}
          >
            {lightboxStatus === "loading" && (
              <div className="absolute inset-0 z-[1] flex min-h-60 min-w-80 items-center justify-center bg-black/40 text-sm text-white">
                Loading image...
              </div>
            )}
            {lightboxStatus === "error" && (
              <div className="flex min-h-60 min-w-80 items-center justify-center px-8 text-sm text-white">
                Image could not be loaded.
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attrs.src ?? ""}
              alt={attrs.alt ?? ""}
              className="block max-h-[92vh] max-w-[92vw] object-contain"
              onLoad={() => setLightboxStatus("loaded")}
              onError={() => setLightboxStatus("error")}
            />
          </div>
          <button
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            onClick={(event) => {
              event.stopPropagation();
              closeLightbox();
            }}
            type="button"
            aria-label="Close image preview"
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
        parseHTML: (el) => {
          const width = el.getAttribute("width") ?? el.style.width;
          return width ? parseInt(width, 10) : null;
        },
        renderHTML: (attrs) =>
          attrs.width ? { style: `width: ${attrs.width}px` } : {},
      },
      alignment: {
        default: "full-width",
        parseHTML: (el) => el.getAttribute("data-alignment") || "full-width",
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
