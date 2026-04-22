"use client";

import { useRef, useEffect, useCallback, useState, useMemo, memo } from "react";
import { trpc } from "@/lib/core/trpc";
import { Loader2 } from "lucide-react";
import { getFamilyDisplayName } from "./lodDisplay";

type GraphNode = {
  id: string;
  familyId: string;
  x: number;
  y: number;
  neighbors: number[];
  family: {
    id: string;
    familyName: string | null;
    nameOfFile: string | null;
    finalCategory: string | null;
    lodLabel: string | null;
  };
};

interface LodGraphCanvasProps {
  onSelectFamily: (familyId: string) => void;
}

// ─── Color palette (matches the original LOD Checker) ────────────────────────
const VIBRANT_COLORS: string[] = [
  "#E63946", "#F4A261", "#2A9D8F", "#264653", "#A8DADC",
  "#D62828", "#F77F00", "#FCBF49", "#003049", "#FF9F1C",
  "#2EC4B6", "#FFBF69", "#FF99C8", "#9B5DE5", "#F15BB5",
  "#FEE440", "#00BBF9", "#00F5D4", "#4361EE", "#3A0CA3",
  "#7209B7", "#560BAD", "#480CA8", "#B5179E", "#F72585",
  "#4CC9F0", "#8338EC", "#FF006E", "#FB5607", "#3D5A40",
];
const colorCache = new Map<string, string>();
function getCategoryColor(category?: string | null): string {
  if (!category) return "#E9E7E2";
  if (!colorCache.has(category)) {
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
      hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }
    colorCache.set(category, VIBRANT_COLORS[Math.abs(hash) % VIBRANT_COLORS.length]);
  }
  return colorCache.get(category)!;
}

// ─── Safety guards ────────────────────────────────────────────────────────────
function isValidNodeIndex(index: number, total: number) {
  return Number.isInteger(index) && index >= 0 && index < total;
}
function getSafeNeighbors(node: GraphNode, total: number, limit = 10): number[] {
  const nb = Array.isArray(node.neighbors) ? node.neighbors : [];
  const out: number[] = [];
  for (let i = 0; i < Math.min(nb.length, limit); i++) {
    if (isValidNodeIndex(nb[i], total)) out.push(nb[i]);
  }
  return out;
}

// Pre-compute flat Uint32Array of [from, to, from, to, ...] edge pairs
function buildLinks(nodes: GraphNode[]): Uint32Array {
  const pairs: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (const t of getSafeNeighbors(nodes[i], nodes.length, 10)) {
      if (t > i) pairs.push(i, t);
    }
  }
  return new Uint32Array(pairs);
}

function createCircleSprite(color: string, size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const d = size * 2;
  canvas.width = d; canvas.height = d;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(size, size, size, 0, Math.PI * 2); ctx.fill();
  return canvas;
}

