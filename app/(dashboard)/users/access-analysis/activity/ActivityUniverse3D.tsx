"use client";

/**
 * ActivityUniverse3D — experimental 3D arm of the activity universe.
 *
 * Renders the CURRENT sampled set as a single-draw-call GPU point cloud
 * (THREE.Points + ShaderMaterial) with damped OrbitControls, following the
 * PersonGraph3D projector pattern: positions are STATIC, the render loop is
 * gated to paint only when the camera moves or the data changes.
 *
 * x/y are the payload's precomputed 2D embedding; z is event time
 * (buildActivityDepth) — a space-time cube, not a fake extrusion. Colors and
 * sizes are the same buffers the 2D canvas renders, so filters, color-by, and
 * temporal selection carry over 1:1.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const VERT = `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uSizeScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uSizeScale / -mv.z, 1.5, 40.0);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
varying vec4 vColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  float a = smoothstep(0.25, 0.16, r) * vColor.a;
  gl_FragColor = vec4(vColor.rgb, a);
}`;

export interface ActivityUniverse3DProps {
  /** Stride-2 x/y of the sampled set (the 2D embedding). */
  positions2: Float32Array;
  /** Per-point z (time axis), aligned to positions2. */
  depth: Float32Array;
  /** Stride-4 RGBA 0–1, aligned. */
  colors4: Float32Array;
  /** Per-point size, aligned. */
  sizes: Float32Array;
  backgroundColor: string;
}

export function ActivityUniverse3D({
  positions2,
  depth,
  colors4,
  sizes,
  backgroundColor,
}: ActivityUniverse3DProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    points?: THREE.Points;
    geom?: THREE.BufferGeometry;
    raf: number;
    dirty: boolean;
    ro?: ResizeObserver;
  } | null>(null);

  // One-time scene setup (PersonGraph3D pattern: render-gated loop).
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

    const ctx = { renderer, scene, camera, controls, raf: 0, dirty: true } as NonNullable<
      typeof three.current
    >;
    three.current = ctx;

    const loop = (): void => {
      ctx.raf = requestAnimationFrame(loop);
      const moved = controls.update();
      if (!moved && !ctx.dirty) return;
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
      ctx.geom?.dispose();
      (ctx.points?.material as THREE.Material | undefined)?.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      three.current = null;
    };
  }, []);

  useEffect(() => {
    const ctx = three.current;
    if (!ctx) return;
    ctx.renderer.setClearColor(new THREE.Color(backgroundColor), 1);
    ctx.dirty = true;
  }, [backgroundColor]);

  // (Re)build the point cloud whenever the sampled buffers change.
  useEffect(() => {
    const ctx = three.current;
    if (!ctx) return;
    const n = positions2.length / 2;
    if (ctx.points) {
      ctx.scene.remove(ctx.points);
      ctx.geom?.dispose();
      (ctx.points.material as THREE.Material).dispose();
      ctx.points = undefined;
      ctx.geom = undefined;
    }
    if (n === 0) {
      ctx.dirty = true;
      return;
    }

    const pos = new Float32Array(n * 3);
    let maxAbs = 1;
    for (let i = 0; i < n; i++) {
      const x = positions2[i * 2];
      const y = positions2[i * 2 + 1];
      const z = depth[i] ?? 0;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y), Math.abs(z));
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geom.setAttribute("aColor", new THREE.BufferAttribute(colors4, 4));
    geom.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uSizeScale: { value: maxAbs * 1.5 } },
      transparent: true,
      depthWrite: false,
    });
    const points = new THREE.Points(geom, material);
    ctx.scene.add(points);
    ctx.points = points;
    ctx.geom = geom;

    // Fit the camera to the data extent on every rebuild (extent shifts with filters).
    ctx.camera.position.set(0, 0, maxAbs * 2.4);
    ctx.camera.near = maxAbs / 1000;
    ctx.camera.far = maxAbs * 40;
    ctx.camera.updateProjectionMatrix();
    ctx.controls.target.set(0, 0, 0);
    ctx.controls.update();
    ctx.dirty = true;
  }, [positions2, depth, colors4, sizes]);

  return (
    <div
      ref={containerRef}
      data-testid="activity-universe-3d"
      className="absolute inset-0"
    />
  );
}
