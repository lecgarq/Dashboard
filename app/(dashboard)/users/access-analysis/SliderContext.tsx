"use client";

/**
 * SliderContext.tsx — Phase 4-02 Task 1
 *
 * Six-dimension slider state with:
 *   - rAF-coalesced physics.updateSliders(normalizedValues 0..1) on change
 *   - per-thumb (`resetOne`) and global (`resetAll`) reset
 *   - localStorage persistence under the SHARED key `lecg.access-analysis.controls.v1`
 *   - two-pass mount (RESEARCH Pitfall 3 — defaults render server-side; effect hydrates client-side)
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

// ---------------------------------------------------------------------------
// Canonical six-dimension list (used by both contexts and the toolbar)
// ---------------------------------------------------------------------------

export const DIMENSIONS = [
  { id: "role", label: "Role", kind: "categorical" },
  { id: "tier", label: "Tier", kind: "categorical" },
  { id: "project", label: "Project", kind: "categorical" },
  { id: "isExternal", label: "External", kind: "categorical" },
  { id: "activity", label: "Activity", kind: "bucket" },
  { id: "signin", label: "Sign-in", kind: "bucket" },
] as const;

export type DimensionId = (typeof DIMENSIONS)[number]["id"];

// Shared storage key — FilterContext writes to the same JSON blob.
export const CONTROLS_STORAGE_KEY = "lecg.access-analysis.controls.v1";

const DEFAULT_VALUES: Record<DimensionId, number> = {
  role: 0,
  tier: 0,
  project: 0,
  isExternal: 0,
  activity: 0,
  signin: 0,
};

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface SliderContextValue {
  values: Record<DimensionId, number>;
  setSliderValue: (dimId: DimensionId, value: number) => void;
  resetAll: () => void;
  resetOne: (dimId: DimensionId) => void;
}

const SliderCtx = createContext<SliderContextValue | null>(null);

// ---------------------------------------------------------------------------
// Storage helpers (SSR-safe + try/catch for Safari/quota)
// ---------------------------------------------------------------------------

interface PersistedControls {
  sliders?: Partial<Record<DimensionId, number>>;
  filters?: Record<string, string[]>;
  searchQuery?: string;
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
    const next: Record<DimensionId, number> = { ...DEFAULT_VALUES };
    for (const dim of DIMENSIONS) {
      const v = stored.sliders[dim.id];
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
      schedulePush(next);
    },
    [schedulePush],
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
    flushToPhysics(next);
  }, [flushToPhysics]);

  const resetOne = useCallback(
    (dimId: DimensionId): void => {
      const next = { ...valuesRef.current, [dimId]: 0 };
      valuesRef.current = next;
      setValues(next);
      schedulePush(next);
    },
    [schedulePush],
  );

  const ctx = useMemo<SliderContextValue>(
    () => ({ values, setSliderValue, resetAll, resetOne }),
    [values, setSliderValue, resetAll, resetOne],
  );

  return <SliderCtx.Provider value={ctx}>{children}</SliderCtx.Provider>;
}

export function useSliders(): SliderContextValue {
  const v = useContext(SliderCtx);
  if (!v) throw new Error("useSliders must be used inside <SliderProvider>");
  return v;
}
