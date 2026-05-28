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
import { applyPreset, detectActivePreset } from "./sliderPresets";

// ---------------------------------------------------------------------------
// Slider-capable dimension list — derived from the registry (single source of truth).
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

export type DimensionId = (typeof DIMENSIONS)[number]["id"];

// Shared storage key — FilterContext writes to the same JSON blob.
export const CONTROLS_STORAGE_KEY = "lecg.access-analysis.controls.v1";

/**
 * Organic default layout profile, now sourced from the registry defaultWeights
 * (×100) via the 'organic' preset.
 */
export const DEFAULT_VALUES: Record<DimensionId, number> =
  applyPreset("organic") as Record<DimensionId, number>;

/**
 * One-time migration of persisted slider state: the legacy `isExternal` slider id
 * was renamed to `internalExternal` (registry reconciliation, P3). If a stored blob
 * still carries `isExternal`, fold its value into `internalExternal` (unless the new
 * key is already present, in which case the new value wins) and drop the legacy key.
 */
export function migratePersistedSliders(
  sliders: Record<string, number>,
): Record<string, number> {
  if (!("isExternal" in sliders)) return sliders;
  const { isExternal, ...rest } = sliders;
  if (!("internalExternal" in rest)) rest.internalExternal = isExternal;
  return rest;
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface SliderContextValue {
  values: Record<DimensionId, number>;
  setSliderValue: (dimId: DimensionId, value: number) => void;
  resetAll: () => void;
  resetOne: (dimId: DimensionId) => void;
  applyPreset: (presetId: string) => void;
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
  children: ReactNode;
}

export function SliderProvider({ physics, children }: SliderProviderProps): React.JSX.Element {
  const [values, setValues] = useState<Record<DimensionId, number>>(DEFAULT_VALUES);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // rAF coalescing for physics.updateSliders
  const rafIdRef = useRef<number | null>(null);
  const pendingRef = useRef<Record<DimensionId, number> | null>(null);

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
    };
  }, []);

  const flushToPhysics = useCallback(
    (snapshot: Record<DimensionId, number>): void => {
      if (!physics) return;
      const normalized = Object.fromEntries(
        Object.entries(snapshot).map(([k, n]) => [k, n / 100]),
      );
      physics.updateSliders(normalized);
    },
    [physics],
  );

  const schedulePush = useCallback(
    (next: Record<DimensionId, number>): void => {
      pendingRef.current = next;
      if (previewActiveRef.current) {
        if (rafIdRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        pendingRef.current = null;
        flushToPhysics(next);
        return;
      }
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

  // Two-pass mount — hydrate from localStorage AFTER initial render.
  useEffect(() => {
    const stored = readPersisted();
    if (!stored || !stored.sliders) return;
    const migrated = migratePersistedSliders(stored.sliders as Record<string, number>);
    const next: Record<DimensionId, number> = { ...DEFAULT_VALUES };
    for (const dim of DIMENSIONS) {
      const v = migrated[dim.id];
      if (typeof v === "number" && Number.isFinite(v)) {
        next[dim.id] = Math.max(0, Math.min(100, v));
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
    (dimId: DimensionId, value: number): void => {
      const clamped = Math.max(0, Math.min(100, value));
      // Update the ref synchronously so back-to-back calls in the same tick
      // accumulate (not just overwrite each other via stale valuesRef reads).
      const next = { ...valuesRef.current, [dimId]: clamped };
      valuesRef.current = next;
      setValues(next);
      enterPreview();
      schedulePush(next);
    },
    [enterPreview, schedulePush],
  );

  const resetAll = useCallback((): void => {
    const next = { ...DEFAULT_VALUES };
    valuesRef.current = next;
    setValues(next);
    // Cancel any pending rAF; push zeros immediately so motion stops fast.
    if (rafIdRef.current !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
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
  }, [flushToPhysics, physics, emitPreview]);

  const resetOne = useCallback(
    (dimId: DimensionId): void => {
      const next = { ...valuesRef.current, [dimId]: 0 };
      valuesRef.current = next;
      setValues(next);
      enterPreview();
      schedulePush(next);
    },
    [enterPreview, schedulePush],
  );

  const applyPresetCb = useCallback(
    (presetId: string): void => {
      const next = applyPreset(presetId) as Record<DimensionId, number>;
      valuesRef.current = next;
      setValues(next);
      enterPreview();
      schedulePush(next);
    },
    [enterPreview, schedulePush],
  );

  const activePreset = useMemo(() => detectActivePreset(values), [values]);

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

  const ctx = useMemo<SliderContextValue>(
    () => ({
      values,
      setSliderValue,
      resetAll,
      resetOne,
      applyPreset: applyPresetCb,
      activePreset,
      subscribePreviewActive,
      isPreviewActive,
    }),
    [values, setSliderValue, resetAll, resetOne, applyPresetCb, activePreset, subscribePreviewActive, isPreviewActive],
  );

  return <SliderCtx.Provider value={ctx}>{children}</SliderCtx.Provider>;
}

export function useSliders(): SliderContextValue {
  const v = useContext(SliderCtx);
  if (!v) throw new Error("useSliders must be used inside <SliderProvider>");
  return v;
}
