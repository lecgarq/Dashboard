/**
 * activityTestBridge.ts — v2.7 Phase 39 (ACT-01).
 *
 * Minimal counter bridge for the activity universe, the Phase-41 e2e
 * re-baseline seam (the instance graphTestBridge retires with its shell).
 * Installed only under NEXT_PUBLIC_ACC_GRAPH_TEST=1, same env the retired
 * bridge used, so the harness wiring carries over.
 */

export interface ActivityUniverseTestApi {
  isReady(): boolean;
  /** Snapshot copy of all counters — Phase 41 reads fields off one object. */
  getState(): ActivityTestState;
}

export interface ActivityTestState {
  ready: boolean;
  residentCount: number;
  renderedCount: number;
  linkCount: number;
  lodMode: "sample" | "region";
  sampleStride: number;
  selectedCount: number;
  /** Phase 40 dimension surface. */
  groupBy: string;
  colorBy: string;
  strength: number;
  morphCount: number;
  ambientActive: boolean;
  temporalMode: "all" | "month";
  selectedMonth: number | null;
  searchQuery: string;
  matchedAuthorCount: number;
  monthCount: number;
  activeCount: number;
  playing: boolean;
  reducedMotion: boolean;
  positionsFinite: boolean;
  positionMaxAbs: number;
  ambientTier: 0 | 1 | 2;
  lastWindowFps: number | null;
  renderer: string;
}

declare global {
  interface Window {
    __ACTIVITY_UNIVERSE_TEST__?: ActivityUniverseTestApi;
  }
}

const state: ActivityTestState = {
  ready: false,
  residentCount: 0,
  renderedCount: 0,
  linkCount: 0,
  lodMode: "sample",
  sampleStride: 1,
  selectedCount: 0,
  groupBy: "none",
  colorBy: "module",
  strength: 0,
  morphCount: 0,
  ambientActive: false,
  temporalMode: "all",
  selectedMonth: null,
  searchQuery: "",
  matchedAuthorCount: 0,
  monthCount: 0,
  activeCount: 0,
  playing: false,
  reducedMotion: false,
  positionsFinite: false,
  positionMaxAbs: 0,
  ambientTier: 0,
  lastWindowFps: null,
  renderer: "",
};

export const testBridgeEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_ACC_GRAPH_TEST === "1";

export function setActivityTestState(patch: Partial<ActivityTestState>): void {
  if (!testBridgeEnabled()) return;
  Object.assign(state, patch);
}

/** Install window.__ACTIVITY_UNIVERSE_TEST__ once; returns an uninstall fn. */
export function installActivityTestBridge(): () => void {
  if (!testBridgeEnabled() || typeof window === "undefined") return () => {};
  window.__ACTIVITY_UNIVERSE_TEST__ = {
    isReady: () => state.ready,
    getState: () => ({ ...state }),
  };
  return () => {
    delete window.__ACTIVITY_UNIVERSE_TEST__;
  };
}
