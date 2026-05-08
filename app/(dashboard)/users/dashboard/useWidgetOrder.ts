"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_ORDER,
  WIDGETS,
  WIDGET_ORDER_STORAGE_KEY,
  type WidgetId,
} from "./widgetRegistry";

/**
 * Phase 4 Plan 5 — Widget Order Hook (DASH-11).
 *
 * Returns `[order, setOrder]`. Initial state is `DEFAULT_ORDER` (Pitfall 9: SSR has no
 * `localStorage`, so we never read it during render). On mount we hydrate from
 * `localStorage`; if the stored value is invalid, missing keys, has unknown keys, or
 * is unparseable, we fall back to `DEFAULT_ORDER`.
 *
 * Re-validation runs on EVERY mount-time read so adding a NEW widget id to WIDGETS
 * does not orphan stored arrays — they will be replaced with `DEFAULT_ORDER` until the
 * user re-orders, at which point the new full set is re-persisted.
 */
export function useWidgetOrder(): [string[], (next: string[]) => void] {
  const [order, setOrderState] = useState<string[]>(() =>
    DEFAULT_ORDER.slice() as string[]
  );

  // Hydrate from localStorage AFTER mount (SSR-safe).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(WIDGET_ORDER_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      if (!parsed.every((x) => typeof x === "string")) return;
      const stored = parsed as string[];
      const knownIds = Object.keys(WIDGETS) as WidgetId[];
      // Every stored id must be a known WIDGET id…
      if (!stored.every((id) => (knownIds as string[]).includes(id))) return;
      // …AND the stored set must cover every id in DEFAULT_ORDER (no missing widgets).
      const storedSet = new Set(stored);
      const defaultIsCovered = (DEFAULT_ORDER as readonly string[]).every(
        (id) => storedSet.has(id)
      );
      if (!defaultIsCovered) return;
      setOrderState(stored);
    } catch {
      // Garbage / non-JSON → silently fall back to DEFAULT_ORDER.
    }
  }, []);

  const setOrder = useCallback((next: string[]) => {
    setOrderState(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        WIDGET_ORDER_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch {
      // Quota exceeded / private mode — order still updates in memory.
    }
  }, []);

  return [order, setOrder];
}
