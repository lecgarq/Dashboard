"use client";

/**
 * ScaleSpikeClient.tsx — Phase-37 SCALE-01 render-track harness.
 *
 * Mounts the production GraphCanvas2D (cosmos.gl v3) with a deterministic
 * synthetic point set at real corpus scale and exposes `window.__SCALE_SPIKE__`
 * so the 37-04 Playwright spec (or a human at the console) can drive scenarios
 * and read measurements. Dev surface: reachable only behind
 * NEXT_PUBLIC_ACC_SCALE_SPIKE=1 (page.tsx gate) — zero production impact.
 *
 * Scenarios (each samples rAF frame deltas ≥10 s, LIFE-03 methodology):
 *   rest       — no per-frame work. NOTE: cosmos draws on demand, so rest fps
 *                can reflect idle rAF cadence; pan/zoom + ambient are the
 *                load-bearing numbers. Recorded honestly with this caveat.
 *   panzoom    — per-frame programmatic camera oscillation (restoreView).
 *   cpuAmbient — per-frame sin/cos offsets written into a stride-3 buffer then
 *                handle.pushPositions — the CPU full-set ceiling measurement
 *                (expected to fail the 50 fps bar at 4.86M; documents why).
 *   gpuDrift   — requires ?gpu=1: cosmos GPU force sim owns motion, no CPU
 *                per-node work (the L0 hope).
 */

import { useEffect, useRef, useState } from "react";
import { GraphCanvas2D, type GraphCanvas2DHandle } from "../access-analysis/GraphCanvas2D";
import { createAmbientFpsController, type AmbientTier } from "../access-analysis/ambientMotion";
import { decodeColumnarPayload } from "@/lib/acc/columnarPayload";
import { createSpikePhysicsStub } from "./spikePhysicsStub";
import {
  SPIKE_DEFAULT_COUNT,
  SPIKE_DEFAULT_SEED,
  colorsFromVerbColumn,
  generateSpikeAttributes,
  generateSpikePositions,
  type SpikeAttributeColumns,
} from "./spikeSynthetic";

const SAMPLE_MS = 12_000;
const ZINC_BG = "#09090B";

interface ScenarioResult {
  scenario: string;
  durationMs: number;
  frames: number;
  medianFps: number;
  minWindowFps: number;
  windowFps: number[];
  /** Verdict of the production three-tier controller fed the same windows. */
  controllerTier: AmbientTier;
  note?: string;
}

interface PayloadResult {
  bytesOnWire: number;
  contentLength: number | null;
  fetchMs: number;
  decodeMs: number;
  deriveColorsMs: number;
  uploadMs: number;
  totalMs: number;
  count: number;
}

interface SpikeBridge {
  isReady(): boolean;
  getInfo(): Record<string, unknown>;
  runScenario(name: string, durationMs?: number): Promise<ScenarioResult>;
  /** SCALE-01 track (b): fetch → decode → GPU-upload timing of the binary columnar route. */
  runPayload(n?: number): Promise<PayloadResult>;
  getResults(): Record<string, unknown>;
  setResult(key: string, value: unknown): void;
}

declare global {
  interface Window {
    __SCALE_SPIKE__?: SpikeBridge;
  }
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

/** Renderer string via a throwaway context — never pokes cosmos's canvas. */
function readRendererInfo(): { renderer: string | null; vendor: string | null } {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    if (!gl) return { renderer: null, vendor: null };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    const vendor = ext
      ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL))
      : String(gl.getParameter(gl.VENDOR));
    return { renderer, vendor };
  } catch {
    return { renderer: null, vendor: null };
  }
}

export interface ScaleSpikeClientProps {
  count: number;
  seed: number;
  gpu: boolean;
}

interface SpikeData {
  positions: Float32Array;
  attributes: SpikeAttributeColumns;
  colors: Float32Array;
  genMs: number;
  allocBytes: number;
}

