"use client";

/**
 * GraphCanvas3D.tsx — three.js r184 InstancedMesh + OrbitControls 3D renderer.
 *
 * REND-04 PURITY CONTRACT:
 * - Allowed imports: react, three, three/examples/jsm/controls/OrbitControls.js, ./physicsLayer (type only)
 * - NO math/data/dimension-control layer references allowed here.
 *
 * ARCHITECTURE:
 * - Self-driving rAF for controls.update() + renderer.render() every frame.
 * - Receives position updates via pushPositions() from GraphCanvas's useGraphRafLoop.
 * - Alpha mask is baked into per-instance RGB color (Pitfall 6: MeshBasicMaterial.opacity is global).
 * - Always mounted; GraphCanvas hides it via CSS visibility when mode === '2d'.
 */

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { PhysicsLayer } from "./physicsLayer";
import type { GraphEventHandlers } from "./interactionTypes";

// Noop handlers — Phase 4-01 Task 2 ref-indirection (Pitfall 5 + Pitfall 6).
const NOOP_HANDLERS: GraphEventHandlers = {
  onPointClick: () => {},
  onPointHover: () => {},
  onPointHoverEnd: () => {},
};

// ---------------------------------------------------------------------------
// Handle interface (exposed via onHandleReady)
// ---------------------------------------------------------------------------

