"use client";

/**
 * ActivityUniverse3D — the 3D arm of the activity universe.
 *
 * Renders the CURRENT sampled set as a GPU point cloud (THREE.Points +
 * ShaderMaterial) plus same-author links (THREE.LineSegments), with damped
 * OrbitControls and a slow idle auto-orbit for a living, floating feel.
 *
 * Positions are the true 3D PaCMAP embedding when the payload carries it
 * (positions3), with the month-depth cube as the disclosed fallback. The
 * group-by/strength morph runs ENTIRELY on the GPU: base positions and clump
 * targets are two vertex attributes and the slider only moves a uMix uniform
 * (eased per frame) — zero per-frame CPU buffer writes, so the morph stays
 * smooth at any point count. Links carry the same attribute pair and ride the
 * morph in lockstep.
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildClumpTargets } from "./activityClump3";

const POINT_VERT = `
attribute vec3 aTarget;
attribute float aSize;
attribute vec4 aColor;
attribute float aSelected;
varying vec4 vColor;
varying float vSelected;
uniform float uSizeScale;
uniform float uMix;
uniform float uHasSelection;
void main() {
  vColor = aColor;
  vSelected = aSelected;
  vec3 p = mix(position, aTarget, uMix);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // Selected points swell slightly; a live selection shrinks the rest.
  float sizeMul = mix(1.0, aSelected > 0.5 ? 1.6 : 0.85, uHasSelection);
  gl_PointSize = clamp(aSize * sizeMul * uSizeScale / -mv.z, 1.25, 26.0);
  gl_Position = projectionMatrix * mv;
}`;

const POINT_FRAG = `
varying vec4 vColor;
varying float vSelected;
uniform float uHasSelection;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  float a = smoothstep(0.25, 0.16, r) * vColor.a;
  // Dim everything that is not in the selection once a selection exists.
  float dim = mix(1.0, vSelected > 0.5 ? 1.0 : 0.12, uHasSelection);
  gl_FragColor = vec4(vColor.rgb, a * dim);
}`;

const LINK_VERT = `
attribute vec3 aTarget;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uMix;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(mix(position, aTarget, uMix), 1.0);
}`;

const LINK_FRAG = `
varying vec4 vColor;
uniform float uOpacity;
void main() { gl_FragColor = vec4(vColor.rgb, vColor.a * uOpacity); }`;

const AUTOROTATE_SPEED = 0.35;
const AUTOROTATE_RESUME_MS = 4_000;

export interface ActivityUniverse3DProps {
  /** Stride-3 xyz of the sampled set (true 3D embedding or month-depth fallback). */
  positions3: Float32Array;
  /** Stride-4 RGBA 0–1, aligned. */
  colors4: Float32Array;
  /** Per-point size, aligned. */
  sizes: Float32Array;
  /** Same-author links as rendered-index pairs (2 entries per link; cosmos ships f32). */
  links: Float32Array | Uint32Array | number[];
  /** Per-point group-by category ids (null = no grouping). */
  groupCatIds: Uint16Array | null;
  /** Dimensions-panel strength 0–100 → morph mix. */
  strength: number;
  backgroundColor: string;
  reducedMotion: boolean;
  /** Imperative handle for the 3D lasso (project → screen hit-test + controls freeze). */
  onHandleReady?: (handle: ActivityUniverse3DHandle) => void;
}

export interface ActivityUniverse3DHandle {
  /**
   * Project every rendered point through the live camera (using the CURRENT
   * morph mix) into the overlay's screen space and return the rendered indices
   * whose projection falls inside the lasso polygon. Behind-camera points are
   * excluded.
   */
  findPointsInPolygon: (path: [number, number][], width: number, height: number) => number[];
  /**
   * Nearest rendered point within radiusPx of the given screen coord, through
   * the live camera at the CURRENT morph mix (the 3D magnetic-hover seam).
   * Returns the rendered index plus its projected screen position, or null.
   */
  findNearestPoint: (
    x: number,
    y: number,
    width: number,
    height: number,
    radiusPx: number,
  ) => { index: number; screenXY: [number, number] } | null;
  /** Freeze/thaw OrbitControls so a lasso drag selects instead of rotating. */
  setControlsEnabled: (enabled: boolean) => void;
  /** Highlight the selected rendered indices (dims the rest); [] clears. */
  setSelectedIndices: (indices: number[]) => void;
}

