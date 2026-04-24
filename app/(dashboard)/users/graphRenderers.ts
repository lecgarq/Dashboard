"use client";

const EDGE_ALPHA = 0.10;
const DIMMED_USER_COLOR = "#9CA3AF";

const SHAPE_CIRCLE = 0;
const SHAPE_DIAMOND = 1;
const SHAPE_SQUARE = 2;
const SHAPE_RING = 3;

const EDGE_TARGET_ROLE = 1;
const EDGE_TARGET_MODULE = 2;

const LINE_VERTEX_FLOATS = 6;
const SHAPE_INSTANCE_FLOATS = 9;

const EMPTY_INDICES = new Uint32Array(0);

type GraphNodeKind = "user" | "role" | "module";

export interface GraphRenderNode {
  kind: GraphNodeKind;
  id: string;
  color: string;
  radius?: number;
}

export interface GraphRenderEdge {
  source: string;
  target: string;
  color: string;
}

export interface GraphRenderParticle {
  si: number;
  ti: number;
  t: number;
  speed: number;
  color: string;
  isRole: boolean;
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
  edges: readonly GraphRenderEdge[];
  particles: readonly GraphRenderParticle[];
  nodeIndexMap: ReadonlyMap<string, number>;
  edgeGroupsRole?: ReadonlyMap<string, Uint32Array>;
  edgeGroupsModule?: ReadonlyMap<string, Uint32Array>;
  userIndices?: Uint32Array;
  roleIndices?: Uint32Array;
  moduleIndices?: Uint32Array;
  selectedNodeId: string | null;
  selectedNodeIndex: number;
  highlightSet: ReadonlySet<number>;
  showRoles: boolean;
  showModules: boolean;
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

interface PackedGraphScene {
  nodesRef: readonly GraphRenderNode[];
  positionsRef: Float32Array;
  edgesRef: readonly GraphRenderEdge[];
  particlesRef: readonly GraphRenderParticle[];
  nodePositions: Float32Array;
  nodeKinds: Uint8Array;
  nodeRadii: Float32Array;
  nodeColors: Float32Array;
  edgeEndpoints: Uint32Array;
  edgeColors: Float32Array;
  particleData: Float32Array;
}

const rgbCache = new Map<string, [number, number, number]>();

function hexToRgb01(color: string): [number, number, number] {
  const cached = rgbCache.get(color);
  if (cached) return cached;

  const hex = color.replace("#", "");
  const normalized = hex.length === 3
    ? hex.split("").map((ch) => ch + ch).join("")
    : hex;

  const value = Number.parseInt(normalized, 16);
  const rgb: [number, number, number] = [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
  rgbCache.set(color, rgb);
  return rgb;
}

function ensureIndicesByKind(
  nodes: readonly GraphRenderNode[],
  supplied: Uint32Array | undefined,
  kind: GraphNodeKind,
): Uint32Array {
  if (supplied) return supplied;
  const indices: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].kind === kind) indices.push(i);
  }
  return new Uint32Array(indices);
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
    const hasSelection = frame.selectedNodeIndex >= 0;

    ctx.lineWidth = 0.5 / view.scale;
    if (!frame.isInteracting) {
      if (hasSelection) {
        ctx.globalAlpha = 0.55;
        for (const edge of frame.edges) {
          if (edge.source !== frame.selectedNodeId && edge.target !== frame.selectedNodeId) continue;
          if (!frame.showRoles && edge.target.startsWith("role:")) continue;
          if (!frame.showModules && edge.target.startsWith("module:")) continue;
          const sourceIndex = frame.nodeIndexMap.get(edge.source) ?? -1;
          const targetIndex = frame.nodeIndexMap.get(edge.target) ?? -1;
          if (sourceIndex < 0 || targetIndex < 0) continue;
          ctx.strokeStyle = edge.color;
          ctx.beginPath();
          ctx.moveTo(frame.positions[sourceIndex * 2], frame.positions[sourceIndex * 2 + 1]);
          ctx.lineTo(frame.positions[targetIndex * 2], frame.positions[targetIndex * 2 + 1]);
          ctx.stroke();
        }
      } else {
        ctx.globalAlpha = EDGE_ALPHA;
        const drawEdges = (groups?: ReadonlyMap<string, Uint32Array>) => {
          if (!groups) return;
          for (const [color, indices] of groups) {
            ctx.strokeStyle = color;
            ctx.beginPath();
            for (let i = 0; i < indices.length; i += 2) {
              const sourceIndex = indices[i];
              const targetIndex = indices[i + 1];
              const sx = frame.positions[sourceIndex * 2];
              const sy = frame.positions[sourceIndex * 2 + 1];
              const tx = frame.positions[targetIndex * 2];
              const ty = frame.positions[targetIndex * 2 + 1];
              if (sx < bounds.minWX && tx < bounds.minWX) continue;
              if (sx > bounds.maxWX && tx > bounds.maxWX) continue;
              if (sy < bounds.minWY && ty < bounds.minWY) continue;
              if (sy > bounds.maxWY && ty > bounds.maxWY) continue;
              ctx.moveTo(sx, sy);
              ctx.lineTo(tx, ty);
            }
            ctx.stroke();
          }
        };

        if (frame.showRoles) drawEdges(frame.edgeGroupsRole);
        if (frame.showModules) drawEdges(frame.edgeGroupsModule);
      }
      ctx.globalAlpha = 1;

      if (frame.particles.length > 0) {
        ctx.globalAlpha = 0.6;
        const particleRadius = 1.5 / view.scale;
        for (const particle of frame.particles) {
          if (particle.isRole && !frame.showRoles) continue;
          if (!particle.isRole && !frame.showModules) continue;

          particle.t += particle.speed;
          if (particle.t > 1) particle.t -= 1;

          const sx = frame.positions[particle.si * 2];
          const sy = frame.positions[particle.si * 2 + 1];
          const tx = frame.positions[particle.ti * 2];
          const ty = frame.positions[particle.ti * 2 + 1];

          if (sx < bounds.minWX && tx < bounds.minWX) continue;
          if (sx > bounds.maxWX && tx > bounds.maxWX) continue;
          if (sy < bounds.minWY && ty < bounds.minWY) continue;
          if (sy > bounds.maxWY && ty > bounds.maxWY) continue;

          const px = sx + (tx - sx) * particle.t;
          const py = sy + (ty - sy) * particle.t;
          ctx.fillStyle = particle.color;
          ctx.beginPath();
          ctx.arc(px, py, particleRadius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    const dimBatches = new Map<string, [number, number][]>();
    const brightBatches = new Map<string, [number, number][]>();
    const userIndices = ensureIndicesByKind(frame.nodes, frame.userIndices, "user");
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

    if (frame.showRoles) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const roleIndices = ensureIndicesByKind(frame.nodes, frame.roleIndices, "role");
      for (let offset = 0; offset < roleIndices.length; offset++) {
        const index = roleIndices[offset];
        const node = frame.nodes[index];
        const nx = frame.positions[index * 2];
        const ny = frame.positions[index * 2 + 1];
        if (nx < bounds.minWX || nx > bounds.maxWX || ny < bounds.minWY || ny > bounds.maxWY) continue;
        const radius = Math.max(1, (node.radius ?? 9) / view.scale);
        ctx.globalAlpha = hasSelection && !frame.highlightSet.has(index) ? 0.08 : 0.9;
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.moveTo(nx, ny - radius);
        ctx.lineTo(nx + radius, ny);
        ctx.lineTo(nx, ny + radius);
        ctx.lineTo(nx - radius, ny);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (frame.showModules) {
      const moduleIndices = ensureIndicesByKind(frame.nodes, frame.moduleIndices, "module");
      for (let offset = 0; offset < moduleIndices.length; offset++) {
        const index = moduleIndices[offset];
        const node = frame.nodes[index];
        const nx = frame.positions[index * 2];
        const ny = frame.positions[index * 2 + 1];
        if (nx < bounds.minWX || nx > bounds.maxWX || ny < bounds.minWY || ny > bounds.maxWY) continue;
        const radius = 7 / view.scale;
        ctx.globalAlpha = hasSelection && !frame.highlightSet.has(index) ? 0.07 : 0.85;
        ctx.fillStyle = node.color;
        ctx.fillRect(nx - radius, ny - radius, radius * 2, radius * 2);
      }
    }

    if (hasSelection) {
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
    return {
      needsContinuousRedraw: !frame.isInteracting && frame.particles.length > 0,
    };
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

  private readonly canvas: HTMLCanvasElement;
  private readonly context: any;
  private readonly device: any;
  private readonly format: string;
  private readonly onDeviceLost?: (reason: string) => void;
  private readonly gpuBufferUsage = (globalThis as any).GPUBufferUsage;
  private readonly gpuTextureUsage = (globalThis as any).GPUTextureUsage;
  private readonly bindGroup: any;
  private readonly uniformBuffer: any;
  private readonly quadVertexBuffer: any;
  private readonly linePipeline: any;
  private readonly shapePipeline: any;

  private scene: PackedGraphScene | null = null;
  private edgeBuffer: any = null;
  private edgeCapacity = 0;
  private particleBuffer: any = null;
  private particleCapacity = 0;
  private shapeBuffer: any = null;
  private shapeCapacity = 0;
  private overlayBuffer: any = null;
  private overlayCapacity = 0;
  private configuredWidth = 0;
  private configuredHeight = 0;
  private lost = false;

  private constructor(
    canvas: HTMLCanvasElement,
    context: any,
    device: any,
    format: string,
    onDeviceLost?: (reason: string) => void,
  ) {
    this.canvas = canvas;
    this.context = context;
    this.device = device;
    this.format = format;
    this.onDeviceLost = onDeviceLost;

    const shaderStage = (globalThis as any).GPUShaderStage;
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: shaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });
    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    this.uniformBuffer = this.device.createBuffer({
      size: 32,
      usage: this.gpuBufferUsage.UNIFORM | this.gpuBufferUsage.COPY_DST,
    });
    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.uniformBuffer },
        },
      ],
    });

    this.quadVertexBuffer = this.device.createBuffer({
      size: 32,
      usage: this.gpuBufferUsage.VERTEX | this.gpuBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(
      this.quadVertexBuffer,
      0,
      new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1,
      ]),
    );

    const blend = {
      color: {
        srcFactor: "src-alpha",
        dstFactor: "one-minus-src-alpha",
        operation: "add",
      },
      alpha: {
        srcFactor: "one",
        dstFactor: "one-minus-src-alpha",
        operation: "add",
      },
    };

    this.linePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: this.device.createShaderModule({ code: LINE_SHADER }),
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: LINE_VERTEX_FLOATS * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x4" },
            ],
          },
        ],
      },
      fragment: {
        module: this.device.createShaderModule({ code: LINE_SHADER }),
        entryPoint: "fs_main",
        targets: [
          {
            format: this.format,
            blend,
          },
        ],
      },
      primitive: {
        topology: "line-list",
      },
    });

    this.shapePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: this.device.createShaderModule({ code: SHAPE_SHADER }),
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: 8,
            stepMode: "vertex",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
            ],
          },
          {
            arrayStride: SHAPE_INSTANCE_FLOATS * 4,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 1, offset: 0, format: "float32x2" },
              { shaderLocation: 2, offset: 8, format: "float32x3" },
              { shaderLocation: 3, offset: 20, format: "float32x4" },
            ],
          },
        ],
      },
      fragment: {
        module: this.device.createShaderModule({ code: SHAPE_SHADER }),
        entryPoint: "fs_main",
        targets: [
          {
            format: this.format,
            blend,
          },
        ],
      },
      primitive: {
        topology: "triangle-strip",
      },
    });

    this.device.lost.then((info: { message?: string; reason?: string }) => {
      if (this.lost) return;
      this.lost = true;
      const reason = info?.message
        ? `WebGPU device lost: ${info.message}`
        : `WebGPU device lost (${info?.reason ?? "unknown"})`;
      this.onDeviceLost?.(reason);
    });
  }

  static async create(
    canvas: HTMLCanvasElement,
    onDeviceLost?: (reason: string) => void,
  ): Promise<{ renderer: WebGpuGraphRenderer | null; failureReason?: string }> {
    if (typeof window === "undefined") {
      return { renderer: null, failureReason: "WebGPU requires a browser environment" };
    }

    if (!window.isSecureContext) {
      return { renderer: null, failureReason: "WebGPU requires a secure context" };
    }

    const gpu = (navigator as Navigator & { gpu?: any }).gpu;
    if (!gpu) {
      return { renderer: null, failureReason: "navigator.gpu is unavailable" };
    }

    if (!(globalThis as any).GPUBufferUsage || !(globalThis as any).GPUTextureUsage) {
      return { renderer: null, failureReason: "WebGPU usage flags are unavailable" };
    }

    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return { renderer: null, failureReason: "No WebGPU adapter was available" };
    }

    let device: any;
    try {
      device = await adapter.requestDevice();
    } catch (error) {
      return {
        renderer: null,
        failureReason: error instanceof Error ? error.message : "Failed to create a WebGPU device",
      };
    }

    const context = (canvas as any).getContext("webgpu");
    if (!context) {
      return { renderer: null, failureReason: "canvas.getContext('webgpu') returned null" };
    }

    const format = typeof gpu.getPreferredCanvasFormat === "function"
      ? gpu.getPreferredCanvasFormat()
      : "bgra8unorm";

    try {
      return { renderer: new WebGpuGraphRenderer(canvas, context, device, format, onDeviceLost) };
    } catch (error) {
      return {
        renderer: null,
        failureReason: error instanceof Error ? error.message : "Failed to initialize the WebGPU renderer",
      };
    }
  }

  draw(frame: GraphRenderFrame): GraphDrawResult {
    if (this.lost) {
      return { needsContinuousRedraw: false };
    }

    this.configureCanvas(frame.cssWidth, frame.cssHeight, Math.min(frame.devicePixelRatio || 1, 2));
    this.syncScene(frame);
    if (!this.scene) {
      return { needsContinuousRedraw: false };
    }

    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      new Float32Array([
        frame.view.x,
        frame.view.y,
        frame.view.scale,
        0,
        frame.cssWidth,
        frame.cssHeight,
        0,
        0,
      ]),
    );

    const edgeVertices = this.buildEdgeVertices(frame, this.scene);
    const particleInstances = this.buildParticleInstances(frame, this.scene);
    const shapeInstances = this.buildShapeInstances(frame, this.scene);
    const overlayInstances = this.buildOverlayInstances(frame, this.scene);

    if (edgeVertices.length > 0) {
      this.edgeBuffer = this.ensureBuffer(
        this.edgeBuffer,
        edgeVertices.byteLength,
        this.gpuBufferUsage.VERTEX | this.gpuBufferUsage.COPY_DST,
        (capacity) => { this.edgeCapacity = capacity; },
        this.edgeCapacity,
      );
      this.device.queue.writeBuffer(this.edgeBuffer, 0, edgeVertices);
    }

    if (particleInstances.length > 0) {
      this.particleBuffer = this.ensureBuffer(
        this.particleBuffer,
        particleInstances.byteLength,
        this.gpuBufferUsage.VERTEX | this.gpuBufferUsage.COPY_DST,
        (capacity) => { this.particleCapacity = capacity; },
        this.particleCapacity,
      );
      this.device.queue.writeBuffer(this.particleBuffer, 0, particleInstances);
    }

    if (shapeInstances.length > 0) {
      this.shapeBuffer = this.ensureBuffer(
        this.shapeBuffer,
        shapeInstances.byteLength,
        this.gpuBufferUsage.VERTEX | this.gpuBufferUsage.COPY_DST,
        (capacity) => { this.shapeCapacity = capacity; },
        this.shapeCapacity,
      );
      this.device.queue.writeBuffer(this.shapeBuffer, 0, shapeInstances);
    }

    if (overlayInstances.length > 0) {
      this.overlayBuffer = this.ensureBuffer(
        this.overlayBuffer,
        overlayInstances.byteLength,
        this.gpuBufferUsage.VERTEX | this.gpuBufferUsage.COPY_DST,
        (capacity) => { this.overlayCapacity = capacity; },
        this.overlayCapacity,
      );
      this.device.queue.writeBuffer(this.overlayBuffer, 0, overlayInstances);
    }

    const clearRgb = hexToRgb01(frame.backgroundColor);

    try {
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.context.getCurrentTexture().createView(),
            clearValue: { r: clearRgb[0], g: clearRgb[1], b: clearRgb[2], a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });

      pass.setBindGroup(0, this.bindGroup);

      if (edgeVertices.length > 0 && this.edgeBuffer) {
        pass.setPipeline(this.linePipeline);
        pass.setVertexBuffer(0, this.edgeBuffer);
        pass.draw(edgeVertices.length / LINE_VERTEX_FLOATS);
      }

      pass.setPipeline(this.shapePipeline);
      pass.setVertexBuffer(0, this.quadVertexBuffer);

      if (particleInstances.length > 0 && this.particleBuffer) {
        pass.setVertexBuffer(1, this.particleBuffer);
        pass.draw(4, particleInstances.length / SHAPE_INSTANCE_FLOATS);
      }

      if (shapeInstances.length > 0 && this.shapeBuffer) {
        pass.setVertexBuffer(1, this.shapeBuffer);
        pass.draw(4, shapeInstances.length / SHAPE_INSTANCE_FLOATS);
      }

      if (overlayInstances.length > 0 && this.overlayBuffer) {
        pass.setVertexBuffer(1, this.overlayBuffer);
        pass.draw(4, overlayInstances.length / SHAPE_INSTANCE_FLOATS);
      }

      pass.end();
      this.device.queue.submit([encoder.finish()]);
    } catch {
      return { needsContinuousRedraw: false };
    }

    return {
      needsContinuousRedraw: !frame.isInteracting && frame.particles.length > 0,
    };
  }

  destroy(): void {
    this.edgeBuffer?.destroy?.();
    this.particleBuffer?.destroy?.();
    this.shapeBuffer?.destroy?.();
    this.overlayBuffer?.destroy?.();
    this.uniformBuffer?.destroy?.();
    this.quadVertexBuffer?.destroy?.();
  }

  private configureCanvas(cssWidth: number, cssHeight: number, dpr: number): void {
    const nextWidth = Math.max(1, Math.floor(cssWidth * dpr));
    const nextHeight = Math.max(1, Math.floor(cssHeight * dpr));
    if (this.configuredWidth === nextWidth && this.configuredHeight === nextHeight) return;

    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
      usage: this.gpuTextureUsage.RENDER_ATTACHMENT,
    });

    this.configuredWidth = nextWidth;
    this.configuredHeight = nextHeight;
  }

  private syncScene(frame: GraphRenderFrame): void {
    if (
      this.scene &&
      this.scene.nodesRef === frame.nodes &&
      this.scene.positionsRef === frame.positions &&
      this.scene.edgesRef === frame.edges &&
      this.scene.particlesRef === frame.particles
    ) {
      return;
    }

    const nodePositions = new Float32Array(frame.positions);
    const nodeKinds = new Uint8Array(frame.nodes.length);
    const nodeRadii = new Float32Array(frame.nodes.length);
    const nodeColors = new Float32Array(frame.nodes.length * 3);
    for (let i = 0; i < frame.nodes.length; i++) {
      const node = frame.nodes[i];
      nodeKinds[i] = node.kind === "user" ? 0 : node.kind === "role" ? 1 : 2;
      nodeRadii[i] = node.kind === "role" ? node.radius ?? 9 : 0;
      const [r, g, b] = hexToRgb01(node.color);
      nodeColors[i * 3] = r;
      nodeColors[i * 3 + 1] = g;
      nodeColors[i * 3 + 2] = b;
    }

    const edgeEndpoints = new Uint32Array(frame.edges.length * 3);
    const edgeColors = new Float32Array(frame.edges.length * 3);
    for (let i = 0; i < frame.edges.length; i++) {
      const edge = frame.edges[i];
      edgeEndpoints[i * 3] = frame.nodeIndexMap.get(edge.source) ?? 0;
      edgeEndpoints[i * 3 + 1] = frame.nodeIndexMap.get(edge.target) ?? 0;
      edgeEndpoints[i * 3 + 2] = edge.target.startsWith("role:") ? EDGE_TARGET_ROLE : EDGE_TARGET_MODULE;
      const [r, g, b] = hexToRgb01(edge.color);
      edgeColors[i * 3] = r;
      edgeColors[i * 3 + 1] = g;
      edgeColors[i * 3 + 2] = b;
    }

    const particleData = new Float32Array(frame.particles.length * 8);
    for (let i = 0; i < frame.particles.length; i++) {
      const particle = frame.particles[i];
      const [r, g, b] = hexToRgb01(particle.color);
      particleData[i * 8] = particle.si;
      particleData[i * 8 + 1] = particle.ti;
      particleData[i * 8 + 2] = particle.t;
      particleData[i * 8 + 3] = particle.speed;
      particleData[i * 8 + 4] = r;
      particleData[i * 8 + 5] = g;
      particleData[i * 8 + 6] = b;
      particleData[i * 8 + 7] = particle.isRole ? 1 : 0;
    }

    this.scene = {
      nodesRef: frame.nodes,
      positionsRef: frame.positions,
      edgesRef: frame.edges,
      particlesRef: frame.particles,
      nodePositions,
      nodeKinds,
      nodeRadii,
      nodeColors,
      edgeEndpoints,
      edgeColors,
      particleData,
    };
  }

  private buildEdgeVertices(frame: GraphRenderFrame, scene: PackedGraphScene): Float32Array {
    if (frame.isInteracting) return new Float32Array(0);

    const hasSelection = frame.selectedNodeIndex >= 0;
    const maxFloats = frame.edges.length * 2 * LINE_VERTEX_FLOATS;
    const out = new Float32Array(maxFloats);
    let cursor = 0;

    for (let i = 0; i < frame.edges.length; i++) {
      const sourceIndex = scene.edgeEndpoints[i * 3];
      const targetIndex = scene.edgeEndpoints[i * 3 + 1];
      const targetKind = scene.edgeEndpoints[i * 3 + 2];
      const isRole = targetKind === EDGE_TARGET_ROLE;
      if (isRole && !frame.showRoles) continue;
      if (!isRole && !frame.showModules) continue;
      if (hasSelection && sourceIndex !== frame.selectedNodeIndex && targetIndex !== frame.selectedNodeIndex) continue;

      const alpha = hasSelection ? 0.55 : EDGE_ALPHA;
      cursor = this.pushLineVertex(
        out,
        cursor,
        scene.nodePositions[sourceIndex * 2],
        scene.nodePositions[sourceIndex * 2 + 1],
        scene.edgeColors[i * 3],
        scene.edgeColors[i * 3 + 1],
        scene.edgeColors[i * 3 + 2],
        alpha,
      );
      cursor = this.pushLineVertex(
        out,
        cursor,
        scene.nodePositions[targetIndex * 2],
        scene.nodePositions[targetIndex * 2 + 1],
        scene.edgeColors[i * 3],
        scene.edgeColors[i * 3 + 1],
        scene.edgeColors[i * 3 + 2],
        alpha,
      );
    }

    return out.subarray(0, cursor);
  }

  private buildParticleInstances(frame: GraphRenderFrame, scene: PackedGraphScene): Float32Array {
    if (frame.isInteracting || frame.particles.length === 0) return new Float32Array(0);

    const out = new Float32Array(frame.particles.length * SHAPE_INSTANCE_FLOATS);
    let cursor = 0;
    for (let i = 0; i < frame.particles.length; i++) {
      const sourceIndex = scene.particleData[i * 8];
      const targetIndex = scene.particleData[i * 8 + 1];
      const isRole = scene.particleData[i * 8 + 7] === 1;
      if (isRole && !frame.showRoles) continue;
      if (!isRole && !frame.showModules) continue;

      const particle = frame.particles[i];
      particle.t += particle.speed;
      if (particle.t > 1) particle.t -= 1;

      const sx = scene.nodePositions[sourceIndex * 2];
      const sy = scene.nodePositions[sourceIndex * 2 + 1];
      const tx = scene.nodePositions[targetIndex * 2];
      const ty = scene.nodePositions[targetIndex * 2 + 1];
      const px = sx + (tx - sx) * particle.t;
      const py = sy + (ty - sy) * particle.t;

      cursor = this.pushShapeInstance(
        out,
        cursor,
        px,
        py,
        1.5,
        SHAPE_CIRCLE,
        0,
        scene.particleData[i * 8 + 4],
        scene.particleData[i * 8 + 5],
        scene.particleData[i * 8 + 6],
        0.6,
      );
    }

    return out.subarray(0, cursor);
  }

  private buildShapeInstances(frame: GraphRenderFrame, scene: PackedGraphScene): Float32Array {
    const out = new Float32Array(frame.nodes.length * SHAPE_INSTANCE_FLOATS);
    const dimmedUserRgb = hexToRgb01(DIMMED_USER_COLOR);
    const hasSelection = frame.selectedNodeIndex >= 0;
    let cursor = 0;

    const userIndices = ensureIndicesByKind(frame.nodes, frame.userIndices, "user");
    for (let offset = 0; offset < userIndices.length; offset++) {
      const index = userIndices[offset];
      if (index === frame.selectedNodeIndex) continue;
      const isDimmed = hasSelection && !frame.highlightSet.has(index);
      const rgb = isDimmed
        ? dimmedUserRgb
        : [
            scene.nodeColors[index * 3],
            scene.nodeColors[index * 3 + 1],
            scene.nodeColors[index * 3 + 2],
          ] as const;
      cursor = this.pushShapeInstance(
        out,
        cursor,
        scene.nodePositions[index * 2],
        scene.nodePositions[index * 2 + 1],
        hasSelection ? 4.5 : 3,
        SHAPE_CIRCLE,
        0,
        rgb[0],
        rgb[1],
        rgb[2],
        isDimmed ? 0.10 : hasSelection ? 1 : 0.78,
      );
    }

    if (frame.showRoles) {
      const roleIndices = ensureIndicesByKind(frame.nodes, frame.roleIndices, "role");
      for (let offset = 0; offset < roleIndices.length; offset++) {
        const index = roleIndices[offset];
        cursor = this.pushShapeInstance(
          out,
          cursor,
          scene.nodePositions[index * 2],
          scene.nodePositions[index * 2 + 1],
          Math.max(1, scene.nodeRadii[index]),
          SHAPE_DIAMOND,
          0,
          scene.nodeColors[index * 3],
          scene.nodeColors[index * 3 + 1],
          scene.nodeColors[index * 3 + 2],
          hasSelection && !frame.highlightSet.has(index) ? 0.08 : 0.9,
        );
      }
    }

    if (frame.showModules) {
      const moduleIndices = ensureIndicesByKind(frame.nodes, frame.moduleIndices, "module");
      for (let offset = 0; offset < moduleIndices.length; offset++) {
        const index = moduleIndices[offset];
        cursor = this.pushShapeInstance(
          out,
          cursor,
          scene.nodePositions[index * 2],
          scene.nodePositions[index * 2 + 1],
          7,
          SHAPE_SQUARE,
          0,
          scene.nodeColors[index * 3],
          scene.nodeColors[index * 3 + 1],
          scene.nodeColors[index * 3 + 2],
          hasSelection && !frame.highlightSet.has(index) ? 0.07 : 0.85,
        );
      }
    }

    return out.subarray(0, cursor);
  }

  private buildOverlayInstances(frame: GraphRenderFrame, scene: PackedGraphScene): Float32Array {
    if (frame.selectedNodeIndex < 0) return new Float32Array(0);

    const out = new Float32Array(SHAPE_INSTANCE_FLOATS * 3);
    const index = frame.selectedNodeIndex;
    const x = scene.nodePositions[index * 2];
    const y = scene.nodePositions[index * 2 + 1];
    const r = scene.nodeColors[index * 3];
    const g = scene.nodeColors[index * 3 + 1];
    const b = scene.nodeColors[index * 3 + 2];
    const ringColor = hexToRgb01("#222222");

    let cursor = 0;
    cursor = this.pushShapeInstance(out, cursor, x, y, 16.2, SHAPE_CIRCLE, 0, r, g, b, 0.2);
    cursor = this.pushShapeInstance(out, cursor, x, y, 9, SHAPE_RING, 0.78, ringColor[0], ringColor[1], ringColor[2], 1);
    cursor = this.pushShapeInstance(out, cursor, x, y, 4.5, SHAPE_CIRCLE, 0, r, g, b, 1);
    return out.subarray(0, cursor);
  }

  private pushLineVertex(
    target: Float32Array,
    cursor: number,
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ): number {
    target[cursor] = x;
    target[cursor + 1] = y;
    target[cursor + 2] = r;
    target[cursor + 3] = g;
    target[cursor + 4] = b;
    target[cursor + 5] = a;
    return cursor + LINE_VERTEX_FLOATS;
  }

  private pushShapeInstance(
    target: Float32Array,
    cursor: number,
    x: number,
    y: number,
    size: number,
    shape: number,
    inner: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ): number {
    target[cursor] = x;
    target[cursor + 1] = y;
    target[cursor + 2] = size;
    target[cursor + 3] = shape;
    target[cursor + 4] = inner;
    target[cursor + 5] = r;
    target[cursor + 6] = g;
    target[cursor + 7] = b;
    target[cursor + 8] = a;
    return cursor + SHAPE_INSTANCE_FLOATS;
  }

  private ensureBuffer(
    buffer: any,
    requiredBytes: number,
    usage: number,
    setCapacity: (capacity: number) => void,
    currentCapacity: number,
  ): any {
    if (buffer && currentCapacity >= requiredBytes) return buffer;
    buffer?.destroy?.();
    const capacity = Math.max(256, this.roundUpTo4(Math.ceil(requiredBytes * 1.25)));
    setCapacity(capacity);
    return this.device.createBuffer({
      size: capacity,
      usage,
    });
  }

  private roundUpTo4(value: number): number {
    return Math.ceil(value / 4) * 4;
  }
}

