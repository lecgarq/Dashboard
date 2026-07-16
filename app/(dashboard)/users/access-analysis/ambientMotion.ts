/** Pure, allocation-free ambient offsets for the frozen 2D projector. */

export type AmbientTier = 0 | 1 | 2;
export type AmbientRecency =
  | "0-7d"
  | "8-14d"
  | "15-30d"
  | "31-60d"
  | "60d+"
  | "none";

export interface AmbientStats {
  tier: AmbientTier;
  nodeCount: number;
  animatedNodeCount: number;
  lastWindowFps: number | null;
  positionVersion: number;
}

export interface AmbientFpsController {
  getTier(): AmbientTier;
  getLastWindowFps(): number | null;
  observeFrame(nowMs: number): AmbientTier;
  observeWindow(fps: number, durationMs?: number): AmbientTier;
  resetSampling(nowMs?: number): void;
  resetTier(tier?: AmbientTier): void;
}

export interface AmbientMotionLayer {
  frame(opts: {
    anchors: Float32Array;
    nowMs: number;
    paused: boolean;
    reducedMotion: boolean;
    freezeMask?: Uint8Array;
    focusActive?: boolean;
  }): Float32Array;
  resetSampling(nowMs?: number): void;
  getStats(): AmbientStats;
  /** Test-bridge only; runs the real locked window sequence synchronously. */
  exerciseControllerForTest(): { sequence: AmbientTier[]; recoveredTier: AmbientTier };
}

const WINDOW_MS = 3_000;
const LOW_FPS = 50;
const RECOVERY_FPS = 55;
const RECOVERY_MS = 10_000;
const TIER_1_FRAME_MS = 1_000 / 30;
const RESUME_MS = 180;
const MAX_AMPLITUDE = 3.2;
const FOCUS_BACKGROUND_SCALE = 0.45;
const TAU = Math.PI * 2;

const RECENCY: Record<AmbientRecency, { amplitude: number; speed: number; recent: boolean }> = {
  "0-7d": { amplitude: 1, speed: 0.9, recent: true },
  "8-14d": { amplitude: 0.82, speed: 0.76, recent: true },
  "15-30d": { amplitude: 0.64, speed: 0.62, recent: true },
  "31-60d": { amplitude: 0.46, speed: 0.49, recent: true },
  "60d+": { amplitude: 0.2, speed: 0.3, recent: false },
  none: { amplitude: 0.08, speed: 0.18, recent: false },
};

export function ambientRecencyProfile(bucket?: AmbientRecency): Readonly<{
  amplitude: number;
  speed: number;
  recent: boolean;
}> {
  return RECENCY[bucket ?? "none"];
}

export function createAmbientFpsController(initialTier: AmbientTier = 0): AmbientFpsController {
  let tier = initialTier;
  let windowStart: number | null = null;
  let frames = 0;
  let lowWindows = 0;
  let recoveryMs = 0;
  let lastWindowFps: number | null = null;

  const resetSampling = (nowMs?: number): void => {
    windowStart = nowMs ?? null;
    frames = 0;
    lowWindows = 0;
    recoveryMs = 0;
    lastWindowFps = null;
  };

  const observeWindow = (fps: number, durationMs = WINDOW_MS): AmbientTier => {
    lastWindowFps = fps;
    if (fps < LOW_FPS) {
      recoveryMs = 0;
      lowWindows += 1;
      if (lowWindows >= 2 && tier < 2) {
        tier = (tier + 1) as AmbientTier;
        lowWindows = 0;
      }
      return tier;
    }

    lowWindows = 0;
    if (tier > 0 && fps >= RECOVERY_FPS) {
      recoveryMs += durationMs;
      if (recoveryMs >= RECOVERY_MS) {
        tier = (tier - 1) as AmbientTier;
        recoveryMs = 0;
      }
    } else {
      recoveryMs = 0;
    }
    return tier;
  };

  return {
    getTier: () => tier,
    getLastWindowFps: () => lastWindowFps,
    observeFrame(nowMs): AmbientTier {
      if (windowStart === null || nowMs < windowStart) {
        windowStart = nowMs;
        frames = 0;
        return tier;
      }
      frames += 1;
      const elapsed = nowMs - windowStart;
      if (elapsed >= WINDOW_MS) {
        observeWindow((frames * 1_000) / elapsed, elapsed);
        windowStart = nowMs;
        frames = 0;
      }
      return tier;
    },
    observeWindow,
    resetSampling,
    resetTier(next = 0): void {
      tier = next;
      resetSampling();
    },
  };
}
function hashNodeId(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193);
  }
  return hash >>> 0;
}