export interface GraphCanvas3DHandle {
  /** Push stride-3 xyz positions from physicsLayer into InstancedMesh matrices. */
  pushPositions(xyz: Float32Array): void;
  /** Bake alpha mask into per-instance colors. Lit (>= 0.99) = full color; dimmed = × 0.15. */
  applyAlphaMask(mask: Float32Array, version: number): void;
  /** Update the base node colors. Re-applies any current alpha mask. */
  setColors(rgba: Float32Array): void;
  /** Recompute bounding box and re-aim camera to fit all nodes. */
  fitView(): void;
  /** Update the scene background color. */
  setBackground(color: string): void;
  /** Expose camera so GraphCanvas can tween position during mode transitions. */
  getCamera(): THREE.PerspectiveCamera;
  /**
   * Install click/hover handlers via ref-indirection (Phase 4-01 Task 2).
   * No lasso primitives in 3D — v1 defers polygon selection to 2D mode only.
   */
  setEventHandlers(h: GraphEventHandlers): void;
  /** Replace the link set (flat [s,t,...] index pairs). Rebuilds line geometry. */
  setLinks(links: Float32Array): void;
  /** Replace per-link RGBA (0–1, length = links/2*4). Premultiplied into vertex RGB. */
  setLinkColors(rgba: Float32Array): void;
  /** Test/diagnostic: derived 3D edge render state. */
  getRenderState(): {
    renderLinks: boolean;
    linkCount: number;
    hasLineGeometry: boolean;
    positionAttributeLength: number;
    colorAttributeLength: number;
    nodeColorAttributeLength: number;
    nodeColorNodeCount: number;
    nodeColorDistinctColors: number;
    nodeColorSignature: number;
    nodeColorAllFinite: boolean;
    nodeColorNeedsUpdate: boolean;
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GraphCanvas3DProps {
  containerRef: RefObject<HTMLDivElement | null>;
  physics: PhysicsLayer;
  nodeColors: Float32Array;
  nodeSizes?: Float32Array;
  backgroundColor: string;
  /** Flat link buffer [s0,t0,s1,t1,...] in node-index space. */
  links?: Float32Array;
  /** Initial per-link RGBA (0–1). Length = links.length/2*4. */
  linkColors?: Float32Array;
  onHandleReady: (h: GraphCanvas3DHandle) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Dim factor applied to per-instance colors when alphaMask[i] < 0.99 */
const DIM = 0.15;

export function GraphCanvas3D(props: GraphCanvas3DProps): null {
  const handleRef = useRef<GraphCanvas3DHandle | null>(null);

  useEffect(() => {
    const container = props.containerRef.current;
    if (!container) return;

    // -----------------------------------------------------------------------
    // Scene setup
    // -----------------------------------------------------------------------

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(props.backgroundColor);

    const camera = new THREE.PerspectiveCamera(60, w / h, 1, 100_000);
    camera.position.set(0, 0, 2000);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = false;
    // No polar clamping — unconstrained orbit (CONTEXT.md)

    // -----------------------------------------------------------------------
    // InstancedMesh
    // -----------------------------------------------------------------------

    const initialXyz = props.physics.getPositions();
    const n = initialXyz.length / 3;

    const geometry = new THREE.SphereGeometry(4, 6, 6);
    // NOTE: do NOT set vertexColors:true here. SphereGeometry has no per-vertex
    // `color` attribute, so enabling USE_COLOR alongside USE_INSTANCING_COLOR
    // makes the shader multiply vColor by an unbound attribute (defaults to
    // (0,0,0)) — every instance renders near-black/grey regardless of the
    // populated `mesh.instanceColor` buffer. With instanceColor set, three.js
    // enables USE_INSTANCING_COLOR on its own; that path alone is what we want.
    const material = new THREE.MeshBasicMaterial({ transparent: true });
    const mesh = new THREE.InstancedMesh(geometry, material, n);

    // Per-instance RGB color buffer (stride-3; alpha baked in as color multiplication)
    const instanceColorData = new Float32Array(n * 3);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(instanceColorData, 3);

    // Persistent dummy Object3D — reused every tick (no per-frame allocation)
    const dummy = new THREE.Object3D();

    // Write initial positions
    for (let i = 0; i < n; i++) {
      dummy.position.set(initialXyz[i * 3], initialXyz[i * 3 + 1], initialXyz[i * 3 + 2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    scene.add(mesh);

    // -----------------------------------------------------------------------
    // Initial color load (no alpha mask applied yet — all lit)
    // -----------------------------------------------------------------------

    // We keep the current base colors + mask so recolors preserve dimming state.
    let currentNodeColors = props.nodeColors;
    let currentAlphaMask: Float32Array | null = null;

    // Edge (LineSegments) state — built lazily when links are present.
    let currentXyz: Float32Array = initialXyz;
    let edgeLines: THREE.LineSegments | null = null;
    let edgeGeometry: THREE.BufferGeometry | null = null;
    let edgePositions: Float32Array | null = null; // edges*2*3
    let edgeColors: Float32Array | null = null;     // edges*2*3
    let edgeLinkIndices: Float32Array | null = null; // flat [s,t,...]
    let edgeCount = 0;

    function writeCurrentNodeColors(): void {
      for (let i = 0; i < n; i++) {
        const lit = currentAlphaMask && currentAlphaMask[i] < 0.99 ? DIM : 1.0;
        instanceColorData[i * 3]     = currentNodeColors[i * 4]     * lit;
        instanceColorData[i * 3 + 1] = currentNodeColors[i * 4 + 1] * lit;
        instanceColorData[i * 3 + 2] = currentNodeColors[i * 4 + 2] * lit;
      }
      mesh.instanceColor!.needsUpdate = true;
    }

    writeCurrentNodeColors();

    // Initial edge load (mirrors the 2D init block; built once, edge set is static).
    if (props.links && props.links.length > 0) {
      buildEdges(props.links);
      if (props.linkColors) applyEdgeColors(props.linkColors);
    }

    // -----------------------------------------------------------------------
    // Handle implementation
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // F.1 render gating — `dirty` is set by every code path that invalidates
    // the painted frame (positions, mask, colors, edges, background, fitView,
    // resize). The self-driving renderLoop calls `controls.update()` every
    // frame (damping requires it) but only calls `renderer.render(scene,
    // camera)` when EITHER controls.update() returns true (camera/damping
    // motion) OR `dirty` is set. The first frame is dirty so the initial
    // scene paints exactly once.
    //
    // Positions invalidation is double-gated by `lastPositionsVersion` so
    // useGraphRafLoop's per-frame onTick3D callback is a no-op (no matrix
    // writes, no GPU upload) when the physics layer has not produced a new
    // tick since the last paint — the T0 baseline showed pumpPositions3D was
    // doing 16,942 matrix writes per rAF even between physics ticks.
    // -----------------------------------------------------------------------
    let dirty = true;
    let lastPositionsVersion = -1;

    let fitted3D = false;
    function pumpPositions3D(xyz: Float32Array): void {
      const v = props.physics.positionsVersion;
      if (v === lastPositionsVersion) {
        // Same tick as the previous frame — nothing has moved since we last
        // wrote matrices. Skip the O(n) write + the implicit GPU re-upload.
        return;
      }
      lastPositionsVersion = v;
      for (let i = 0; i < n; i++) {
        dummy.position.set(xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      currentXyz = xyz;
      writeEdgePositions(xyz);
      dirty = true;
      // One-shot camera fit once the layout settles — the seed scale (~[-1,1])
      // is tiny vs the settled spread, so the initial camera pose leaves nodes
      // out of frame until we re-fit. Re-armed whenever the simulation reheats.
      if (props.physics.frozen) {
        if (!fitted3D) {
          fitted3D = true;
          fitView();
        }
      } else {
        fitted3D = false;
      }
    }

    function applyAlphaMask3D(mask: Float32Array): void {
      currentAlphaMask = mask;
      writeCurrentNodeColors();
      dirty = true; // mask change → instanceColor needsUpdate → must paint
    }

    function buildEdges(links: Float32Array): void {
      if (edgeLines) {
        scene.remove(edgeLines);
        edgeGeometry?.dispose();
        (edgeLines.material as THREE.Material).dispose();
        edgeLines = null;
        edgeGeometry = null;
      }
      edgeLinkIndices = links;
      edgeCount = links.length / 2;
      if (edgeCount === 0) {
        edgePositions = null;
        edgeColors = null;
        return;
      }
      edgePositions = new Float32Array(edgeCount * 2 * 3);
      edgeColors = new Float32Array(edgeCount * 2 * 3);
      edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
      edgeGeometry.setAttribute("color", new THREE.BufferAttribute(edgeColors, 3));
      const edgeMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 1, // alpha is baked into RGB (§5) — MUST stay 1, no double-attenuation
        depthWrite: false,
      });
      edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      edgeLines.frustumCulled = false;
      edgeLines.renderOrder = -1; // draw behind the node spheres
      scene.add(edgeLines);
      writeEdgePositions(currentXyz);
    }

    function writeEdgePositions(xyz: Float32Array): void {
      if (!edgeGeometry || !edgePositions || !edgeLinkIndices || edgeCount === 0) return;
      for (let e = 0; e < edgeCount; e++) {
        const s = edgeLinkIndices[e * 2];
        const t = edgeLinkIndices[e * 2 + 1];
        const so = s * 3;
        const to = t * 3;
        const o = e * 6;
        edgePositions[o] = xyz[so];
        edgePositions[o + 1] = xyz[so + 1];
        edgePositions[o + 2] = xyz[so + 2];
        edgePositions[o + 3] = xyz[to];
        edgePositions[o + 4] = xyz[to + 1];
        edgePositions[o + 5] = xyz[to + 2];
      }
      (edgeGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    function applyEdgeColors(rgba: Float32Array): void {
      if (!edgeGeometry || !edgeColors || edgeCount === 0) return;
      for (let e = 0; e < edgeCount; e++) {
        const a = rgba[e * 4 + 3];
        const pr = rgba[e * 4] * a;
        const pg = rgba[e * 4 + 1] * a;
        const pb = rgba[e * 4 + 2] * a;
        const o = e * 6;
        edgeColors[o] = pr;
        edgeColors[o + 1] = pg;
        edgeColors[o + 2] = pb;
        edgeColors[o + 3] = pr;
        edgeColors[o + 4] = pg;
        edgeColors[o + 5] = pb;
      }
      (edgeGeometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }

    function getNodeColorRenderStats(): Pick<
      ReturnType<GraphCanvas3DHandle["getRenderState"]>,
      | "nodeColorAttributeLength"
      | "nodeColorNodeCount"
      | "nodeColorDistinctColors"
      | "nodeColorSignature"
      | "nodeColorAllFinite"
      | "nodeColorNeedsUpdate"
    > {
      const count = instanceColorData.length / 3;
      const seen = new Set<number>();
      let sig = 0x811c9dc5;
      let allFinite = true;
      for (let i = 0; i < count; i++) {
        const r = instanceColorData[i * 3];
        const g = instanceColorData[i * 3 + 1];
        const b = instanceColorData[i * 3 + 2];
        if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
          allFinite = false;
        }
        const qr = Math.max(0, Math.min(255, Math.round(r * 255)));
        const qg = Math.max(0, Math.min(255, Math.round(g * 255)));
        const qb = Math.max(0, Math.min(255, Math.round(b * 255)));
        seen.add((qr << 16) | (qg << 8) | qb);
        sig = Math.imul(sig ^ qr, 0x01000193) >>> 0;
        sig = Math.imul(sig ^ qg, 0x01000193) >>> 0;
        sig = Math.imul(sig ^ qb, 0x01000193) >>> 0;
      }
      return {
        nodeColorAttributeLength: instanceColorData.length,
        nodeColorNodeCount: count,
        nodeColorDistinctColors: seen.size,
        nodeColorSignature: sig >>> 0,
        nodeColorAllFinite: allFinite,
        nodeColorNeedsUpdate: mesh.instanceColor?.needsUpdate === true,
      };
    }

    // -----------------------------------------------------------------------
    // fitView — compute bounding box from InstancedMesh and re-aim camera
    // -----------------------------------------------------------------------

    const tmpVec = new THREE.Vector3();
    const tmpMat = new THREE.Matrix4();
    const box = new THREE.Box3();

    function fitView(): void {
      box.makeEmpty();
      for (let i = 0; i < n; i++) {
        mesh.getMatrixAt(i, tmpMat);
        tmpVec.setFromMatrixPosition(tmpMat);
        box.expandByPoint(tmpVec);
      }
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const fov = camera.fov * (Math.PI / 180);
      const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.5;
      camera.position.set(center.x, center.y, center.z + distance);
      controls.target.copy(center);
      controls.update();
      // fitView calls controls.update() itself, which advances its lastPosition
      // snapshot. The next renderLoop call would then see update() returning
      // false and skip the frame. Force a paint via dirty so the fitted pose
      // actually lands on screen.
      dirty = true;
    }

    // -----------------------------------------------------------------------
    // Phase 4-01 Task 2 — Raycaster click/hover wiring (RESEARCH Pattern 4 + Pitfall 6)
    // - pointerdown/click → instanceId via Raycaster.intersectObject(mesh)
    // - pointermove → rAF-coalesced raycast (skip if no new event since last frame)
    // - Ref-indirect handlers (Pitfall 5) — no setConfig-style resets
    // - No lasso primitives in 3D — deferred to v2
    // -----------------------------------------------------------------------

    const handlersRef: { current: GraphEventHandlers } = { current: NOOP_HANDLERS };
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    function ndcFromPointerEvent(e: PointerEvent | MouseEvent): void {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function pickAtNdc(): number | null {
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(mesh, false);
      if (hits.length === 0) return null;
      const id = hits[0].instanceId;
      return typeof id === "number" ? id : null;
    }

    const onClickHandler = (e: MouseEvent): void => {
      ndcFromPointerEvent(e);
      const i = pickAtNdc();
      handlersRef.current.onPointClick(i ?? undefined);
    };
    canvas.addEventListener("click", onClickHandler);

    // pointermove with rAF coalescing — at most one raycast per frame (Pitfall 6).
    let pendingMoveEvent: PointerEvent | null = null;
    let moveRafId: number | null = null;
    const processPendingMove = (): void => {
      moveRafId = null;
      const e = pendingMoveEvent;
      pendingMoveEvent = null;
      if (!e) return;
      const rect = canvas.getBoundingClientRect();
      ndcFromPointerEvent(e);
      const i = pickAtNdc();
      if (i !== null) {
        const screen: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
        handlersRef.current.onPointHover(i, screen);
      } else {
        handlersRef.current.onPointHoverEnd();
      }
    };
    const onPointerMove = (e: PointerEvent): void => {
      pendingMoveEvent = e;
      if (moveRafId === null) {
        moveRafId = requestAnimationFrame(processPendingMove);
      }
    };
    canvas.addEventListener("pointermove", onPointerMove);

    // -----------------------------------------------------------------------
    // Self-driving rAF (OrbitControls damping requires per-frame controls.update())
    // -----------------------------------------------------------------------

    let rafId: number;
    let mounted = true;

    function renderLoop(): void {
      if (!mounted) return;
      rafId = requestAnimationFrame(renderLoop);
      // controls.update() MUST run every frame — damping advances its position
      // tween here. Skipping it would freeze post-release inertia and break the
      // mode-transition tween's interaction with the orbit camera.
      const cameraChanged = controls.update();
      if (!cameraChanged && !dirty) return;
      dirty = false;
      renderer.render(scene, camera);
    }
    rafId = requestAnimationFrame(renderLoop);

    // -----------------------------------------------------------------------
    // Resize handling
    // -----------------------------------------------------------------------

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      if (rw === 0 || rh === 0) return;
      renderer.setSize(rw, rh, false);
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      // P0: do NOT fitView() on resize — that discards the user's orbit/zoom.
      // Initial framing is handled by the first-settle fit in pumpPositions3D;
      // mode transitions fit via GraphCanvas. Resize only adjusts the projection.
      dirty = true; // viewport changed — must repaint at the new size.
    });
    resizeObserver.observe(container);

    // -----------------------------------------------------------------------
    // Expose handle
    // -----------------------------------------------------------------------

    const handle: GraphCanvas3DHandle = {
      pushPositions: pumpPositions3D,
      applyAlphaMask: (mask, _version) => applyAlphaMask3D(mask),
      setColors: (rgba) => {
        currentNodeColors = rgba;
        writeCurrentNodeColors();
        dirty = true; // instanceColor needsUpdate → paint required
      },
      fitView,
      setBackground: (color) => {
        scene.background = new THREE.Color(color);
        dirty = true; // background color is rendered only on paint
      },
      getCamera: () => camera,
      // Phase 4-01 Task 2 — ref-indirection (Pitfall 5). No config re-issue ever.
      setEventHandlers: (h: GraphEventHandlers) => {
        handlersRef.current = h;
      },
      setLinks: (links: Float32Array) => {
        buildEdges(links);
        writeEdgePositions(currentXyz);
        dirty = true; // edge geometry rebuilt → paint required
      },
      setLinkColors: (rgba: Float32Array) => {
        applyEdgeColors(rgba);
        dirty = true; // edge color attribute updated → paint required
      },
      getRenderState: () => ({
        renderLinks: edgeLines !== null && edgeLines.visible === true && edgeCount > 0,
        linkCount: edgeCount,
        hasLineGeometry: edgeGeometry !== null,
        positionAttributeLength: edgePositions ? edgePositions.length : 0,
        colorAttributeLength: edgeColors ? edgeColors.length : 0,
        ...getNodeColorRenderStats(),
      }),
    };

    handleRef.current = handle;
    props.onHandleReady(handle);

    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------

    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
      if (moveRafId !== null) cancelAnimationFrame(moveRafId);
      canvas.removeEventListener("click", onClickHandler);
      canvas.removeEventListener("pointermove", onPointerMove);
      resizeObserver.disconnect();
      container.removeChild(canvas);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (edgeLines) {
        scene.remove(edgeLines);
        edgeGeometry?.dispose();
        (edgeLines.material as THREE.Material).dispose();
      }
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleRef.current?.setColors(props.nodeColors);
  }, [props.nodeColors]);

  return null;
}
