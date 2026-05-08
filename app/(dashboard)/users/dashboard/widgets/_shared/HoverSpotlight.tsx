"use client";

/**
 * Phase 04.1 Plan 01 — Hover spotlight (lift + dim siblings) helper.
 *
 * Pattern:
 *
 * ```tsx
 * const { getOpacity, bind } = useHoverSpotlight();
 * return items.map((it) => (
 *   <motion.circle
 *     key={it.id}
 *     {...bind(it.id)}
 *     animate={{ opacity: getOpacity(it.id) }}
 *     transition={useTransition(BUBBLE_SPRING)}
 *   />
 * ));
 * ```
 *
 * `bind(id)` covers both pointer and keyboard hover (focus/blur) so keyboard
 * users get the same dim-siblings affordance.
 */

import { useCallback, useState } from "react";
import { HOVER_OPACITY_DIM, HOVER_OPACITY_FOCUS } from "./dashboardTokens";

export interface HoverSpotlightBindings {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}

export interface UseHoverSpotlightResult {
  hoveredId: string | null;
  getOpacity: (id: string) => number;
  bind: (id: string) => HoverSpotlightBindings;
}

export function useHoverSpotlight(): UseHoverSpotlightResult {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const getOpacity = useCallback(
    (id: string): number => {
      if (hoveredId === null) return HOVER_OPACITY_FOCUS;
      return hoveredId === id ? HOVER_OPACITY_FOCUS : HOVER_OPACITY_DIM;
    },
    [hoveredId],
  );

  const bind = useCallback(
    (id: string): HoverSpotlightBindings => ({
      onMouseEnter: () => setHoveredId(id),
      onMouseLeave: () => setHoveredId((prev) => (prev === id ? null : prev)),
      onFocus: () => setHoveredId(id),
      onBlur: () => setHoveredId((prev) => (prev === id ? null : prev)),
    }),
    [],
  );

  return { hoveredId, getOpacity, bind };
}
