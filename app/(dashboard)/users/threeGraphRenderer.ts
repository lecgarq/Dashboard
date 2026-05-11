"use client";

import type * as ThreeModule from "three";
import {
  ACC_GRAPH_3D_CAMERA_OFFSET,
  ACC_GRAPH_3D_POSITION_OPTIONS,
  buildPositions3d,
  get3dEdgeSampleStep,
  shouldRender3dEdges,
} from "./accGraph3d";
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

const FIT_PADDING = 1.55;
const POINT_SIZE_PX = 4.2;

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
  private readonly colorScratch: ThreeModule.Color;
  private readonly dimColor: ThreeModule.Color;

  private pointCloud: ThreeModule.Points | null = null;
  private pointGeometry: ThreeModule.BufferGeometry | null = null;
  private edgeLines: ThreeModule.LineSegments | null = null;
  private positions3d: Float32Array = new Float32Array(0);
  private lastSourcePositions: Float32Array | null = null;
  private lastPositionNodeCount = -1;
  private visibleNodeIndices: Uint32Array = new Uint32Array(0);
  private visibleNodeKey = "";
  private lastNodeCount = -1;
  private lastVisibleKey = "";
  private lastLinkKey = "";
  private lastEdgeSourcePositions: Float32Array | null = null;
  private hoveredIndex: number | null = null;
  private selectedIndex = -1;
  private cameraMoving = false;
  private cameraSettledTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private hasFitCamera = false;

  private constructor(
    container: HTMLElement,
    THREE: ThreeNamespace,
    OrbitControls: OrbitControlsCtor,
  ) {
    this.THREE = THREE;
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
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
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 500);
    this.camera.position.set(8, -6, 20);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement) as InstanceType<OrbitControlsCtor>;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 90;
    this.controls.addEventListener("start", this.handleCameraStart);
    this.controls.addEventListener("end", this.handleCameraEnd);

    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points = { threshold: 0.18 };
    this.pointer = new THREE.Vector2();
    this.colorScratch = new THREE.Color();
    this.dimColor = new THREE.Color("#AEB7C2");

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

    const isMoving = frame.isCameraMoving === true || this.cameraMoving;
    const dpr = Math.min(frame.devicePixelRatio || 1, isMoving || frame.isInteracting ? 1.25 : 1.75);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(Math.max(1, frame.cssWidth), Math.max(1, frame.cssHeight), false);
    this.camera.aspect = Math.max(1, frame.cssWidth) / Math.max(1, frame.cssHeight);
    this.camera.updateProjectionMatrix();

    this.positions3d = this.getPositions3d(frame);
    this.visibleNodeIndices = frame.userIndices ?? new Uint32Array(frame.nodes.map((_, index) => index));

    const visibleKey = this.makeVisibleKey(this.visibleNodeIndices);
    const needsRebuild =
      frame.nodes.length !== this.lastNodeCount ||
      visibleKey !== this.lastVisibleKey ||
      !this.pointCloud;

    if (needsRebuild) {
      this.rebuildPointCloud(frame);
      this.lastNodeCount = frame.nodes.length;
      this.lastVisibleKey = visibleKey;
      this.lastLinkKey = "";
      this.lastEdgeSourcePositions = null;
      this.fitCameraToVisible(frame);
    } else {
      this.updatePointCloud(frame);
      if (!this.hasFitCamera) this.fitCameraToVisible(frame);
    }

    this.updateEdges(frame);

    const controlsMoved = this.controls.update();
    if (controlsMoved) this.markCameraMoving();
    this.renderer.render(this.scene, this.camera);

    return { needsContinuousRedraw: this.cameraMoving || controlsMoved };
  }

  resetCamera(frame?: GraphRenderFrame): void {
    if (frame) {
      this.positions3d = this.getPositions3d(frame);
      this.visibleNodeIndices = frame.userIndices ?? new Uint32Array(frame.nodes.map((_, index) => index));
    }
    this.hasFitCamera = false;
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
    this.disposePointCloud();
    this.disposeEdges();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.lastSourcePositions = null;
    this.lastPositionNodeCount = -1;
    this.lastEdgeSourcePositions = null;
    this.onNodeSelectCallback = null;
    this.onNodeHoverCallback = null;
    this.onCameraMoveCallback = null;
  }

  private rebuildPointCloud(frame: GraphRenderFrame): void {
    this.disposePointCloud();

    const count = this.visibleNodeIndices.length;
    if (count === 0) return;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this.pointGeometry = new this.THREE.BufferGeometry();
    this.pointGeometry.setAttribute("position", new this.THREE.BufferAttribute(positions, 3));
    this.pointGeometry.setAttribute("color", new this.THREE.BufferAttribute(colors, 3));

    const material = new this.THREE.PointsMaterial({
      size: POINT_SIZE_PX,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.pointCloud = new this.THREE.Points(this.pointGeometry, material);
    this.pointCloud.frustumCulled = false;
    this.scene.add(this.pointCloud);
    this.updatePointCloud(frame);
  }

  private updatePointCloud(frame: GraphRenderFrame): void {
    if (!this.pointGeometry) return;
    const positionAttr = this.pointGeometry.getAttribute("position") as ThreeModule.BufferAttribute | undefined;
    const colorAttr = this.pointGeometry.getAttribute("color") as ThreeModule.BufferAttribute | undefined;
    if (!positionAttr || !colorAttr) return;

    const positionArray = positionAttr.array as Float32Array;
    const colorArray = colorAttr.array as Float32Array;
    const hasSelection = frame.selectedNodeIndex >= 0;
    const selectedColor = hasSelection ? frame.nodes[frame.selectedNodeIndex]?.color : null;

    for (let visibleOffset = 0; visibleOffset < this.visibleNodeIndices.length; visibleOffset++) {
      const nodeIndex = this.visibleNodeIndices[visibleOffset];
      const node = frame.nodes[nodeIndex];
      const sourceOffset = nodeIndex * 3;
      const targetOffset = visibleOffset * 3;
      positionArray[targetOffset] = this.positions3d[sourceOffset];
      positionArray[targetOffset + 1] = -this.positions3d[sourceOffset + 1];
      positionArray[targetOffset + 2] = this.positions3d[sourceOffset + 2];

      const isSelected = nodeIndex === frame.selectedNodeIndex;
      const isSameUser = frame.sameUserHighlightSet.has(nodeIndex);
      const isDimmed = hasSelection && !frame.highlightSet.has(nodeIndex) && !isSameUser && !isSelected;
      const color = isDimmed
        ? this.dimColor
        : this.colorScratch.set(isSameUser && selectedColor ? selectedColor : node.color);
      colorArray[targetOffset] = color.r;
      colorArray[targetOffset + 1] = color.g;
      colorArray[targetOffset + 2] = color.b;
    }

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    this.pointGeometry.computeBoundingSphere();
  }

  private updateEdges(frame: GraphRenderFrame): void {
    const links = frame.links;
    const linkCount = links?.sources.length ?? 0;
    const drawEdges = shouldRender3dEdges({
      linkCount,
      isCameraMoving: this.cameraMoving || frame.isCameraMoving === true,
      isInteracting: frame.isInteracting,
    });

    if (!drawEdges) {
      this.disposeEdges();
      this.lastLinkKey = "";
      this.lastEdgeSourcePositions = null;
      return;
    }

    const step = get3dEdgeSampleStep(linkCount);
    const linkKey = `${linkCount}:${step}:${this.lastVisibleKey}:${frame.selectedNodeIndex}`;
    if (linkKey === this.lastLinkKey && this.lastEdgeSourcePositions === frame.positions) return;
    this.lastLinkKey = linkKey;
    this.lastEdgeSourcePositions = frame.positions;

    this.disposeEdges();
    if (!links || linkCount === 0) return;

    const visibleSet = new Set(this.visibleNodeIndices);
    const segments: number[] = [];
    for (let i = 0; i < links.sources.length; i += step) {
      const s = links.sources[i];
      const t = links.targets[i];
      if (!visibleSet.has(s) || !visibleSet.has(t)) continue;
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
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.045,
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

    const offset = new this.THREE.Vector3(
      ACC_GRAPH_3D_CAMERA_OFFSET.x,
      ACC_GRAPH_3D_CAMERA_OFFSET.y,
      ACC_GRAPH_3D_CAMERA_OFFSET.z,
    ).normalize().multiplyScalar(Math.max(8, distance));

    this.controls.target.copy(center);
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(
      center.x + offset.x,
      center.y + offset.y,
      center.z + offset.z,
    );
    this.camera.lookAt(center);
    this.camera.near = Math.max(0.01, distance / 100);
    this.camera.far = Math.max(500, distance * 20);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    if (frame) this.updatePointCloud(frame);
    this.hasFitCamera = true;
    this.markCameraMoving();
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
      ...ACC_GRAPH_3D_POSITION_OPTIONS,
    });
  }

  private pickNode(event: MouseEvent): number | null {
    if (!this.pointCloud || !this.visibleNodeIndices.length) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.pointCloud, false);
    const visibleOffset = hits[0]?.index;
    if (visibleOffset == null || visibleOffset < 0 || visibleOffset >= this.visibleNodeIndices.length) return null;
    return this.visibleNodeIndices[visibleOffset];
  }

  private makeVisibleKey(indices: Uint32Array): string {
    return `${indices.length}:${indices[0] ?? -1}:${indices[Math.floor(indices.length / 2)] ?? -1}:${indices[indices.length - 1] ?? -1}`;
  }

  private disposePointCloud(): void {
    if (!this.pointCloud) return;
    this.scene.remove(this.pointCloud);
    this.pointGeometry?.dispose();
    const material = this.pointCloud.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material.dispose();
    this.pointCloud = null;
    this.pointGeometry = null;
  }

  private disposeEdges(): void {
    if (!this.edgeLines) return;
    this.scene.remove(this.edgeLines);
    this.edgeLines.geometry.dispose();
    const material = this.edgeLines.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material.dispose();
    this.edgeLines = null;
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
