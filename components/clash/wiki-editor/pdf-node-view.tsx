"use client";
import { useState, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { cn } from "@/lib/core/utils";
import { Button } from "@/components/ui/button";
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  Maximize,
} from "lucide-react";

// CRITICAL: Worker config must be in same file as Document/Page
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export default function PdfNodeView({
  node,
  selected,
  updateAttributes,
}: ReactNodeViewProps) {
  const attrs = node.attrs as {
    fileId: string | null;
    fileName: string | null;
    caption: string | null;
    height: number;
  };

  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [captionValue, setCaptionValue] = useState(attrs.caption ?? "");
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [showEditLink, setShowEditLink] = useState(false);
  const [editLinkValue, setEditLinkValue] = useState(attrs.fileId ?? "");
  const [replacing, setReplacing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build proxy URL from fileId
  const pdfUrl = attrs.fileId ? `/api/wiki-media/${attrs.fileId}` : null;

  // Height resize drag handler
  const handleHeightDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.pageY;
      const startHeight = attrs.height ?? 500;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const next = Math.max(200, startHeight + (moveEvent.pageY - startY));
        updateAttributes({ height: next });
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [attrs.height, updateAttributes]
  );

  // Replace PDF: upload new file and swap fileId/fileName attributes
  const handleReplaceFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        const json = await res.json();
        if (json.url) {
          // Extract fileId from the Google Drive URL (format: ...?id=FILE_ID or /uc?id=FILE_ID)
          const match = json.url.match(/[?&]id=([^&]+)/);
          const newFileId = match ? match[1] : json.fileId ?? json.url;
          updateAttributes({ fileId: newFileId, fileName: file.name });
          setLoadError(false);
        }
      } finally {
        setReplacing(false);
        setShowContextMenu(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [updateAttributes]
  );

  // Edit link: update fileId from a pasted Drive URL or raw ID
  const handleEditLink = useCallback(() => {
    const val = editLinkValue.trim();
    if (!val) return;
    // Accept full Drive URL or raw fileId
    const match =
      val.match(/[?&]id=([^&]+)/) || val.match(/\/d\/([^/]+)/);
    const newId = match ? match[1] : val;
    updateAttributes({ fileId: newId });
    setShowEditLink(false);
    setShowContextMenu(false);
    setLoadError(false);
  }, [editLinkValue, updateAttributes]);

  // Mobile detection — render card if touch device
  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 768px)").matches;
  if (isMobile && attrs.fileId) {
    return (
      <NodeViewWrapper>
        <a
          href={`https://drive.google.com/file/d/${attrs.fileId}/view`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 hover:bg-muted/60"
        >
          <span className="text-sm font-medium">
            {attrs.fileName ?? "PDF Document"}
          </span>
          <span className="text-xs text-muted-foreground">Open in Drive</span>
        </a>
        {attrs.caption && (
          <p className="mt-1 text-xs text-muted-foreground">{attrs.caption}</p>
        )}
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      className={cn(
        "group relative my-4 rounded-xl border border-border/50 shadow-lg overflow-hidden",
        selected ? "ring-2 ring-primary" : ""
      )}
      onContextMenu={(e: React.MouseEvent) => {
        e.preventDefault();
        setShowContextMenu(true);
        setContextMenuPos({ x: e.clientX, y: e.clientY });
      }}
    >
      {/* Hidden file input for Replace PDF */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleReplaceFile}
      />

      {/* Filename label */}
      {attrs.fileName && (
        <div className="border-b border-border/50 bg-muted/30 px-3 py-1.5 text-sm font-medium text-foreground">
          {attrs.fileName}
        </div>
      )}

      {/* PDF Toolbar */}
      {!loadError && pdfUrl && (
        <div className="flex items-center gap-1 border-b border-border/50 bg-background px-2 py-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            <ChevronLeft size={14} />
          </Button>
          <span className="min-w-[80px] text-center text-xs text-muted-foreground">
            Page {currentPage} of {numPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
          >
            <ChevronRight size={14} />
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
          >
            <ZoomOut size={14} />
          </Button>
          <span className="min-w-[40px] text-center text-xs">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setScale((s) => Math.min(3, s + 0.2))}
          >
            <ZoomIn size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              if (containerRef.current)
                setScale(containerRef.current.offsetWidth / 612);
            }}
            title="Fit to width"
          >
            <Maximize size={14} />
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <a href={pdfUrl} download={attrs.fileName ?? "document.pdf"}>
              <Download size={14} />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => window.print()}
          >
            <Printer size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsFullscreen((f) => !f)}
          >
            <Maximize size={14} />
          </Button>
        </div>
      )}

      {/* PDF Content */}
      <div
        ref={containerRef}
        className="overflow-auto bg-muted/10"
        style={{ height: isFullscreen ? "100vh" : `${attrs.height ?? 500}px` }}
      >
        {!pdfUrl ? (
          <div className="flex h-full items-center justify-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">
              {attrs.fileName ?? "Loading PDF..."}
            </span>
          </div>
        ) : loadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
            <div className="text-4xl">PDF</div>
            <p className="text-sm font-medium text-foreground">
              PDF unavailable — file may have been moved or deleted
            </p>
            {attrs.fileId && (
              <a
                href={`https://drive.google.com/file/d/${attrs.fileId}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline"
              >
                Open in Google Drive
              </a>
            )}
          </div>
        ) : (
          <Document
            file={pdfUrl}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={() => setLoadError(true)}
            loading={
              <div className="flex h-full items-center justify-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">
                  Loading PDF...
                </span>
              </div>
            }
          >
            <Page pageNumber={currentPage} scale={scale} />
          </Document>
        )}
      </div>

      {/* Height resize handle */}
      <div
        className="flex h-2 cursor-ns-resize items-center justify-center border-t border-border/50 bg-muted/20 hover:bg-muted/40"
        onMouseDown={handleHeightDrag}
      >
        <div className="h-0.5 w-8 rounded-full bg-border/70" />
      </div>

      {/* Caption */}
      <input
        type="text"
        placeholder="Add caption..."
        value={captionValue}
        onChange={(e) => setCaptionValue(e.target.value)}
        onBlur={() => updateAttributes({ caption: captionValue || null })}
        className="w-full border-0 bg-transparent px-3 py-1.5 text-xs text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none"
      />

      {/* Right-click context menu */}
      {showContextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-lg"
          style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
        >
          <button
            className="flex w-full items-center rounded px-2 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            disabled={replacing}
            onClick={() => fileInputRef.current?.click()}
          >
            {replacing ? "Replacing..." : "Replace PDF"}
          </button>
          <button
            className="flex w-full items-center rounded px-2 py-1.5 text-sm hover:bg-accent"
            onClick={() => {
              setShowEditLink(true);
              setShowContextMenu(false);
            }}
          >
            Edit link
          </button>
        </div>
      )}
      {showContextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowContextMenu(false)}
        />
      )}

      {/* Edit link inline panel */}
      {showEditLink && (
        <div className="border-t border-border/50 bg-muted/20 px-3 py-2">
          <p className="mb-1 text-xs text-muted-foreground">
            Paste Google Drive URL or file ID:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={editLinkValue}
              onChange={(e) => setEditLinkValue(e.target.value)}
              placeholder="https://drive.google.com/file/d/..."
              className="h-7 flex-1 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleEditLink}
            >
              Update
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowEditLink(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}
