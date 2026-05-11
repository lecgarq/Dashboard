"use client";

import type * as ThreeModule from "three";
import { buildPositions3d } from "./accGraph3d";
import type { GraphDrawResult, GraphRenderFrame, GraphRenderer } from "./graphRenderers";

type ThreeNamespace = typeof ThreeModule;
type OrbitControlsCtor = new (
  object: ThreeModule.PerspectiveCamera,
  domElement: HTMLElement,
) => ThreeModule.EventDispatcher & {
  enableDamping: boolean;
  dampingFactor: number;
  minDistance: number;
  maxDistance: number;
  target: ThreeModule.Vector3;
  update: () => boolean;
  dispose: () => void;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

const NODE_XY_SCALE = 12;
const NODE_Z_SCALE = 7;
const FIT_PADDING = 1.25;

export class ThreeGraphRenderer implements GraphRenderer {
  readonly backend = "three3d" as const;

  onNodeSelectCallback: ((index: number | null) => void) | null = null;
  onNodeHoverCallback: ((index: number | null, event?: MouseEvent) => void) | null = null;
  onCameraMoveCallback: ((moving: boolean) => void) | null = null;

  private readonly THREE: ThreeNamespace;
  private readonly container: HTMLElement;
  private readonly renderer: ThreeModule.WebGLRenderer;
  private readonly scene: ThreeModule.Scene;
  private readonly camera: ThreeModule.PerspectiveCamera;
  private readonly controls: InstanceType<OrbitControlsCtor>;
  private readonly raycaster: ThreeModule.Raycaster;
  private readonly pointer: ThreeModule.Vector2;
  private readonly nodeMatrix: ThreeModule.Matrix4;
  private readonly nodeColor: ThreeModule.Color;
  private readonly dimColor: ThreeModule.Color;

  private nodeMesh: ThreeModule.InstancedMesh | null = null;
  private edgeLines: ThreeModule.LineSegments | null = null;
  private positions3d: Float32Array = new Float32Array(0);
  private lastSourcePositions: Float32Array | null = null;
  private lastPositionNodeCount = -1;
  private visibleNodeIndices: Uint32Array = new Uint32Array(0);
  private nodeToInstance = new Map<number, number>();
  private lastNodeCount = -1;
  private lastVisibleKey = "";
  private lastLinkKey = "";
  private selectedIndex = -1;
  private hoveredIndex: number | null = null;
  private cameraMoving = false;
  private cameraSettledTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private constructor(
    container: HTMLElement,
    THREE: ThreeNamespace,
    OrbitControls: OrbitControlsCtor,
  ) {
    this.THREE = THREE;
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";
    this.renderer.setClearColor(0xf8f7f4, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#F8F7F4");

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
    this.camera.position.set(0, 0, 18);

    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(4, 8, 10);
    this.scene.add(ambient, key);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement) as InstanceType<OrbitControlsCtor>;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 80;
    this.controls.addEventListener("start", this.handleCameraStart);
    this.controls.addEventListener("end", this.handleCameraEnd);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.nodeMatrix = new THREE.Matrix4();
    this.nodeColor = new THREE.Color();
    this.dimColor = new THREE.Color("#9CA3AF");

    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.addEventListener("click", this.handleClick);
    container.appendChild(this.renderer.domElement);
  }

  static async create(container: HTMLElement): Promise<{ renderer: ThreeGraphRenderer | null; failureReason?: string }> {
    try {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      return { renderer: new ThreeGraphRenderer(container, THREE, OrbitControls as OrbitControlsCtor) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { renderer: null, failureReason: `ThreeGraphRenderer initialization failed: ${message}` };
    }
  }

  draw(frame: GraphRenderFrame): GraphDrawResult {
    if (this.disposed) return { needsContinuousRedraw: false };

    const dpr = Math.min(frame.devicePixelRatio || 1, frame.isInteracting || this.cameraMoving ? 1.5 : 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(Math.max(1, frame.cssWidth), Math.max(1, frame.cssHeight), false);
    this.camera.aspect = Math.max(1, frame.cssWidth) / Math.max(1, frame.cssHeight);
    this.camera.updateProjectionMatrix();

    this.positions3d = this.getPositions3d(frame);
    this.visibleNodeIndices = frame.userIndices ?? new Uint32Array(frame.nodes.map((_, index) => index));

    const visibleKey = `${this.visibleNodeIndices.length}:${this.visibleNodeIndices[0] ?? -1}:${this.visibleNodeIndices[this.visibleNodeIndices.length - 1] ?? -1}`;
    if (frame.nodes.length !== this.lastNodeCount || visibleKey !== this.lastVisibleKey) {
      this.rebuildNodeMesh(frame);
      this.lastNodeCount = frame.nodes.length;
      this.lastVisibleKey = visibleKey;
      this.lastLinkKey = "";
      this.fitCameraToVisible(frame);
    }

    this.updateNodeInstances(frame);
    this.updateEdges(frame);

    const controlsMoved = this.controls.update();
    if (controlsMoved) this.markCameraMoving();
    this.renderer.render(this.scene, this.camera);

    return { needsContinuousRedraw: this.cameraMoving || controlsMoved };
  }

  resetCamera(frame?: GraphRenderFrame): void {
    if (frame) {
      this.positions3d = frame.positions3d ?? buildPositions3d(frame.nodes, frame.positions, {
        xyScale: NODE_XY_SCALE,
        zScale: NODE_Z_SCALE,
      });
      this.visibleNodeIndices = frame.userIndices ?? new Uint32Array(frame.nodes.map((_, index) => index));
    }
    this.fitCameraToVisible(frame);
  }

  destroy(): void {
    this.disposed = true;
    if (this.cameraSettledTimer) clearTimeout(this.cameraSettledTimer);
    this.controls.removeEventListener("start", this.handleCameraStart);
    this.controls.removeEventListener("end", this.handleCameraEnd);
    this.controls.dispose();
    this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.removeEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.removeEventListener("click", this.handleClick);
    this.nodeMesh?.geometry.dispose();
    if (Array.isArray(this.nodeMesh?.material)) {
      this.nodeMesh.material.forEach((material) => material.dispose());
    } else {
      this.nodeMesh?.material.dispose();
    }
    this.edgeLines?.geometry.dispose();
    if (Array.isArray(this.edgeLines?.material)) {
      this.edgeLines.material.forEach((material) => material.dispose());
    } else {
      this.edgeLines?.material.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.lastSourcePositions = null;
    this.lastPositionNodeCount = -1;
    this.onNodeSelectCallback = null;
    this.onNodeHoverCallback = null;
    this.onCameraMoveCallback = null;
  }

  private rebuildNodeMesh(frame: GraphRenderFrame): void {
    if (this.nodeMesh) {
      this.scene.remove(this.nodeMesh);
      this.nodeMesh.geometry.dispose();
      if (Array.isArray(this.nodeMesh.material)) {
        this.nodeMesh.material.forEach((material) => material.dispose());
      } else {
        this.nodeMesh.material.dispose();
      }
      this.nodeMesh = null;
    }

    this.nodeToInstance.clear();
    const count = this.visibleNodeIndices.length;
    if (count === 0) return;

    const geometry = new this.THREE.SphereGeometry(1, 12, 8);
    const material = new this.THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new this.THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(this.THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;

    for (let instance = 0; instance < count; instance++) {
      this.nodeToInstance.set(this.visibleNodeIndices[instance], instance);
    }

    this.nodeMesh = mesh;
    this.scene.add(mesh);
    this.updateNodeInstances(frame);
  }

  private getPositions3d(frame: GraphRenderFrame): Float32Array {
    if (frame.positions3d) {
      this.lastSourcePositions = frame.positions;
      this.lastPositionNodeCount = frame.nodes.length;
      return frame.positions3d;
    }
    if (
      this.positions3d.length === frame.nodes.length * 3 &&
      this.lastSourcePositions === frame.positions &&
      this.lastPositionNodeCount === frame.nodes.length
    ) {
      return this.positions3d;
    }
    this.lastSourcePositions = frame.positions;
    this.lastPositionNodeCount = frame.nodes.length;
    return buildPositions3d(frame.nodes, frame.positions, {
      xyScale: NODE_XY_SCALE,
      zScale: NODE_Z_SCALE,
    });
  }

  private updateNodeInstances(frame: GraphRenderFrame): void {
    if (!this.nodeMesh) return;

    const hasSelection = frame.selectedNodeIndex >= 0;
    const selectedColor = hasSelection ? frame.nodes[frame.selectedNodeIndex]?.color : null;

    for (let visibleOffset = 0; visibleOffset < this.visibleNodeIndices.length; visibleOffset++) {
      const nodeIndex = this.visibleNodeIndices[visibleOffset];
      const node = frame.nodes[nodeIndex];
      const p = nodeIndex * 3;
      const x = this.positions3d[p];
      const y = -this.positions3d[p + 1];
      const z = this.positions3d[p + 2];
      const isSelected = nodeIndex === frame.selectedNodeIndex;
      const isSameUser = frame.sameUserHighlightSet.has(nodeIndex);
      const isDimmed = hasSelection && !frame.highlightSet.has(nodeIndex) && !isSameUser && !isSelected;
      const radius = isSelected ? 0.16 : this.hoveredIndex === nodeIndex ? 0.13 : 0.085 + Math.min(0.045, (node.degree ?? 0) * 0.002);

      this.nodeMatrix.makeScale(radius, radius, radius);
      this.nodeMatrix.setPosition(x, y, z);
      this.nodeMesh.setMatrixAt(visibleOffset, this.nodeMatrix);

      const color = isDimmed ? this.dimColor : this.nodeColor.set(isSameUser && selectedColor ? selectedColor : node.color);
      this.nodeMesh.setColorAt(visibleOffset, color);
    }

    this.nodeMesh.instanceMatrix.needsUpdate = true;
    if (this.nodeMesh.instanceColor) this.nodeMesh.instanceColor.needsUpdate = true;
  }

  private updateEdges(frame: GraphRenderFrame): void {
    const links = frame.links;
    const linkKey = `${links?.sources.length ?? 0}:${this.lastVisibleKey}:${frame.selectedNodeIndex}:${frame.isInteracting ? 1 : 0}`;
    if (linkKey === this.lastLinkKey) return;
    this.lastLinkKey = linkKey;

    if (this.edgeLines) {
      this.scene.remove(this.edgeLines);
      this.edgeLines.geometry.dispose();
      if (Array.isArray(this.edgeLines.material)) {
        this.edgeLines.material.forEach((material) => material.dispose());
      } else {
        this.edgeLines.material.dispose();
      }
      this.edgeLines = null;
    }
    if (!links || links.sources.length === 0) return;

    const segments: number[] = [];
    for (let i = 0; i < links.sources.length; i++) {
      const s = links.sources[i];
      const t = links.targets[i];
      if (!this.nodeToInstance.has(s) || !this.nodeToInstance.has(t)) continue;
      const sp = s * 3;
      const tp = t * 3;
      segments.push(
        this.positions3d[sp],
        -this.positions3d[sp + 1],
        this.positions3d[sp + 2],
        this.positions3d[tp],
        -this.positions3d[tp + 1],
        this.positions3d[tp + 2],
      );
    }
    if (segments.length === 0) return;

    const geometry = new this.THREE.BufferGeometry();
    geometry.setAttribute("position", new this.THREE.Float32BufferAttribute(segments, 3));
    const material = new this.THREE.LineBasicMaterial({
      color: 0x9ca3af,
      transparent: true,
      opacity: frame.isInteracting || this.cameraMoving ? 0.08 : 0.16,
      depthWrite: false,
    });
    this.edgeLines = new this.THREE.LineSegments(geometry, material);
    this.edgeLines.frustumCulled = false;
    this.scene.add(this.edgeLines);
  }

  private fitCameraToVisible(frame?: GraphRenderFrame): void {
    if (!this.visibleNodeIndices.length || !this.positions3d.length) return;
    const box = new this.THREE.Box3();
    const point = new this.THREE.Vector3();

    for (let i = 0; i < this.visibleNodeIndices.length; i++) {
      const nodeIndex = this.visibleNodeIndices[i];
      const p = nodeIndex * 3;
      point.set(this.positions3d[p], -this.positions3d[p + 1], this.positions3d[p + 2]);
      box.expandByPoint(point);
    }

    if (box.isEmpty()) return;
    const center = new this.THREE.Vector3();
    const size = new this.THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxSize = Math.max(size.x, size.y, size.z, 1);
    const fov = this.camera.fov * (Math.PI / 180);
    const distance = (maxSize * FIT_PADDING) / (2 * Math.tan(fov / 2));

    this.controls.target.copy(center);
    this.camera.position.set(center.x, center.y, center.z + Math.max(5, distance));
    this.camera.near = Math.max(0.01, distance / 100);
    this.camera.far = Math.max(500, distance * 20);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    if (frame) this.updateNodeInstances(frame);
    this.markCameraMoving();
  }

  private pickNode(event: MouseEvent): number | null {
    if (!this.nodeMesh || !this.visibleNodeIndices.length) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.nodeMesh, false);
    const instanceId = hits[0]?.instanceId;
    if (instanceId == null || instanceId < 0 || instanceId >= this.visibleNodeIndices.length) return null;
    return this.visibleNodeIndices[instanceId];
  }

  private handlePointerMove = (event: MouseEvent): void => {
    if (this.cameraMoving) return;
    const index = this.pickNode(event);
    if (index === this.hoveredIndex) return;
    this.hoveredIndex = index;
    this.onNodeHoverCallback?.(index, event);
  };

  private handlePointerLeave = (): void => {
    this.hoveredIndex = null;
    this.onNodeHoverCallback?.(null);
  };

  private handleClick = (event: MouseEvent): void => {
    const index = this.pickNode(event);
    this.selectedIndex = index ?? -1;
    this.onNodeSelectCallback?.(index);
  };

  private handleCameraStart = (): void => {
    this.markCameraMoving();
  };

  private handleCameraEnd = (): void => {
    this.scheduleCameraSettled();
  };

  private markCameraMoving(): void {
    if (!this.cameraMoving) {
      this.cameraMoving = true;
      this.onCameraMoveCallback?.(true);
    }
    this.scheduleCameraSettled();
  }

  private scheduleCameraSettled(): void {
    if (this.cameraSettledTimer) clearTimeout(this.cameraSettledTimer);
    this.cameraSettledTimer = setTimeout(() => {
      this.cameraMoving = false;
      this.onCameraMoveCallback?.(false);
    }, 180);
  }
}
