"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import type { ChatAttachment } from "@/lib/google/chat";
import { getMediaProxyUrl, isImage, isPdf, isVideo } from "./helpers";

// ─── Media Preview Modal ────────────────────────────────────────────────────

export function MediaPreviewModal({
  attachment,
  allPreviewable,
  onClose,
  onNavigate,
}: {
  attachment: ChatAttachment;
  allPreviewable: ChatAttachment[];
  onClose: () => void;
  onNavigate: (att: ChatAttachment) => void;
}) {
  const url = getMediaProxyUrl(attachment);
  const currentIndex = allPreviewable.findIndex((a) => a.name === attachment.name);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allPreviewable.length - 1;
  const isImg = isImage(attachment.contentType);

  // Zoom & pan state (images only)
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  // Reset zoom/pan on navigate
  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [attachment.name]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(allPreviewable[currentIndex - 1]);
      if (e.key === "ArrowRight" && hasNext) onNavigate(allPreviewable[currentIndex + 1]);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [attachment.name, hasPrev, hasNext, onClose, onNavigate, currentIndex, allPreviewable]);

  // Scroll-wheel zoom (images)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isImg) return;
    e.preventDefault();
    e.stopPropagation();
    setScale((prev) => Math.min(8, Math.max(0.5, prev - e.deltaY * 0.002)));
  }, [isImg]);

  // Middle-click pan (images)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isImg || scale <= 1) return;
    // middle button (1) or left button (0) when zoomed
    if (e.button === 1 || (e.button === 0 && scale > 1)) {
      e.preventDefault();
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOrigin.current = { ...pan };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, [isImg, scale, pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    setPan({
      x: panOrigin.current.x + (e.clientX - panStart.current.x),
      y: panOrigin.current.y + (e.clientY - panStart.current.y),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Double-click to reset zoom
  const handleDoubleClick = useCallback(() => {
    if (!isImg) return;
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [isImg]);

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-3 z-20 bg-gradient-to-b from-black/60 to-transparent">
        <p className="text-white/90 text-sm font-medium truncate max-w-[60%]">
          {attachment.contentName}
          {isImg && scale !== 1 && (
            <span className="ml-2 text-white/50 text-xs">{Math.round(scale * 100)}%</span>
          )}
        </p>
        <div className="flex items-center gap-1">
          <a
            href={url}
            download={attachment.contentName}
            onClick={(e) => e.stopPropagation()}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white"
            title="Download"
          >
            <Download size={18} />
          </a>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Navigation arrows */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(allPreviewable[currentIndex - 1]); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        >
          <ChevronLeft size={28} />
        </button>
      )}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(allPreviewable[currentIndex + 1]); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* Content */}
      <div
        className="w-screen h-screen flex items-center justify-center overflow-hidden pt-12 pb-4 px-12 touch-none"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: isImg && scale > 1 ? (isPanning.current ? "grabbing" : "grab") : undefined }}
      >
        {isImg && (
          <img
            src={url}
            alt={attachment.contentName}
            className="max-w-full max-h-full object-contain select-none shadow-2xl"
            draggable={false}
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
              transition: isPanning.current ? "none" : "transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
              willChange: "transform",
            }}
          />
        )}
        {isVideo(attachment.contentType) && (
          <video
            src={url}
            controls
            autoPlay
            className="max-w-full max-h-full rounded-lg shadow-2xl"
          />
        )}
        {isPdf(attachment.contentType) && (
          <iframe
            src={url}
            title={attachment.contentName}
            className="w-full h-full rounded-lg shadow-2xl bg-white"
          />
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