const LINE_SHADER = `
struct ViewUniforms {
  center: vec2f,
  scale: f32,
  _pad0: f32,
  canvasSize: vec2f,
  _pad1: vec2f,
};

@group(0) @binding(0)
var<uniform> view: ViewUniforms;

struct VertexInput {
  @location(0) position: vec2f,
  @location(1) color: vec4f,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

fn world_to_clip(world: vec2f) -> vec2f {
  return vec2f(
    ((world.x - view.center.x) * view.scale) / (view.canvasSize.x * 0.5),
    -((world.y - view.center.y) * view.scale) / (view.canvasSize.y * 0.5)
  );
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4f(world_to_clip(input.position), 0.0, 1.0);
  output.color = input.color;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  return input.color;
}
`;

const SHAPE_SHADER = `
struct ViewUniforms {
  center: vec2f,
  scale: f32,
  _pad0: f32,
  canvasSize: vec2f,
  _pad1: vec2f,
};

@group(0) @binding(0)
var<uniform> view: ViewUniforms;

struct VertexInput {
  @location(0) corner: vec2f,
  @location(1) center: vec2f,
  @location(2) params: vec3f,
  @location(3) color: vec4f,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) shape: f32,
  @location(2) inner: f32,
  @location(3) color: vec4f,
};

fn world_to_clip(world: vec2f) -> vec2f {
  return vec2f(
    ((world.x - view.center.x) * view.scale) / (view.canvasSize.x * 0.5),
    -((world.y - view.center.y) * view.scale) / (view.canvasSize.y * 0.5)
  );
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let offset = vec2f(
    (input.corner.x * input.params.x * 2.0) / view.canvasSize.x,
    (-input.corner.y * input.params.x * 2.0) / view.canvasSize.y
  );
  output.position = vec4f(world_to_clip(input.center) + offset, 0.0, 1.0);
  output.local = input.corner;
  output.shape = input.params.y;
  output.inner = input.params.z;
  output.color = input.color;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let shape = i32(round(input.shape));
  let dist = length(input.local);
  if (shape == 0 && dist > 1.0) {
    discard;
  }
  if (shape == 1 && abs(input.local.x) + abs(input.local.y) > 1.0) {
    discard;
  }
  if (shape == 3 && (dist > 1.0 || dist < input.inner)) {
    discard;
  }
  return input.color;
}
`;