export function ScaleSpikeClient(props: ScaleSpikeClientProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<GraphCanvas2DHandle | null>(null);
  const [data, setData] = useState<SpikeData | null>(null);
  const [status, setStatus] = useState("generating synthetic set…");
  // Mutable measurement store the bridge closes over.
  const resultsRef = useRef<Record<string, unknown>>({
    contextLossEvents: [] as Array<{ type: string; atMs: number }>,
  });

  // ---- Generate the synthetic set once (blocking; genMs recorded honestly) ----
  useEffect(() => {
    const t0 = performance.now();
    const positions = generateSpikePositions(props.count, props.seed);
    const attributes = generateSpikeAttributes(props.count, props.seed);
    const colors = colorsFromVerbColumn(attributes.verbId);
    const genMs = performance.now() - t0;
    const allocBytes =
      positions.byteLength +
      colors.byteLength +
      attributes.verbId.byteLength +
      attributes.objectTypeId.byteLength +
      attributes.projectId.byteLength +
      attributes.authorId.byteLength +
      attributes.month.byteLength;
    setData({ positions, attributes, colors, genMs, allocBytes });
    setStatus(`generated ${props.count.toLocaleString()} points in ${Math.round(genMs)} ms`);
  }, [props.count, props.seed]);

  // Live data ref for the mount-once bridge closure (set after generation below).
  const dataRef = useRef<SpikeData | null>(null);
  dataRef.current = data;

  // ---- Bridge (installed immediately; isReady flips when the handle lands) ----
  useEffect(() => {
    const bridge: SpikeBridge = {
      isReady: () => handleRef.current !== null,
      getInfo: () => ({
        count: props.count,
        seed: props.seed,
        gpu: props.gpu,
        genMs: dataRef.current?.genMs ?? null,
        jsAllocBytes: dataRef.current?.allocBytes ?? null,
        // Theoretical cosmos-side buffers (positions stride-2 f32 + colors rgba f32) —
        // labeled estimate; true VRAM is not browser-readable.
        estimatedGpuBufferBytes: props.count * 2 * 4 + props.count * 4 * 4,
        ...readRendererInfo(),
        jsHeapUsed:
          (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory
            ?.usedJSHeapSize ?? null,
      }),
      async runScenario(name: string, durationMs = SAMPLE_MS): Promise<ScenarioResult> {
        const handle = handleRef.current;
        const d = dataRef.current;
        if (!handle || !d) throw new Error("scale-spike: not ready");
        const n = d.positions.length / 3;

        // Per-frame work per scenario ------------------------------------
        let perFrame: ((nowMs: number, elapsedMs: number) => void) | null = null;
        let note: string | undefined;

        if (name === "rest") {
          note =
            "cosmos draws on demand — rest fps can reflect idle rAF cadence, not render cost";
        } else if (name === "panzoom") {
          const baseZoom = handle.getZoomLevel?.() ?? 1;
          perFrame = (_now, elapsed) => {
            const t = elapsed / 1000;
            handle.restoreView?.(
              {
                center: [Math.sin(t * 0.7) * 180, Math.cos(t * 0.5) * 180],
                zoom: baseZoom * (1.2 + Math.sin(t * 0.9) * 0.9),
              },
              0,
            );
          };
        } else if (name === "cpuAmbient") {
          if (props.gpu) {
            note = "cpuAmbient skipped under ?gpu=1 (pushPositions gated off in GPU mode)";
          } else {
            // Full-set CPU choreography — the honest ceiling measurement.
            const anchors = d.positions; // original stride-3 anchors
            const scratch = new Float32Array(anchors.length);
            perFrame = (_now, elapsed) => {
              const t = elapsed / 1000;
              for (let i = 0; i < n; i++) {
                const j = i * 3;
                const phase = (i % 628) * 0.01;
                const amp = 2.4;
                scratch[j] = anchors[j] + Math.cos(phase + t) * amp;
                scratch[j + 1] = anchors[j + 1] + Math.sin(phase * 0.83 + t) * amp * 0.72;
                // z stays anchors[j+2] (0)
              }
              handle.pushPositions(scratch);
            };
          }
        } else if (name === "gpuDrift") {
          if (!props.gpu) {
            note = "gpuDrift requires ?gpu=1 — sampled anyway (frozen mode, no drift)";
          } else {
            note = "cosmos GPU force sim owns motion; zero CPU per-node work";
          }
        } else {
          throw new Error(`scale-spike: unknown scenario "${name}"`);
        }

        // Sampler: rAF deltas → instantaneous fps (median) + 1 s window fps (min),
        // windows also fed to the PRODUCTION tier controller for its verdict.
        const controller = createAmbientFpsController(0);
        const instFps: number[] = [];
        const windowFps: number[] = [];
        const result = await new Promise<Omit<ScenarioResult, "scenario" | "note">>((resolve) => {
          let start: number | null = null;
          let last: number | null = null;
          let frames = 0;
          let windowStart = 0;
          let windowFrames = 0;
          const tick = (now: number): void => {
            if (start === null) {
              start = now;
              last = now;
              windowStart = now;
              requestAnimationFrame(tick);
              return;
            }
            const elapsed = now - start;
            const delta = now - (last as number);
            last = now;
            frames += 1;
            windowFrames += 1;
            if (delta > 0) instFps.push(1000 / delta);
            if (now - windowStart >= 1000) {
              const wfps = (windowFrames * 1000) / (now - windowStart);
              windowFps.push(wfps);
              controller.observeWindow(wfps, now - windowStart);
              windowStart = now;
              windowFrames = 0;
            }
            perFrame?.(now, elapsed);
            if (elapsed >= durationMs) {
              resolve({
                durationMs: elapsed,
                frames,
                medianFps: Math.round(median(instFps) * 10) / 10,
                minWindowFps:
                  windowFps.length > 0 ? Math.round(Math.min(...windowFps) * 10) / 10 : NaN,
                windowFps: windowFps.map((v) => Math.round(v * 10) / 10),
                controllerTier: controller.getTier(),
              });
              return;
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });

        const full: ScenarioResult = { scenario: name, note, ...result };
        const all = (resultsRef.current.scenarios ?? {}) as Record<string, ScenarioResult>;
        all[name] = full;
        resultsRef.current.scenarios = all;
        return full;
      },
      async runPayload(n = props.count): Promise<PayloadResult> {
        const handle = handleRef.current;
        if (!handle?.setPointSet) throw new Error("scale-spike: not ready");
        const t0 = performance.now();
        const res = await fetch(`/api/scale-spike/payload?n=${n}&seed=${props.seed}`);
        if (!res.ok) throw new Error(`payload route ${res.status}`);
        const contentLength = res.headers.get("content-length");
        const buf = await res.arrayBuffer();
        const t1 = performance.now();
        const decoded = decodeColumnarPayload(buf);
        const positions = decoded.columns.positions as Float32Array;
        const t2 = performance.now();
        // Realistic derived-buffer cost: colors come FROM a payload column client-side.
        const colors = colorsFromVerbColumn(decoded.columns.verbId as Uint8Array);
        const t3 = performance.now();
        handle.setPointSet(positions, colors);
        const t4 = performance.now();
        const result: PayloadResult = {
          bytesOnWire: buf.byteLength,
          contentLength: contentLength ? Number(contentLength) : null,
          fetchMs: Math.round(t1 - t0),
          decodeMs: Math.round((t2 - t1) * 10) / 10,
          deriveColorsMs: Math.round(t3 - t2),
          uploadMs: Math.round((t4 - t3) * 10) / 10,
          totalMs: Math.round(t4 - t0),
          count: decoded.count,
        };
        resultsRef.current.payload = result;
        return result;
      },
      getResults: () => ({ ...resultsRef.current, info: bridge.getInfo() }),
      setResult: (key, value) => {
        resultsRef.current[key] = value;
      },
    };
    window.__SCALE_SPIKE__ = bridge;
    return () => {
      delete window.__SCALE_SPIKE__;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.count, props.seed, props.gpu]);

  // ---- Context-loss instrumentation (attaches once cosmos created its canvas) ----
  useEffect(() => {
    if (!data) return;
    const div = containerRef.current;
    if (!div) return;
    const t = setInterval(() => {
      const canvas = div.querySelector("canvas");
      if (!canvas) return;
      clearInterval(t);
      const record = (type: string) => (e: Event) => {
        if (type === "webglcontextlost") e.preventDefault();
        (resultsRef.current.contextLossEvents as Array<{ type: string; atMs: number }>).push({
          type,
          atMs: Math.round(performance.now()),
        });
      };
      canvas.addEventListener("webglcontextlost", record("webglcontextlost"));
      canvas.addEventListener("webglcontextrestored", record("webglcontextrestored"));
    }, 250);
    return () => clearInterval(t);
  }, [data]);

  return (
    <div className="flex h-screen flex-col" style={{ background: ZINC_BG }}>
      <div className="shrink-0 px-4 py-2 font-mono text-xs text-zinc-400">
        scale-spike · n={props.count.toLocaleString()} · seed={props.seed} · mode=
        {props.gpu ? "gpuDrift" : "frozen"} · {status}
        {" · "}
        <span className="text-zinc-500">
          drive via window.__SCALE_SPIKE__.runScenario(&quot;rest&quot;|&quot;panzoom&quot;|&quot;cpuAmbient&quot;|&quot;gpuDrift&quot;)
        </span>
      </div>
      <div ref={containerRef} className="relative min-h-0 flex-1" data-testid="scale-spike-canvas">
        {data ? (
          <GraphCanvas2D
            containerRef={containerRef}
            physics={createSpikePhysicsStub(data.positions)}
            nodeColors={data.colors}
            backgroundColor={ZINC_BG}
            gpuSimulation={props.gpu}
            onHandleReady={(h) => {
              handleRef.current = h;
              resultsRef.current.readyAtMs = Math.round(performance.now());
              setStatus((s) => `${s} · graph ready`);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
