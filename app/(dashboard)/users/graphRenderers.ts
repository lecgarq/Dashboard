"use client";

const DIMMED_USER_COLOR = "#9CA3AF";

export interface GraphRenderNode {
  kind: "user";
  id: string;
  color: string;
  radius?: number;
}

export interface GraphRenderView {
  x: number;
  y: number;
  scale: number;
}

export interface GraphVisibleBounds {
  minWX: number;
  maxWX: number;
  minWY: number;
  maxWY: number;
}

export interface GraphRenderFrame {
  nodes: readonly GraphRenderNode[];
  positions: Float32Array;
  nodeIndexMap: ReadonlyMap<string, number>;
  userIndices?: Uint32Array;
  selectedNodeId: string | null;
  selectedNodeIndex: number;
  highlightSet: ReadonlySet<number>;
  filterActive: boolean;
  isInteracting: boolean;
  view: GraphRenderView;
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  backgroundColor: string;
}

export interface GraphDrawResult {
  needsContinuousRedraw: boolean;
}

export interface GraphRenderer {
  readonly backend: "canvas2d" | "webgpu";
  draw(frame: GraphRenderFrame): GraphDrawResult;
  destroy(): void;
}

function createCircleSprite(color: string, size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const diameter = size * 2;
  canvas.width = diameter;
  canvas.height = diameter;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(size, size, size, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function getUserIndices(nodes: readonly GraphRenderNode[], supplied: Uint32Array | undefined): Uint32Array {
  if (supplied) return supplied;
  return new Uint32Array(nodes.map((_, index) => index));
}

export function getVisibleWorldBounds(
  view: GraphRenderView,
  cssWidth: number,
  cssHeight: number,
  padWorld = 0,
): GraphVisibleBounds {
  return {
    minWX: view.x - (cssWidth / 2) / view.scale - padWorld,
    maxWX: view.x + (cssWidth / 2) / view.scale + padWorld,
    minWY: view.y - (cssHeight / 2) / view.scale - padWorld,
    maxWY: view.y + (cssHeight / 2) / view.scale + padWorld,
  };
}

export class CanvasGraphRenderer implements GraphRenderer {
  readonly backend = "canvas2d" as const;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly spriteCache = new Map<string, HTMLCanvasElement>();

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context is unavailable");
    }
    this.canvas = canvas;
    this.ctx = ctx;
  }

  draw(frame: GraphRenderFrame): GraphDrawResult {
    const dpr = Math.min(frame.devicePixelRatio || 1, 2);
    const wantWidth = Math.max(1, Math.floor(frame.cssWidth * dpr));
    const wantHeight = Math.max(1, Math.floor(frame.cssHeight * dpr));
    if (this.canvas.width !== wantWidth || this.canvas.height !== wantHeight) {
      this.canvas.width = wantWidth;
      this.canvas.height = wantHeight;
    }

    const ctx = this.ctx;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = frame.backgroundColor;
    ctx.fillRect(0, 0, frame.cssWidth, frame.cssHeight);

    if (!frame.nodes.length || !frame.positions.length) {
      return { needsContinuousRedraw: false };
    }

    const view = frame.view;
    ctx.translate(frame.cssWidth / 2, frame.cssHeight / 2);
    ctx.scale(view.scale, view.scale);
    ctx.translate(-view.x, -view.y);

    const bounds = getVisibleWorldBounds(view, frame.cssWidth, frame.cssHeight, 50 / view.scale);
    const hasSelection = frame.selectedNodeIndex >= 0 || frame.filterActive;
    const dimBatches = new Map<string, [number, number][]>();
    const brightBatches = new Map<string, [number, number][]>();
    const userIndices = getUserIndices(frame.nodes, frame.userIndices);

    for (let offset = 0; offset < userIndices.length; offset++) {
      const index = userIndices[offset];
      const node = frame.nodes[index];
      const nx = frame.positions[index * 2];
      const ny = frame.positions[index * 2 + 1];
      if (nx < bounds.minWX || nx > bounds.maxWX || ny < bounds.minWY || ny > bounds.maxWY) continue;
      if (node.id === frame.selectedNodeId) continue;

      const target = hasSelection && !frame.highlightSet.has(index) ? dimBatches : brightBatches;
      const list = target.get(node.color) ?? [];
      list.push([nx, ny]);
      target.set(node.color, list);
    }

    const normalRadius = 3 / view.scale;
    const brightRadius = 4.5 / view.scale;
    if (hasSelection) {
      ctx.globalAlpha = 0.10;
      const dimSprite = this.getSprite(DIMMED_USER_COLOR);
      const diameter = normalRadius * 2;
      for (const coords of dimBatches.values()) {
        for (const [nx, ny] of coords) {
          ctx.drawImage(dimSprite, nx - normalRadius, ny - normalRadius, diameter, diameter);
        }
      }
    }

    ctx.globalAlpha = hasSelection ? 1 : 0.78;
    const userRadius = hasSelection ? brightRadius : normalRadius;
    const userDiameter = userRadius * 2;
    for (const [color, coords] of brightBatches) {
      const sprite = this.getSprite(color);
      for (const [nx, ny] of coords) {
        ctx.drawImage(sprite, nx - userRadius, ny - userRadius, userDiameter, userDiameter);
      }
    }

    if (frame.selectedNodeIndex >= 0) {
      const sx = frame.positions[frame.selectedNodeIndex * 2];
      const sy = frame.positions[frame.selectedNodeIndex * 2 + 1];
      const color = frame.nodes[frame.selectedNodeIndex].color;
      const selectedRadius = 9 / view.scale;

      ctx.globalAlpha = 0.2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, selectedRadius * 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 2 / view.scale;
      ctx.beginPath();
      ctx.arc(sx, sy, selectedRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, selectedRadius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    return { needsContinuousRedraw: false };
  }

  destroy(): void {
    this.spriteCache.clear();
  }

  private getSprite(color: string): HTMLCanvasElement {
    const cached = this.spriteCache.get(color);
    if (cached) return cached;
    const sprite = createCircleSprite(color, 8);
    this.spriteCache.set(color, sprite);
    return sprite;
  }
}

export class WebGpuGraphRenderer implements GraphRenderer {
  readonly backend = "webgpu" as const;

  static async create(
    _canvas?: HTMLCanvasElement,
    _onDeviceLost?: (reason: string) => void,
  ): Promise<{ renderer: WebGpuGraphRenderer | null; failureReason?: string }> {
    return { renderer: null, failureReason: "WebGPU is disabled for the user-only organic ACC graph renderer" };
  }

  draw(_frame: GraphRenderFrame): GraphDrawResult {
    return { needsContinuousRedraw: false };
  }

  destroy(): void {}
}
