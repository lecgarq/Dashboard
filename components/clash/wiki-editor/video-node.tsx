import { useCallback } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";

import { cn } from "@/lib/core/utils";

function VideoNodeView({
  node,
  selected,
  updateAttributes,
}: ReactNodeViewProps) {
  const attrs = node.attrs as {
    src: string;
    controls?: boolean;
    width?: number | null;
  };

  const handleDrag = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startX = event.pageX;
      const startWidth = attrs.width || 400;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const nextWidth = Math.max(150, startWidth + (moveEvent.pageX - startX));
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

  return (
    <NodeViewWrapper
      className={cn(
        "group relative my-4 inline-block overflow-hidden transition-all duration-200",
        selected ? "ring-2 ring-primary" : ""
      )}
      style={{
        width: attrs.width ? `${attrs.width}px` : "100%",
        maxWidth: "100%",
      }}
    >
      <video
        className="block h-auto w-full rounded-xl border border-border/50 shadow-lg"
        controls={attrs.controls}
        preload="metadata"
        src={attrs.src}
      />
      <div
        className="pointer-events-auto absolute bottom-0 right-0 flex h-4 w-4 cursor-nwse-resize items-center justify-center rounded-tl-md bg-primary/80 opacity-0 backdrop-blur-sm group-hover:opacity-100"
        onMouseDown={handleDrag}
      >
        <div className="h-1.5 w-1.5 rounded-full bg-white shadow-sm" />
      </div>
    </NodeViewWrapper>
  );
}

export const VideoNode = Node.create({
  name: "video",
  group: "block",
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true },
      width: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "video" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(HTMLAttributes, {
        class: "my-4 block max-w-full rounded-xl border border-border/50 shadow-lg",
        controls: true,
        preload: "metadata",
        style: HTMLAttributes.width
          ? `width: ${HTMLAttributes.width}px`
          : undefined,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoNodeView);
  },
});
