"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { trpc } from "@/lib/core/trpc";
import { Loader2 } from "lucide-react";

type GraphNode = {
  id: string;
  familyId: string;
  x: number;
  y: number;
  neighbors: number[];
  family: {
    id: string;
    familyName: string | null;
    finalCategory: string | null;
    lodLabel: string | null;
  };
};

interface LodGraphCanvasProps {
  onSelectFamily: (familyId: string) => void;
}

// Stable hue from a string (category → color)
function categoryColor(category: string | null): string {
  if (!category) return "hsl(220,8%,55%)";
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) & 0xffff;
  }
  return `hsl(${(hash % 360)},55%,58%)`;
}

type Transform = { offsetX: number; offsetY: number; scale: number };

export function LodGraphCanvas({ onSelectFamily }: LodGraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const transformRef = useRef<Transform>({ offsetX: 0, offsetY: 0, scale: 1 });
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);

  const { data, isLoading } = trpc.lod.getGraphData.useQuery(undefined, {
    staleTime: Infinity,
  });

  // Normalize nodes to [0,1] once after load
  const normalizedRef = useRef<{ nx: number; ny: number }[]>([]);

  useEffect(() => {
    if (!data?.length) return;
    const nodes = data as GraphNode[];
    nodesRef.current = nodes;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    normalizedRef.current = nodes.map((n) => ({
      nx: (n.x - minX) / rangeX,
      ny: (n.y - minY) / rangeY,
    }));

    // Reset transform to fit canvas
    const canvas = canvasRef.current;
    if (canvas) {
      transformRef.current = { offsetX: 0, offsetY: 0, scale: 1 };
      scheduleDraw();
    }
  }, [data]);

  const toCanvas = useCallback((nx: number, ny: number, canvas: HTMLCanvasElement, t: Transform) => {
    const padding = 40;
    const w = canvas.width - padding * 2;
    const h = canvas.height - padding * 2;
    return {
      cx: padding + nx * w * t.scale + t.offsetX,
      cy: padding + ny * h * t.scale + t.offsetY,
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nodes = nodesRef.current;
    const norm = normalizedRef.current;
    const t = transformRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!nodes.length) return;

    const padding = 40;
    const DOT_RADIUS = Math.max(1.5, Math.min(3.5, t.scale * 2.5));

    // Viewport bounds for culling
    const margin = DOT_RADIUS * 2;
    const minX = -margin;
    const maxX = canvas.width + margin;
    const minY = -margin;
    const maxY = canvas.height + margin;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const { cx, cy } = toCanvas(norm[i].nx, norm[i].ny, canvas, t);

      // Viewport culling (skip nodes outside canvas)
      if (cx < minX || cx > maxX || cy < minY || cy > maxY) continue;

      ctx.beginPath();
      ctx.arc(cx, cy, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = categoryColor(node.family.finalCategory);
      ctx.fill();
    }
  }, [toCanvas]);

  const scheduleDraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      scheduleDraw();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [scheduleDraw]);

  // Wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const t = transformRef.current;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newScale = Math.max(0.2, Math.min(40, t.scale * factor));
    // Zoom toward mouse position
    const dx = (mouseX - t.offsetX) * (newScale / t.scale - 1);
    const dy = (mouseY - t.offsetY) * (newScale / t.scale - 1);
    transformRef.current = {
      scale: newScale,
      offsetX: t.offsetX - dx,
      offsetY: t.offsetY - dy,
    };
    scheduleDraw();
  }, [scheduleDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { active: true, startX: e.clientX - transformRef.current.offsetX, startY: e.clientY - transformRef.current.offsetY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (dragRef.current?.active) {
      transformRef.current = {
        ...transformRef.current,
        offsetX: e.clientX - dragRef.current.startX,
        offsetY: e.clientY - dragRef.current.startY,
      };
      scheduleDraw();
      return;
    }

    // Hover tooltip: find nearest node within 12px
    const nodes = nodesRef.current;
    const norm = normalizedRef.current;
    const t = transformRef.current;
    if (!nodes.length) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const THRESHOLD = 12;

    let closest: { dist: number; index: number } | null = null;
    for (let i = 0; i < nodes.length; i++) {
      const { cx, cy } = toCanvas(norm[i].nx, norm[i].ny, canvas, t);
      const dist = Math.hypot(mx - cx, my - cy);
      if (dist < THRESHOLD && (!closest || dist < closest.dist)) {
        closest = { dist, index: i };
      }
    }

    if (closest) {
      const node = nodes[closest.index];
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        label: node.family.familyName ?? node.family.finalCategory ?? "Unknown",
      });
    } else {
      setTooltip(null);
    }
  }, [toCanvas, scheduleDraw]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nodes = nodesRef.current;
    const norm = normalizedRef.current;
    const t = transformRef.current;
    if (!nodes.length) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const THRESHOLD = 14;

    let closest: { dist: number; index: number } | null = null;
    for (let i = 0; i < nodes.length; i++) {
      const { cx, cy } = toCanvas(norm[i].nx, norm[i].ny, canvas, t);
      const dist = Math.hypot(mx - cx, my - cy);
      if (dist < THRESHOLD && (!closest || dist < closest.dist)) {
        closest = { dist, index: i };
      }
    }

    if (closest) {
      onSelectFamily(nodes[closest.index].family.id);
    }
  }, [toCanvas, onSelectFamily]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading graph…</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full select-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded bg-popover border text-popover-foreground text-xs px-2 py-1 shadow-md max-w-[180px] truncate"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          {tooltip.label}
        </div>
      )}
      <p className="absolute bottom-2 right-3 text-[10px] text-muted-foreground opacity-50">
        scroll to zoom · drag to pan · click to inspect
      </p>
    </div>
  );
}