export function createAmbientMotionLayer(opts: {
  nodeIds: readonly string[];
  recency: readonly (AmbientRecency | undefined)[];
  initialTier?: AmbientTier;
}): AmbientMotionLayer {
  const n = opts.nodeIds.length;
  if (opts.recency.length !== n) {
    throw new Error(`ambientMotion: recency length ${opts.recency.length} != ${n}`);
  }

  const phase = new Float32Array(n);
  const amplitude = new Float32Array(n);
  const speed = new Float32Array(n);
  const recent = new Uint8Array(n);
  const output = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const hash = hashNodeId(opts.nodeIds[i]);
    const profile = ambientRecencyProfile(opts.recency[i]);
    phase[i] = (hash / 0x1_0000_0000) * TAU;
    amplitude[i] = profile.amplitude * MAX_AMPLITUDE;
    speed[i] = profile.speed * (0.94 + ((hash >>> 24) / 255) * 0.12);
    recent[i] = profile.recent ? 1 : 0;
  }

  const fps = createAmbientFpsController(opts.initialTier);
  let startedAt: number | null = null;
  let resumeAt: number | null = null;
  let wasPaused = true;
  let lastUploadAt = -Infinity;
  let lastAppliedTier: AmbientTier | -1 = -1;
  let animatedNodeCount = 0;
  let positionVersion = 0;

  const copyAnchors = (anchors: Float32Array): void => {
    let changed = false;
    for (let i = 0; i < output.length; i++) {
      if (output[i] !== anchors[i]) changed = true;
      output[i] = anchors[i];
    }
    if (changed) positionVersion += 1;
    animatedNodeCount = 0;
  };

  const stats = (): AmbientStats => ({
    tier: fps.getTier(),
    nodeCount: n,
    animatedNodeCount,
    lastWindowFps: fps.getLastWindowFps(),
    positionVersion,
  });

  return {
    frame({ anchors, nowMs, paused, reducedMotion, freezeMask, focusActive = false }): Float32Array {
      if (anchors.length !== output.length) {
        throw new Error(`ambientMotion: anchor length ${anchors.length} != ${output.length}`);
      }
      startedAt ??= nowMs;
      const tier = fps.observeFrame(nowMs);
      const staticFrame = paused || reducedMotion || tier === 2;
      if (staticFrame) {
        copyAnchors(anchors);
        wasPaused = paused || reducedMotion;
        lastAppliedTier = tier;
        return output;
      }

      if (wasPaused) {
        resumeAt = nowMs;
        wasPaused = false;
      }
      const resumeScale = resumeAt === null ? 1 : Math.min(1, Math.max(0, (nowMs - resumeAt) / RESUME_MS));
      if (resumeScale === 1) resumeAt = null;

      const forceTierRefresh = tier !== lastAppliedTier;
      if (tier === 1 && !forceTierRefresh && nowMs - lastUploadAt < TIER_1_FRAME_MS) {
        return output;
      }
      lastUploadAt = nowMs;
      lastAppliedTier = tier;

      const elapsedSeconds = (nowMs - startedAt) / 1_000;
      const backgroundScale = focusActive ? FOCUS_BACKGROUND_SCALE : 1;
      let animated = 0;
      for (let i = 0; i < n; i++) {
        const j = i * 3;
        const eligible = tier === 0 || recent[i] === 1;
        const frozen = freezeMask?.[i] === 1;
        const scale = eligible && !frozen ? resumeScale * backgroundScale : 0;
        if (scale > 0) animated += 1;
        const angle = phase[i] + elapsedSeconds * speed[i];
        const amp = amplitude[i] * scale;
        output[j] = anchors[j] + Math.cos(angle) * amp;
        output[j + 1] = anchors[j + 1] + Math.sin(angle * 0.83 + phase[i] * 0.71) * amp * 0.72;
        output[j + 2] = anchors[j + 2];
      }
      animatedNodeCount = animated;
      positionVersion += 1;
      return output;
    },
    resetSampling(nowMs): void {
      fps.resetSampling(nowMs);
    },
    getStats: stats,
    exerciseControllerForTest() {
      fps.resetTier(0);
      const sequence: AmbientTier[] = [fps.getTier()];
      fps.observeWindow(49, WINDOW_MS);
      sequence.push(fps.observeWindow(49, WINDOW_MS));
      fps.observeWindow(49, WINDOW_MS);
      sequence.push(fps.observeWindow(49, WINDOW_MS));
      for (let i = 0; i < 3; i++) fps.observeWindow(55, WINDOW_MS);
      sequence.push(fps.observeWindow(55, WINDOW_MS));
      const recoveredTier = fps.getTier();
      fps.resetTier(0);
      lastAppliedTier = -1;
      return { sequence, recoveredTier };
    },
  };
}
