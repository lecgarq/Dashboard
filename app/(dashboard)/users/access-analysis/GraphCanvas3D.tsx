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

import { useEffect, type RefObject } from "react";
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
  onHandleReady: (h: GraphCanvas3DHandle) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Dim factor applied to per-instance colors when alphaMask[i] < 0.99 */
const DIM = 0.15;

export function GraphCanvas3D(props: GraphCanvas3DProps): null {
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
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true });
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

    // We keep a local copy of the current base colors so applyAlphaMask can re-multiply
    let currentNodeColors = props.nodeColors;

    function loadColors(rgba: Float32Array): void {
      for (let i = 0; i < n; i++) {
        instanceColorData[i * 3]     = rgba[i * 4];
        instanceColorData[i * 3 + 1] = rgba[i * 4 + 1];
        instanceColorData[i * 3 + 2] = rgba[i * 4 + 2];
      }
      mesh.instanceColor!.needsUpdate = true;
    }

    loadColors(currentNodeColors);

    // -----------------------------------------------------------------------
    // Handle implementation
    // -----------------------------------------------------------------------

    let fitted3D = false;
    function pumpPositions3D(xyz: Float32Array): void {
      for (let i = 0; i < n; i++) {
        dummy.position.set(xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
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
      for (let i = 0; i < n; i++) {
        const lit = mask[i] >= 0.99 ? 1.0 : DIM;
        instanceColorData[i * 3]     = currentNodeColors[i * 4]     * lit;
        instanceColorData[i * 3 + 1] = currentNodeColors[i * 4 + 1] * lit;
        instanceColorData[i * 3 + 2] = currentNodeColors[i * 4 + 2] * lit;
      }
      mesh.instanceColor!.needsUpdate = true;
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
      controls.update();
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
      fitView();
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
        loadColors(rgba);
      },
      fitView,
      setBackground: (color) => {
        scene.background = new THREE.Color(color);
      },
      getCamera: () => camera,
      // Phase 4-01 Task 2 — ref-indirection (Pitfall 5). No config re-issue ever.
      setEventHandlers: (h: GraphEventHandlers) => {
        handlersRef.current = h;
      },
    };

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
