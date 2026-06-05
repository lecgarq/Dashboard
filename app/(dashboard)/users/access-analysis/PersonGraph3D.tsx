"use client";

/**
 * PersonGraph3D — static 3D embedding projector (LOOK AND FEEL 2 / TF Embedding Projector).
 *
 * Renders the precomputed `nodes3d` positions as a single-draw-call GPU point cloud (THREE.Points
 * + ShaderMaterial) with damped OrbitControls. Positions are STATIC (no physics) so the only
 * per-frame work is the camera; the render loop is gated to paint only when the camera moves or
 * the data changes → fluid orbit, zero lag, regardless of node count.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { trpc } from "@/lib/core/trpc";

type Node3D = { id: string; name: string; x: number; y: number; z: number; cluster: number; size: number };
type Cluster = { idx: number; label: string; color: string; count: number };

const VERT = `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
uniform float uSizeScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uSizeScale / -mv.z, 2.0, 46.0);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  float a = smoothstep(0.25, 0.16, r);
  gl_FragColor = vec4(vColor, a);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace("#", "");
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
}

export function PersonGraph3D() {
  const [k, setK] = useState(8);
  const { data } = trpc.accPersonGraph.snapshot.useQuery({ k });
  const containerRef = useRef<HTMLDivElement>(null);

  // three.js objects that persist across renders
  const three = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
    controls: OrbitControls; points?: THREE.Points; geom?: THREE.BufferGeometry;
    raf: number; dirty: boolean; ro?: ResizeObserver;
  } | null>(null);

  // one-time scene setup
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, el.clientWidth / Math.max(1, el.clientHeight), 1, 100_000);
    camera.position.set(0, 0, 1850);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.9;
    controls.zoomSpeed = 0.9;

    const ctx = { renderer, scene, camera, controls, raf: 0, dirty: true } as NonNullable<typeof three.current>;
    three.current = ctx;

    const loop = () => {
      ctx.raf = requestAnimationFrame(loop);
      const moved = controls.update();           // true when damping advances the camera
      if (!moved && !ctx.dirty) return;          // render-gating → no wasted frames
      ctx.dirty = false;
      renderer.render(scene, camera);
    };
    ctx.raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); ctx.dirty = true;
    });
    ro.observe(el); ctx.ro = ro;

    return () => {
      cancelAnimationFrame(ctx.raf); ro.disconnect(); controls.dispose();
      ctx.geom?.dispose(); (ctx.points?.material as THREE.Material | undefined)?.dispose();
      renderer.dispose(); el.removeChild(renderer.domElement); three.current = null;
    };
  }, []);

  // (re)build the point cloud whenever the snapshot data changes
  useEffect(() => {
    const ctx = three.current; if (!ctx || !data) return;
    const nodes = data.nodes3d as Node3D[]; const clusters = data.clusters as Cluster[];
    if (!nodes?.length) return;
    const colorByCluster = clusters.map((c) => hexToRgb(c.color));

    const n = nodes.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), siz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      pos[i * 3] = nd.x; pos[i * 3 + 1] = nd.y; pos[i * 3 + 2] = nd.z;
      const rgb = colorByCluster[nd.cluster] ?? [1, 1, 1];
      col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2];
      siz[i] = nd.size;
    }

    if (ctx.points) { ctx.scene.remove(ctx.points); ctx.geom?.dispose(); (ctx.points.material as THREE.Material).dispose(); }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geom.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geom.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uSizeScale: { value: 4200 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
    });
    const points = new THREE.Points(geom, mat);
    ctx.scene.add(points); ctx.points = points; ctx.geom = geom; ctx.dirty = true;

    (window as unknown as { __ACC_PERSON_GRAPH_TEST__?: object }).__ACC_PERSON_GRAPH_TEST__ = {
      isReady: () => true, getNodeCount: () => n, getK: () => data.k,
    };
  }, [data]);

  const clusters = useMemo(() => (data?.clusters as Cluster[] | undefined) ?? [], [data]);

  return (
    <div className="relative h-full w-full bg-[#070709]">
      <div ref={containerRef} className="absolute inset-0" data-testid="person-graph-3d" />
      <div className="pointer-events-auto absolute left-3 top-3 flex items-center gap-2 rounded bg-zinc-900/70 px-2 py-1 text-xs text-zinc-300">
        <span>Clusters: {k}</span>
        <input type="range" min={6} max={16} step={2} value={k} onChange={(e) => setK(+e.target.value)} data-testid="cluster-slider" />
      </div>
      {clusters.length > 0 && (
        <div className="pointer-events-none absolute right-3 top-3 flex max-w-[40%] flex-wrap justify-end gap-x-3 gap-y-1 text-[11px] text-zinc-300">
          {clusters.map((c) => (
            <span key={c.idx} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />{c.label} ({c.count})
            </span>
          ))}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-zinc-500">drag to orbit · scroll to zoom</div>
    </div>
  );
}
