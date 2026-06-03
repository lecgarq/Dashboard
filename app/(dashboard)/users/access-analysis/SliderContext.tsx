"use client";

/**
 * SliderContext.tsx — Phase 4-02 Task 1
 *
 * Full-dimension slider state with:
 *   - rAF-coalesced physics.updateSliders(normalizedValues 0..1) on change
 *   - per-thumb (`resetOne`) and global (`resetAll`) reset
 *   - localStorage persistence under the SHARED key `lecg.access-analysis.controls.v1`
 *   - two-pass mount (RESEARCH Pitfall 3 — defaults render server-side; effect hydrates client-side)
 *   - Preset weight profile support (organic, structural, behavioral, flat, free)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PhysicsLayer } from "./physicsLayer";
import { getDimension } from "./dimensionRegistry";
import { SLIDER_DIMENSION_IDS } from "./dimensionGroups";
import { applyPreset } from "./sliderPresets";
import type { CatalogDimension } from "./dimensionCatalog.types";
import { sliderDimensionIds, catalogDefaultSliders } from "./catalogSliders";

// ---------------------------------------------------------------------------
// LEGACY slider-capable dimension list — derived from the registry.
//
// Phase E: the live shell + sidebar are now catalog-driven (see SliderProvider
// below). This list is RETAINED only because the legacy filter/toolbar surfaces
// (FilterContext, Toolbar, DimensionFilterPopover) still iterate it. Those
// modules stay alive for Phases F/G (presets/color); do NOT wire them to slider
// state. The provider no longer reads DIMENSIONS/DEFAULT_VALUES.
// ---------------------------------------------------------------------------

export const DIMENSIONS = SLIDER_DIMENSION_IDS.map((id) => {
  const d = getDimension(id)!;
  return {
    id: d.id,
    label: d.label,
    // categorical/binary/multi-hot → "categorical"; temporal stays "bucket".
    kind: d.type === "temporal" ? ("bucket" as const) : ("categorical" as const),
  };
});

// Phase E: catalog ids are dynamic strings, so DimensionId widens to `string`.
// (Export name retained so existing importers still type-check.)
export type DimensionId = string;

// Shared storage key — FilterContext writes to the same JSON blob.
export const CONTROLS_STORAGE_KEY = "lecg.access-analysis.controls.v1";

/**
 * LEGACY organic default profile — kept for the legacy filter/toolbar consumers
 * (and physicsClustering tests) that still import it. The catalog-driven provider
 * defaults every slider to 0 (spec decision #3) and no longer reads this.
 */
export const DEFAULT_VALUES: Record<string, number> =
  applyPreset("organic") as Record<string, number>;

/**
 * Phase E: drop any persisted slider id that is not a known catalog slider id
 * (the id-space changed from the registry union to dynamic catalog strings).
 * Only finite numeric values for known ids survive.
 */
export function migratePersistedSliders(
  sliders: Record<string, number>,
  knownIds: readonly string[],
): Record<string, number> {
  const known = new Set(knownIds);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(sliders)) {
    if (known.has(k) && typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface SliderContextValue {
  values: Record<string, number>;
  /**
   * Live (uncommitted) slider values for the rAF/render loop. Reading this never
   * triggers a React re-render (unlike `values`), so the graph layout can respond
   * to a drag every frame without re-rendering the shell. Normalized 0..100 like `values`.
   */
  getLiveValues: () => Record<string, number>;
  setSliderValue: (dimId: string, value: number) => void;
  resetAll: () => void;
  resetOne: (dimId: string) => void;
  /** Phase E stub — real presets land in Phase F. Resets to defaults (all-0). */
  applyPreset: (presetId: string) => void;
  /** Phase E stub — no preset detection while the catalog drives state. */
  activePreset: string | null;
  subscribePreviewActive: (listener: (active: boolean) => void) => () => void;
  isPreviewActive: () => boolean;
}

const SliderCtx = createContext<SliderContextValue | null>(null);

// ---------------------------------------------------------------------------
// Storage helpers (SSR-safe + try/catch for Safari/quota)
// ---------------------------------------------------------------------------

interface PersistedControls {
  sliders?: Partial<Record<string, number>>;
  filters?: Record<string, string[]>;
  searchQuery?: string;
  activePreset?: string;
  openGroups?: string[];
}

function readPersisted(): PersistedControls | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONTROLS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedControls) : null;
  } catch {
    return null;
  }
}

function writePersisted(patch: PersistedControls): void {
  if (typeof window === "undefined") return;
  try {
    const prev = readPersisted() ?? {};
    const next = { ...prev, ...patch };
    window.localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore — quota / private mode */
  }
}

export function readOpenGroups(): string[] | null {
  const stored = readPersisted();
  return stored?.openGroups ?? null;
}