/** Even-odd ray-cast point-in-polygon on screen coords. */
function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

interface ThreeCtx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  points?: THREE.Points;
  pointGeom?: THREE.BufferGeometry;
  pointMat?: THREE.ShaderMaterial;
  lines?: THREE.LineSegments;
  lineGeom?: THREE.BufferGeometry;
  lineMat?: THREE.ShaderMaterial;
  raf: number;
  dirty: boolean;
  uMix: number;
  uMixGoal: number;
  resumeAt: number;
  fitted: boolean;
  ro?: ResizeObserver;
}

export function ActivityUniverse3D({
  positions3,
  colors4,
  sizes,
  links,
  groupCatIds,
  strength,
  backgroundColor,
  reducedMotion,
  onHandleReady,
}: ActivityUniverse3DProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const three = useRef<ThreeCtx | null>(null);
  const targets = useMemo(
    () => buildClumpTargets(positions3, groupCatIds),
    [positions3, groupCatIds],
  );
  // Live selection attribute (per rendered point), reused across rebuilds.
  const selectedAttrRef = useRef<Float32Array>(new Float32Array(0));

  // One-time scene setup. The loop renders only while something is animating:
  // camera damping/auto-orbit, an unsettled uMix ease, or an explicit dirty.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      el.clientWidth / Math.max(1, el.clientHeight),
      0.1,
      1_000_000,
    );

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.9;
    controls.zoomSpeed = 0.9;

    const ctx: ThreeCtx = {
      renderer,
      scene,
      camera,
      controls,
      raf: 0,
      dirty: true,
      uMix: 0,
      uMixGoal: 0,
      resumeAt: 0,
      fitted: false,
    };
    three.current = ctx;

    // Idle auto-orbit (marble feel); user interaction pauses it, idle resumes it.
    controls.autoRotate = !reducedMotion;
    controls.autoRotateSpeed = AUTOROTATE_SPEED;
    controls.addEventListener("start", () => {
      controls.autoRotate = false;
      ctx.resumeAt = performance.now() + AUTOROTATE_RESUME_MS;
    });

    const loop = (): void => {
      ctx.raf = requestAnimationFrame(loop);
      if (!reducedMotion && !controls.autoRotate && ctx.resumeAt > 0 && performance.now() >= ctx.resumeAt) {
        controls.autoRotate = true;
        ctx.resumeAt = 0;
      }
      const moved = controls.update();
      const delta = ctx.uMixGoal - ctx.uMix;
      let mixing = false;
      if (Math.abs(delta) > 0.0005) {
        ctx.uMix = reducedMotion ? ctx.uMixGoal : ctx.uMix + delta * 0.14;
        if (ctx.pointMat) ctx.pointMat.uniforms.uMix.value = ctx.uMix;
        if (ctx.lineMat) ctx.lineMat.uniforms.uMix.value = ctx.uMix;
        mixing = true;
      }
      if (!moved && !mixing && !ctx.dirty) return;
      ctx.dirty = false;
      renderer.render(scene, camera);
    };
    ctx.raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      ctx.dirty = true;
    });
    ro.observe(el);
    ctx.ro = ro;

    return () => {
      cancelAnimationFrame(ctx.raf);
      ro.disconnect();
      controls.dispose();
      ctx.pointGeom?.dispose();
      ctx.pointMat?.dispose();
      ctx.lineGeom?.dispose();
      ctx.lineMat?.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      three.current = null;
    };
  }, [reducedMotion]);

  useEffect(() => {
    const ctx = three.current;
    if (!ctx) return;
    ctx.renderer.setClearColor(new THREE.Color(backgroundColor), 1);
    ctx.dirty = true;
  }, [backgroundColor]);

  // (Re)build point + link geometry whenever the sampled set changes.
  useEffect(() => {
    const ctx = three.current;
    if (!ctx) return;
    const n = positions3.length / 3;

    if (ctx.points) {
      ctx.scene.remove(ctx.points);
      ctx.pointGeom?.dispose();
      ctx.pointMat?.dispose();
      ctx.points = undefined;
    }
    if (ctx.lines) {
      ctx.scene.remove(ctx.lines);
      ctx.lineGeom?.dispose();
      ctx.lineMat?.dispose();
      ctx.lines = undefined;
    }
    if (n === 0) {
      ctx.dirty = true;
      return;
    }

    let maxAbs = 1;
    for (let i = 0; i < positions3.length; i++) {
      const a = Math.abs(positions3[i]);
      if (a > maxAbs) maxAbs = a;
    }

    // Selection attribute persists across rebuilds only when the count matches;
    // a genuine set swap resets it (stale rendered indices would mislead).
    if (selectedAttrRef.current.length !== n) selectedAttrRef.current = new Float32Array(n);
    const pointGeom = new THREE.BufferGeometry();
    pointGeom.setAttribute("position", new THREE.BufferAttribute(positions3, 3));
    pointGeom.setAttribute("aTarget", new THREE.BufferAttribute(targets, 3));
    pointGeom.setAttribute("aColor", new THREE.BufferAttribute(colors4, 4));
    pointGeom.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    pointGeom.setAttribute("aSelected", new THREE.BufferAttribute(selectedAttrRef.current, 1));
    const hasSelection = selectedAttrRef.current.some((v) => v > 0.5) ? 1 : 0;
    const pointMat = new THREE.ShaderMaterial({
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      uniforms: {
        uSizeScale: { value: maxAbs * 0.9 },
        uMix: { value: three.current?.uMix ?? 0 },
        uHasSelection: { value: hasSelection },
      },
      transparent: true,
      depthWrite: false,
    });
    const points = new THREE.Points(pointGeom, pointMat);
    ctx.scene.add(points);
    ctx.points = points;
    ctx.pointGeom = pointGeom;
    ctx.pointMat = pointMat;

    // Same-author links: two vertices per link, colors from their endpoints.
    const linkCount = links.length / 2;
    if (linkCount > 0) {
      const lp = new Float32Array(linkCount * 2 * 3);
      const lt = new Float32Array(linkCount * 2 * 3);
      const lc = new Float32Array(linkCount * 2 * 4);
      for (let l = 0; l < linkCount; l++) {
        for (let e = 0; e < 2; e++) {
          const p = links[l * 2 + e];
          const v = l * 2 + e;
          for (let k = 0; k < 3; k++) {
            lp[v * 3 + k] = positions3[p * 3 + k];
            lt[v * 3 + k] = targets[p * 3 + k];
          }
          for (let k = 0; k < 4; k++) lc[v * 4 + k] = colors4[p * 4 + k];
        }
      }
      const lineGeom = new THREE.BufferGeometry();
      lineGeom.setAttribute("position", new THREE.BufferAttribute(lp, 3));
      lineGeom.setAttribute("aTarget", new THREE.BufferAttribute(lt, 3));
      lineGeom.setAttribute("aColor", new THREE.BufferAttribute(lc, 4));
      const lineMat = new THREE.ShaderMaterial({
        vertexShader: LINK_VERT,
        fragmentShader: LINK_FRAG,
        uniforms: { uMix: { value: three.current?.uMix ?? 0 }, uOpacity: { value: 0.16 } },
        transparent: true,
        depthWrite: false,
      });
      const lines = new THREE.LineSegments(lineGeom, lineMat);
      ctx.scene.add(lines);
      ctx.lines = lines;
      ctx.lineGeom = lineGeom;
      ctx.lineMat = lineMat;
    }

    // Fit the camera once — later set swaps keep the user's viewpoint (same
    // embedding space); only the size scale re-tunes.
    if (!ctx.fitted) {
      ctx.camera.position.set(0, 0, maxAbs * 2.4);
      ctx.camera.near = maxAbs / 1000;
      ctx.camera.far = maxAbs * 40;
      ctx.camera.updateProjectionMatrix();
      ctx.controls.target.set(0, 0, 0);
      ctx.controls.update();
      ctx.fitted = true;
    }
    ctx.dirty = true;
    // Colors/targets rebuild here too, but their PROP changes alone update the
    // live attributes in place below — no geometry churn, no camera jump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions3, sizes, links]);

  // Color-by swap: overwrite color attributes in place (points + link endpoints).
  useEffect(() => {
    const ctx = three.current;
    const attr = ctx?.pointGeom?.getAttribute("aColor") as THREE.BufferAttribute | undefined;
    if (!ctx || !attr || attr.array.length !== colors4.length) return;
    (attr.array as Float32Array).set(colors4);
    attr.needsUpdate = true;
    const lattr = ctx.lineGeom?.getAttribute("aColor") as THREE.BufferAttribute | undefined;
    if (lattr) {
      const lc = lattr.array as Float32Array;
      const linkCount = links.length / 2;
      for (let l = 0; l < linkCount; l++) {
        for (let e = 0; e < 2; e++) {
          const p = links[l * 2 + e];
          const v = l * 2 + e;
          for (let k = 0; k < 4; k++) lc[v * 4 + k] = colors4[p * 4 + k];
        }
      }
      lattr.needsUpdate = true;
    }
    ctx.dirty = true;
  }, [colors4, links]);

  // Group-by swap: overwrite morph targets in place (points + link endpoints).
  useEffect(() => {
    const ctx = three.current;
    const attr = ctx?.pointGeom?.getAttribute("aTarget") as THREE.BufferAttribute | undefined;
    if (!ctx || !attr || attr.array.length !== targets.length) return;
    (attr.array as Float32Array).set(targets);
    attr.needsUpdate = true;
    const lattr = ctx.lineGeom?.getAttribute("aTarget") as THREE.BufferAttribute | undefined;
    if (lattr) {
      const lt = lattr.array as Float32Array;
      const linkCount = links.length / 2;
      for (let l = 0; l < linkCount; l++) {
        for (let e = 0; e < 2; e++) {
          const p = links[l * 2 + e];
          const v = l * 2 + e;
          for (let k = 0; k < 3; k++) lt[v * 3 + k] = targets[p * 3 + k];
        }
      }
      lattr.needsUpdate = true;
    }
    ctx.dirty = true;
  }, [targets, links]);

  // Strength slider → eased uMix goal (the loop tweens the uniform).
  useEffect(() => {
    const ctx = three.current;
    if (!ctx) return;
    ctx.uMixGoal = Math.max(0, Math.min(1, strength / 100));
    ctx.dirty = true;
  }, [strength]);

  // Publish the imperative handle once (reads live geometry/camera at call time,
  // so it stays correct across rebuilds, morphs, and orbits).
  useEffect(() => {
    if (!onHandleReady) return;
    const proj = new THREE.Vector3();
    const vpMatrix = new THREE.Matrix4();
    const handle: ActivityUniverse3DHandle = {
      findPointsInPolygon: (path, width, height) => {
        const ctx = three.current;
        const geom = ctx?.pointGeom;
        if (!ctx || !geom || path.length < 3) return [];
        const pos = geom.getAttribute("position").array as Float32Array;
        const tgt = geom.getAttribute("aTarget").array as Float32Array;
        const mix = ctx.uMix;
        ctx.camera.updateMatrixWorld();
        const out: number[] = [];
        const n = pos.length / 3;
        for (let i = 0; i < n; i++) {
          const b = i * 3;
          proj.set(
            pos[b] + (tgt[b] - pos[b]) * mix,
            pos[b + 1] + (tgt[b + 1] - pos[b + 1]) * mix,
            pos[b + 2] + (tgt[b + 2] - pos[b + 2]) * mix,
          );
          proj.project(ctx.camera);
          if (proj.z > 1 || proj.z < -1) continue; // outside the near/far frustum
          const sx = (proj.x * 0.5 + 0.5) * width;
          const sy = (-proj.y * 0.5 + 0.5) * height;
          if (pointInPolygon(sx, sy, path)) out.push(i);
        }
        return out;
      },
      findNearestPoint: (x, y, width, height, radiusPx) => {
        const ctx = three.current;
        const geom = ctx?.pointGeom;
        if (!ctx || !geom) return null;
        const pos = geom.getAttribute("position").array as Float32Array;
        const tgt = geom.getAttribute("aTarget").array as Float32Array;
        const mix = ctx.uMix;
        // Runs every rAF tick while the pointer is inside — one combined
        // view-projection matrix and inline math keep 200k points in ~a ms.
        ctx.camera.updateMatrixWorld();
        vpMatrix
          .copy(ctx.camera.projectionMatrix)
          .multiply(ctx.camera.matrixWorldInverse);
        const e = vpMatrix.elements;
        const n = pos.length / 3;
        let best = -1;
        let bestSq = radiusPx * radiusPx;
        let bx = 0;
        let by = 0;
        for (let i = 0; i < n; i++) {
          const b = i * 3;
          const px = pos[b] + (tgt[b] - pos[b]) * mix;
          const py = pos[b + 1] + (tgt[b + 1] - pos[b + 1]) * mix;
          const pz = pos[b + 2] + (tgt[b + 2] - pos[b + 2]) * mix;
          const w = e[3] * px + e[7] * py + e[11] * pz + e[15];
          if (w <= 0) continue; // behind the camera
          const cz = (e[2] * px + e[6] * py + e[10] * pz + e[14]) / w;
          if (cz > 1 || cz < -1) continue; // outside the near/far frustum
          const cx = (e[0] * px + e[4] * py + e[8] * pz + e[12]) / w;
          const cy = (e[1] * px + e[5] * py + e[9] * pz + e[13]) / w;
          const sx = (cx * 0.5 + 0.5) * width;
          const sy = (-cy * 0.5 + 0.5) * height;
          const d = (sx - x) * (sx - x) + (sy - y) * (sy - y);
          if (d < bestSq) {
            bestSq = d;
            best = i;
            bx = sx;
            by = sy;
          }
        }
        return best < 0 ? null : { index: best, screenXY: [bx, by] };
      },
      setControlsEnabled: (enabled) => {
        const ctx = three.current;
        if (!ctx) return;
        ctx.controls.enabled = enabled;
        if (!enabled) ctx.controls.autoRotate = false; // never spin mid-lasso
        ctx.dirty = true;
      },
      setSelectedIndices: (indices) => {
        const ctx = three.current;
        const attr = ctx?.pointGeom?.getAttribute("aSelected") as THREE.BufferAttribute | undefined;
        if (!ctx || !attr) return;
        const arr = attr.array as Float32Array;
        arr.fill(0);
        for (const i of indices) if (i >= 0 && i < arr.length) arr[i] = 1;
        attr.needsUpdate = true;
        if (ctx.pointMat) ctx.pointMat.uniforms.uHasSelection.value = indices.length > 0 ? 1 : 0;
        ctx.dirty = true;
      },
    };
    onHandleReady(handle);
  }, [onHandleReady]);

  return (
    <div ref={containerRef} data-testid="activity-universe-3d" className="absolute inset-0" />
  );
}