// ─── Component ────────────────────────────────────────────────────────────────
function LodGraphCanvasInner({ onSelectFamily }: LodGraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const [isReady, setIsReady] = useState(false);

  const currentPos = useRef<Float32Array>(new Float32Array(0));
  const targetPos = useRef<Float32Array>(new Float32Array(0));
  const links = useRef<Uint32Array>(new Uint32Array(0));

  const view = useRef({ x: 0, y: 0, scale: 1 });
  const targetView = useRef({ x: 0, y: 0, scale: 1 });

  const rafId = useRef<number>(0);
  const isAnimating = useRef(false);
  const isDragging = useRef(false);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const clickStart = useRef({ x: 0, y: 0 });
  const middleDragging = useRef(false);
  const middleStart = useRef({ x: 0, y: 0 });
  const middleLast = useRef({ x: 0, y: 0 });

  const selectedFamilyRef = useRef<string | null>(null);
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [isolateMode, setIsolateMode] = useState(false);
  const isolateModeRef = useRef(false);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0 });

  const sprites = useRef(new Map<string, HTMLCanvasElement>());

  // Spatial grid for fast hit testing
  const grid = useRef({ size: 0.05, cells: new Map<string, number[]>() });

  const nodeIndexMap = useMemo(() => new Map<string, number>(), []);

  const { data, isLoading } = trpc.lod.getGraphData.useQuery(undefined, {
    staleTime: Infinity,
  });

  // ── Initialize once data loads ────────────────────────────────────────────
  useEffect(() => {
    if (!data?.length) return;
    const nodes = data as GraphNode[];
    nodesRef.current = nodes;

    // Sprites per category
    const cats = new Set(nodes.map((n) => n.family.finalCategory));
    cats.forEach((cat) => {
      const color = getCategoryColor(cat);
      if (!sprites.current.has(color)) {
        sprites.current.set(color, createCircleSprite(color, 8));
      }
    });
    if (!sprites.current.has("grey")) {
      sprites.current.set("grey", createCircleSprite("#E9E7E2", 8));
    }

    // Normalize positions to world-space [0, 1]
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
    }
    const rx = maxX - minX || 1, ry = maxY - minY || 1;
    const count = nodes.length;
    const pos = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      pos[i * 2] = (nodes[i].x - minX) / rx;
      pos[i * 2 + 1] = (nodes[i].y - minY) / ry;
    }
    currentPos.current = pos;
    targetPos.current = new Float32Array(pos);

    nodeIndexMap.clear();
    nodes.forEach((n, i) => nodeIndexMap.set(n.id, i));

    links.current = buildLinks(nodes);

    updateGrid();
    requestAnimationFrame(() => {
      setIsReady(true);
      zoomToFit(null);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // ── Grid ──────────────────────────────────────────────────────────────────
  const updateGrid = useCallback(() => {
    const g = grid.current;
    g.cells.clear();
    const pos = currentPos.current;
    const nodes = nodesRef.current;
    const v = view.current;
    g.size = Math.max(0.01, 60 / v.scale);
    for (let i = 0; i < nodes.length; i++) {
      const nx = pos[i * 2], ny = pos[i * 2 + 1];
      const key = `${Math.floor(nx / g.size)},${Math.floor(ny / g.size)}`;
      if (!g.cells.has(key)) g.cells.set(key, []);
      g.cells.get(key)!.push(i);
    }
  }, []);

  // ── Zoom to fit — offsets camera left when detail panel is open ───────────
  const zoomToFit = useCallback((focusId: string | null) => {
    const nodes = nodesRef.current;
    const pos = currentPos.current;
    if (!nodes.length || !canvasRef.current) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const fitIdxs: number[] = [];

    if (focusId) {
      const idx = nodeIndexMap.get(focusId) ?? -1;
      if (isValidNodeIndex(idx, nodes.length)) {
        fitIdxs.push(idx);
        for (const nb of getSafeNeighbors(nodes[idx], nodes.length, 10)) fitIdxs.push(nb);
      }
    }
    if (!fitIdxs.length) {
      for (let i = 0; i < nodes.length; i++) fitIdxs.push(i);
    }

    for (const i of fitIdxs) {
      const x = pos[i * 2], y = pos[i * 2 + 1];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (minX === Infinity) return;

    const dw = maxX - minX || 0.01, dh = maxY - minY || 0.01;
    const cw = canvasRef.current.clientWidth || 1000;
    const ch = canvasRef.current.clientHeight || 800;

    // Offset left when detail panel is open (panel is ~420px wide)
    const sidebarWidth = selectedFamilyRef.current ? 440 : 0;
    const effectiveCW = cw - sidebarWidth;
    const fitScale = Math.min(effectiveCW / dw, ch / dh) * 0.75;
    const centerX = (minX + maxX) / 2;
    const offsetX = (sidebarWidth / 2) / Math.max(fitScale, 50);

    targetView.current = {
      x: centerX + offsetX,
      y: (minY + maxY) / 2,
      scale: Math.max(50, Math.min(500000, fitScale)),
    };
  }, [nodeIndexMap]);

  // ── Main render loop ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const render = () => {
      rafId.current = requestAnimationFrame(render);

      // Lerp camera
      const v = view.current, tv = targetView.current;
      v.x += (tv.x - v.x) * 0.2;
      v.y += (tv.y - v.y) * 0.2;
      v.scale += (tv.scale - v.scale) * 0.2;

      // Lerp node positions
      if (isAnimating.current) {
        const cp = currentPos.current, tp = targetPos.current;
        let maxDiff = 0;
        for (let i = 0; i < cp.length; i++) {
          const diff = tp[i] - cp[i];
          if (Math.abs(diff) > 0.001) {
            cp[i] += diff * 0.2;
            maxDiff = Math.max(maxDiff, Math.abs(diff));
          } else {
            cp[i] = tp[i];
          }
        }
        if (maxDiff < 0.0005) {
          isAnimating.current = false;
          updateGrid();
        }
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      const wantW = Math.floor(w * dpr), wantH = Math.floor(h * dpr);
      if (canvas.width !== wantW || canvas.height !== wantH) {
        canvas.width = wantW; canvas.height = wantH;
      }

      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#F8F7F4";
      ctx.fillRect(0, 0, w, h);

      ctx.translate(w / 2, h / 2);
      ctx.scale(v.scale, v.scale);
      ctx.translate(-v.x, -v.y);

      const nodes = nodesRef.current;
      const pos = currentPos.current;
      if (!nodes.length) return;

      // Skip expensive edge drawing while interacting for smooth 60fps
      const isInteracting = isDragging.current || middleDragging.current || isAnimating.current
        || Math.abs(tv.x - v.x) > 0.5 || Math.abs(tv.scale - v.scale) > 0.5;

      const pad = 50 / v.scale;
      const minWX = v.x - (w / 2) / v.scale - pad, maxWX = v.x + (w / 2) / v.scale + pad;
      const minWY = v.y - (h / 2) / v.scale - pad, maxWY = v.y + (h / 2) / v.scale + pad;

      const selId = selectedFamilyRef.current;
      const selIdx = selId ? (nodeIndexMap.get(selId) ?? -1) : -1;
      const hasSelection = isValidNodeIndex(selIdx, nodes.length);
      const highlightSet = new Set<number>();
      if (hasSelection) {
        highlightSet.add(selIdx);
        for (const nb of getSafeNeighbors(nodes[selIdx], nodes.length, 10)) highlightSet.add(nb);
      }
      const isIsolated = isolateModeRef.current && hasSelection;

      // ── Edges ──────────────────────────────────────────────────────────
      ctx.lineWidth = 0.5 / v.scale;

      if (hasSelection) {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = getCategoryColor(nodes[selIdx].family.finalCategory);
        ctx.beginPath();
        for (const t of getSafeNeighbors(nodes[selIdx], nodes.length, 10)) {
          ctx.moveTo(pos[selIdx * 2], pos[selIdx * 2 + 1]);
          ctx.lineTo(pos[t * 2], pos[t * 2 + 1]);
        }
        ctx.stroke();
      } else if (!isInteracting && !isIsolated) {
        const lk = links.current;
        if (lk.length > 0) {
          const pairCount = lk.length / 2;
          const pairStride = Math.max(1, Math.ceil(pairCount / 20000));
          const indexStride = pairStride * 2;
          ctx.globalAlpha = pairCount > 20000 ? 0.05 : 0.07;
          const batches = new Map<string, number[]>();
          for (let i = 0; i < lk.length; i += indexStride) {
            const s = lk[i], t = lk[i + 1];
            if (pos[s * 2] < minWX && pos[t * 2] < minWX) continue;
            if (pos[s * 2] > maxWX && pos[t * 2] > maxWX) continue;
            if (pos[s * 2 + 1] < minWY && pos[t * 2 + 1] < minWY) continue;
            if (pos[s * 2 + 1] > maxWY && pos[t * 2 + 1] > maxWY) continue;
            const color = getCategoryColor(nodes[s].family.finalCategory);
            if (!batches.has(color)) batches.set(color, []);
            batches.get(color)!.push(s, t);
          }
          for (const [color, pairs] of batches) {
            ctx.strokeStyle = color;
            ctx.beginPath();
            for (let i = 0; i < pairs.length; i += 2) {
              ctx.moveTo(pos[pairs[i] * 2], pos[pairs[i] * 2 + 1]);
              ctx.lineTo(pos[pairs[i + 1] * 2], pos[pairs[i + 1] * 2 + 1]);
            }
            ctx.stroke();
          }
        }
      }

      // ── Nodes ──────────────────────────────────────────────────────────
      const dimBatches = new Map<string, number[]>(), brightBatches = new Map<string, number[]>();
      for (let i = 0; i < nodes.length; i++) {
        const nx = pos[i * 2], ny = pos[i * 2 + 1];
        if (nx < minWX || nx > maxWX || ny < minWY || ny > maxWY) continue;
        const color = getCategoryColor(nodes[i].family.finalCategory);
        const target = (!hasSelection || highlightSet.has(i)) ? brightBatches : dimBatches;
        if (!target.has(color)) target.set(color, []);
        target.get(color)!.push(nx, ny);
      }

      if (hasSelection) {
        // In isolate mode skip dim nodes entirely; otherwise draw them faded
        if (!isIsolated) {
          ctx.globalAlpha = 0.15;
          const grey = sprites.current.get("grey");
          if (grey) {
            const r = 0.8 / v.scale, d = r * 2;
            for (const [, coords] of dimBatches) {
              for (let i = 0; i < coords.length; i += 2)
                ctx.drawImage(grey, coords[i] - r, coords[i + 1] - r, d, d);
            }
          }
        }
        // Bright highlighted (larger)
        ctx.globalAlpha = 1.0;
        const rG = 3.5 / v.scale, dG = rG * 2;
        for (const [color, coords] of brightBatches) {
          const sprite = sprites.current.get(color);
          if (!sprite) continue;
          for (let i = 0; i < coords.length; i += 2)
            ctx.drawImage(sprite, coords[i] - rG, coords[i + 1] - rG, dG, dG);
        }
      } else {
        ctx.globalAlpha = 0.6;
        const r = 0.8 / v.scale, d = r * 2;
        for (const [color, coords] of brightBatches) {
          const sprite = sprites.current.get(color);
          if (!sprite) continue;
          for (let i = 0; i < coords.length; i += 2)
            ctx.drawImage(sprite, coords[i] - r, coords[i + 1] - r, d, d);
        }
      }

      // ── Selected node ring ─────────────────────────────────────────────
      if (hasSelection) {
        const sx = pos[selIdx * 2], sy = pos[selIdx * 2 + 1];
        const color = getCategoryColor(nodes[selIdx].family.finalCategory);
        ctx.globalAlpha = 0.2; ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(sx, sy, 14 / v.scale, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1.0; ctx.strokeStyle = "#222"; ctx.lineWidth = 2.5 / v.scale;
        ctx.beginPath(); ctx.arc(sx, sy, 8 / v.scale, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(sx, sy, 4 / v.scale, 0, Math.PI * 2); ctx.fill();
      }

      ctx.globalAlpha = 1.0;
    };

    rafId.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId.current);
  }, [nodeIndexMap, updateGrid]);

  // ── Resize observer ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      if (nodesRef.current.length) zoomToFit(selectedFamilyRef.current);
    });
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [zoomToFit]);

  // Auto-zoom when selection changes; reset isolate when deselecting
  useEffect(() => {
    if (!isReady) return;
    if (!selectedFamily) {
      isolateModeRef.current = false;
      setIsolateMode(false);
      return;
    }
    const timer = setTimeout(() => zoomToFit(selectedFamily), 250);
    return () => clearTimeout(timer);
  }, [selectedFamily, isReady, zoomToFit]);

  // ── Wheel zoom ─────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const cx = rect.width / 2, cy = rect.height / 2;
    const v = view.current;
    const wx = v.x + (mx - cx) / v.scale, wy = v.y + (my - cy) / v.scale;
    const newS = Math.max(10, Math.min(500000, v.scale * Math.pow(1.002, -e.deltaY)));
    view.current = { scale: newS, x: wx - (mx - cx) / newS, y: wy - (my - cy) / newS };
    targetView.current = { ...view.current };
  }, []);

  // ── Middle mouse pan ──────────────────────────────────────────────────────
  const handleMiddleDown = useCallback((e: MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    middleDragging.current = true;
    middleStart.current = { x: e.clientX, y: e.clientY };
    middleLast.current = { x: e.clientX, y: e.clientY };
    setIsDraggingState(true);
  }, []);

  const handleMiddleMove = useCallback((e: MouseEvent) => {
    if (!middleDragging.current) return;
    const dx = e.clientX - middleLast.current.x, dy = e.clientY - middleLast.current.y;
    view.current.x -= dx / view.current.scale;
    view.current.y -= dy / view.current.scale;
    targetView.current = { ...view.current };
    middleLast.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMiddleUp = useCallback((e: MouseEvent) => {
    if (e.button !== 1 || !middleDragging.current) return;
    middleDragging.current = false;
    setIsDraggingState(false);
    if (Math.hypot(e.clientX - middleStart.current.x, e.clientY - middleStart.current.y) < 5) {
      zoomToFit(selectedFamilyRef.current);
    }
  }, [zoomToFit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const hideMenu = () => setContextMenu({ visible: false, x: 0, y: 0 });
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") hideMenu(); };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("mousedown", handleMiddleDown);
    canvas.addEventListener("mousemove", handleMiddleMove);
    canvas.addEventListener("mouseup", handleMiddleUp);
    window.addEventListener("click", hideMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("mousedown", handleMiddleDown);
      canvas.removeEventListener("mousemove", handleMiddleMove);
      canvas.removeEventListener("mouseup", handleMiddleUp);
      window.removeEventListener("click", hideMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleWheel, handleMiddleDown, handleMiddleMove, handleMiddleUp]);

  // ── Hit test via spatial grid ─────────────────────────────────────────────
  const hitTest = useCallback((sx: number, sy: number): GraphNode | null => {
    if (!canvasRef.current) return null;
    const v = view.current;
    const w = canvasRef.current.clientWidth, h = canvasRef.current.clientHeight;
    const wx = v.x + (sx - w / 2) / v.scale, wy = v.y + (sy - h / 2) / v.scale;
    const g = grid.current;
    if (!g.cells.size) return null;

    const nodes = nodesRef.current;
    const pos = currentPos.current;
    const gx = Math.floor(wx / g.size), gy = Math.floor(wy / g.size);
    let bestDist = 15 / v.scale, bestIdx = -1;
    for (let ox = -2; ox <= 2; ox++) {
      for (let oy = -2; oy <= 2; oy++) {
        const cell = g.cells.get(`${gx + ox},${gy + oy}`);
        if (!cell) continue;
        for (const idx of cell) {
          const dx = pos[idx * 2] - wx, dy = pos[idx * 2 + 1] - wy;
          const d = Math.hypot(dx, dy);
          if (d < bestDist) { bestDist = d; bestIdx = idx; }
        }
      }
    }
    return bestIdx >= 0 ? nodes[bestIdx] : null;
  }, []);

  // ── Pointer handlers ──────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (contextMenu.visible) setContextMenu({ visible: false, x: 0, y: 0 });
    if (e.button !== 0) return;
    isDragging.current = true; setIsDraggingState(true);
    clickStart.current = { x: e.clientX, y: e.clientY };
    lastMouse.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [contextMenu.visible]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
    if (isDragging.current) {
      const dx = e.clientX - lastMouse.current.x, dy = e.clientY - lastMouse.current.y;
      view.current.x -= dx / view.current.scale;
      view.current.y -= dy / view.current.scale;
      targetView.current = { ...view.current };
      lastMouse.current = { x: e.clientX, y: e.clientY };
    } else {
      const node = hitTest(lx, ly);
      if (node !== hoveredNode) setHoveredNode(node);
      if (tooltipRef.current) {
        tooltipRef.current.style.transform = `translate(${lx + 12}px, ${ly + 12}px)`;
        tooltipRef.current.style.opacity = node ? "1" : "0";
      }
    }
  }, [hitTest, hoveredNode]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isDragging.current = false; setIsDraggingState(false);
    const moved = Math.hypot(e.clientX - clickStart.current.x, e.clientY - clickStart.current.y);
    if (moved < 5 && hoveredNode) {
      const familyId = hoveredNode.family.id;
      selectedFamilyRef.current = familyId;
      setSelectedFamily(familyId);
      onSelectFamily(familyId);
      zoomToFit(familyId);
    }
  }, [hoveredNode, onSelectFamily, zoomToFit]);

  const toggleIsolate = useCallback(() => {
    setIsolateMode((prev) => {
      isolateModeRef.current = !prev;
      return !prev;
    });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setContextMenu({ visible: true, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading graph…</span>
      </div>
    );
  }

  return (
    <div
      className={`w-full h-full relative select-none bg-[#F8F7F4] transition-opacity duration-500 ${isReady ? "opacity-100" : "opacity-0"}`}
    >
      <canvas
        ref={canvasRef}
        className={`w-full h-full block ${isDraggingState ? "cursor-grabbing" : hoveredNode ? "cursor-pointer" : "cursor-crosshair"}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          isDragging.current = false;
          setIsDraggingState(false);
          setHoveredNode(null);
          if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
        }}
        onContextMenu={handleContextMenu}
      />

      {/* Isolate toggle — only visible when a node is selected */}
      {selectedFamily && (
        <button
          onClick={toggleIsolate}
          className={`absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border shadow-sm transition-colors z-20 ${
            isolateMode
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-white/90 text-foreground border-border hover:bg-muted"
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isolateMode ? "bg-primary-foreground" : "bg-primary"}`} />
          {isolateMode ? "Exit Isolate" : "Isolate"}
        </button>
      )}

      {/* Context menu */}
      {contextMenu.visible && (
        <div
          className="absolute bg-white border border-border shadow-md rounded-lg p-[3px] z-[2000] min-w-[120px] animate-in zoom-in-95 duration-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { zoomToFit(selectedFamilyRef.current); setContextMenu({ visible: false, x: 0, y: 0 }); }}
            className="w-full px-2.5 py-[7px] bg-transparent text-foreground text-xs font-medium text-left cursor-pointer rounded-md hover:bg-muted transition-colors"
          >
            Zoom to Fit
          </button>
          <button
            onClick={() => { toggleIsolate(); setContextMenu({ visible: false, x: 0, y: 0 }); }}
            className="w-full px-2.5 py-[7px] bg-transparent text-foreground text-xs font-medium text-left cursor-pointer rounded-md hover:bg-muted transition-colors"
          >
            {isolateMode ? "Exit Isolate" : "Isolate Neighborhood"}
          </button>
        </div>
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute top-0 left-0 bg-white border border-border rounded-lg px-3 py-2 shadow-lg pointer-events-none z-30 opacity-0 transition-opacity duration-75 will-change-transform"
        style={{ transform: "translate(0,0)" }}
      >
        {hoveredNode && (
          <>
            <p className="text-xs font-semibold text-foreground leading-tight">
              {getFamilyDisplayName(
                hoveredNode.family.familyName,
                hoveredNode.family.nameOfFile
              )}
            </p>
            <p
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: getCategoryColor(hoveredNode.family.finalCategory) }}
            >
              {hoveredNode.family.finalCategory ?? ""}
            </p>
          </>
        )}
      </div>

      <p className="absolute bottom-2 right-3 text-[10px] text-muted-foreground opacity-40 pointer-events-none">
        scroll to zoom · drag to pan · right-click to reset
      </p>
    </div>
  );
}

export const LodGraphCanvas = memo(LodGraphCanvasInner);