export function writeOpenGroups(labels: string[]): void {
  writePersisted({ openGroups: labels });
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface SliderProviderProps {
  physics: PhysicsLayer | null;
  catalog: readonly CatalogDimension[];
  children: ReactNode;
}

export function SliderProvider({ physics, catalog, children }: SliderProviderProps): React.JSX.Element {
  // Phase E: the catalog is the single source of truth for slider ids + defaults.
  // `ids` = every slider-surfaced catalog id (incl. greyed/no-data rows, so a
  // persisted value for a now-greyed dim still survives the migration filter).
  // `defaults` = every AVAILABLE slider at 0 (spec decision #3).
  const ids = useMemo(() => sliderDimensionIds(catalog), [catalog]);
  const defaults = useMemo(() => catalogDefaultSliders(catalog), [catalog]);

  const [values, setValues] = useState<Record<string, number>>(defaults);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // rAF coalescing for physics.updateSliders
  const rafIdRef = useRef<number | null>(null);
  const pendingRef = useRef<Record<string, number> | null>(null);

  // B.1 — drag-preview mode. Slider changes mark the physics layer as
  // "active input" and (re)arm an idle timer; when the timer fires without
  // further changes the layer is taken out of preview, restoring the full
  // force profile so the layout can settle. The same timer covers keyboard
  // input (no native drag-end event) and pointer drags alike.
  const previewIdleIdRef = useRef<number | null>(null);
  const previewActiveRef = useRef(false);
  /** Debounce window after the last slider change before exiting preview. */
  const PREVIEW_IDLE_MS = 250;

  const previewListenersRef = useRef<Set<(active: boolean) => void>>(new Set());
  const emitPreview = useCallback((active: boolean) => {
    previewListenersRef.current.forEach((fn) => fn(active));
  }, []);

  const enterPreview = useCallback((): void => {
    if (!physics) return;
    if (!previewActiveRef.current) {
      previewActiveRef.current = true;
      physics.setActiveInput?.(true);
      emitPreview(true);
    }
    if (previewIdleIdRef.current !== null) {
      window.clearTimeout(previewIdleIdRef.current);
    }
    previewIdleIdRef.current = window.setTimeout(() => {
      previewIdleIdRef.current = null;
      previewActiveRef.current = false;
      physics.setActiveInput?.(false);
      emitPreview(false);
    }, PREVIEW_IDLE_MS);
  }, [physics, emitPreview]);

  // Cancel the timer on unmount so we never call setActiveInput against a
  // disposed PhysicsLayer.
  useEffect(() => {
    return () => {
      if (previewIdleIdRef.current !== null) {
        window.clearTimeout(previewIdleIdRef.current);
        previewIdleIdRef.current = null;
      }
      if (stateRafRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(stateRafRef.current);
        stateRafRef.current = null;
      }
    };
  }, []);

  const flushToPhysics = useCallback(
    (snapshot: Record<string, number>): void => {
      if (!physics) return;
      const normalized = Object.fromEntries(
        Object.entries(snapshot).map(([k, n]) => [k, n / 100]),
      );
      physics.updateSliders(normalized);
    },
    [physics],
  );

  const schedulePush = useCallback(
    (next: Record<string, number>): void => {
      pendingRef.current = next;
      if (rafIdRef.current !== null) return;
      if (typeof window === "undefined" || typeof requestAnimationFrame === "undefined") {
        // Test / SSR fallback — flush immediately.
        const v = pendingRef.current!;
        pendingRef.current = null;
        flushToPhysics(v);
        return;
      }
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const v = pendingRef.current;
        pendingRef.current = null;
        if (v) flushToPhysics(v);
      });
    },
    [flushToPhysics],
  );

  // rAF-coalesced React state commit (anti-lag). A drag fires setSliderValue on
  // every pointer-move (often faster than one frame, esp. on 120Hz pointers); a
  // synchronous setValues would re-render the WHOLE sidebar tree per event. We
  // update valuesRef synchronously (so physics + accumulation are exact) and
  // commit React state at most ONCE per frame from the latest ref. The live drag
  // stays smooth; the only "cost" is the displayed thumb lagging ≤1 frame.
  const stateRafRef = useRef<number | null>(null);
  const lastCommitTsRef = useRef<number>(0);
  // Display commits are THROTTLED to ~16Hz during a drag. setValues re-renders every
  // useSliders consumer — the shell, the graph-canvas wrapper, the panels — and that
  // cascade (+ cosmos re-config it triggers) was competing with the rAF render loop for
  // the frame budget (drag measured ~42fps in dev). The GRAPH still animates every frame:
  // it reads getLiveValues() off a ref inside the rAF loop, independent of these commits.
  // So throttling the React commit frees the budget WITHOUT slowing the motion; the only
  // cost is the thumb display lagging ≤~60ms (imperceptible). Trailing-edge: the final
  // value always lands within one throttle window of the last change.
  const COMMIT_THROTTLE_MS = 60;
  const commitState = useCallback((): void => {
    if (typeof window === "undefined" || typeof requestAnimationFrame === "undefined") {
      setValues({ ...valuesRef.current });
      return;
    }
    if (stateRafRef.current !== null) return; // a commit is already pending → coalesce
    const tick = (ts: number): void => {
      if (ts - lastCommitTsRef.current >= COMMIT_THROTTLE_MS) {
        lastCommitTsRef.current = ts;
        stateRafRef.current = null;
        setValues({ ...valuesRef.current });
      } else {
        stateRafRef.current = requestAnimationFrame(tick); // trailing — re-check next frame
      }
    };
    stateRafRef.current = requestAnimationFrame(tick);
  }, []);

  // Two-pass mount — hydrate from localStorage AFTER initial render.
  useEffect(() => {
    const stored = readPersisted();
    if (!stored || !stored.sliders) return;
    const migrated = migratePersistedSliders(stored.sliders as Record<string, number>, ids);
    const next: Record<string, number> = { ...defaults };
    for (const [id, v] of Object.entries(migrated)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        next[id] = Math.max(0, Math.min(100, v));
      }
    }
    setValues(next);
    schedulePush(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced persistence on change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setTimeout(() => {
      writePersisted({ sliders: values });
    }, 200);
    return () => window.clearTimeout(id);
  }, [values]);

  const setSliderValue = useCallback(
    (dimId: string, value: number): void => {
      const clamped = Math.max(0, Math.min(100, value));
      // Update the ref synchronously so back-to-back calls in the same tick
      // accumulate (not just overwrite each other via stale valuesRef reads).
      const next = { ...valuesRef.current, [dimId]: clamped };
      valuesRef.current = next;
      commitState(); // rAF-coalesced setValues (anti-lag) — physics gets `next` now
      enterPreview();
      schedulePush(next);
    },
    [enterPreview, schedulePush, commitState],
  );

  const resetAll = useCallback((): void => {
    const next = { ...defaults };
    valuesRef.current = next;
    setValues(next);
    // Cancel any pending rAF; push zeros immediately so motion stops fast.
    if (rafIdRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (stateRafRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(stateRafRef.current);
      stateRafRef.current = null;
    }
    pendingRef.current = null;
    // resetAll is an explicit "settle now" gesture — leave preview mode
    // immediately so the full force profile is in place when the defaults push.
    if (previewIdleIdRef.current !== null) {
      window.clearTimeout(previewIdleIdRef.current);
      previewIdleIdRef.current = null;
    }
    if (previewActiveRef.current) {
      previewActiveRef.current = false;
      physics?.setActiveInput?.(false);
      emitPreview(false);
    }
    flushToPhysics(next);
  }, [flushToPhysics, physics, emitPreview, defaults]);

  const resetOne = useCallback(
    (dimId: string): void => {
      const next = { ...valuesRef.current, [dimId]: 0 };
      valuesRef.current = next;
      setValues(next);
      enterPreview();
      schedulePush(next);
    },
    [enterPreview, schedulePush],
  );

  // Phase E stub — preset application is deferred to Phase F. Until then this
  // resets to the catalog defaults (all-0) so the legacy SliderSidebar/PresetBar
  // (orphaned, no longer rendered) still type-check against the context.
  const applyPresetCb = useCallback(
    (_presetId: string): void => {
      resetAll();
    },
    [resetAll],
  );

  // Phase E stub — no preset detection while the catalog drives slider state.
  const activePreset = null;

  const subscribePreviewActive = useCallback(
    (listener: (active: boolean) => void): (() => void) => {
      previewListenersRef.current.add(listener);
      return () => {
        previewListenersRef.current.delete(listener);
      };
    },
    [],
  );

  const isPreviewActive = useCallback((): boolean => previewActiveRef.current, []);

  // Stable getter — reads the synchronously-maintained ref, so the rAF loop sees
  // the latest drag value without waiting for (or causing) a React commit.
  const getLiveValues = useCallback((): Record<string, number> => valuesRef.current, []);

  const ctx = useMemo<SliderContextValue>(
    () => ({
      values,
      getLiveValues,
      setSliderValue,
      resetAll,
      resetOne,
      applyPreset: applyPresetCb,
      activePreset,
      subscribePreviewActive,
      isPreviewActive,
    }),
    [values, getLiveValues, setSliderValue, resetAll, resetOne, applyPresetCb, activePreset, subscribePreviewActive, isPreviewActive],
  );

  return <SliderCtx.Provider value={ctx}>{children}</SliderCtx.Provider>;
}

export function useSliders(): SliderContextValue {
  const v = useContext(SliderCtx);
  if (!v) throw new Error("useSliders must be used inside <SliderProvider>");
  return v;
}
