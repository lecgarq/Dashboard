"use client";
/**
 * Central motion facade — the single import contract for Framer Motion across all pages.
 *
 * Usage rule (for consuming phases):
 *   NEVER `import { motion } from "framer-motion"` in page components.
 *   ALWAYS `import { motion, fadeUp, useSafeVariants, … } from "@/components/ui/motion"`.
 *   This keeps reduced-motion enforcement at a single enforcement point (useSafeVariants).
 *
 * Scope: these presets fire once per mount (entrance) — never on filter/data changes.
 * Preset variants use the `hidden`/`visible` key convention so they compose with
 * `initial="hidden" animate="visible"` on parent motion elements.
 *
 * Out of scope: R3F 3D accents (Phase 4 / Phase 6), spatial-graph (users/access-analysis).
 */

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

// ---------------------------------------------------------------------------
// Re-exports (the import-contract surface)
// ---------------------------------------------------------------------------
export { motion, AnimatePresence };

// ---------------------------------------------------------------------------
// Shared easing — matches --motion-ease in app/globals.css and animated-list.tsx
// DO NOT modify animated-list.tsx; define locally here as a superset for new code.
// ---------------------------------------------------------------------------
const EASE = [0.22, 1, 0.36, 1] as const;

// ---------------------------------------------------------------------------
// Preset variant constants
// All entrance budgets: max(duration + delay) < 0.4 s (hard CONTEXT constraint).
// ---------------------------------------------------------------------------

/**
 * fadeUp — canonical entrance for panels, cards, and section headings.
 * Fades in with a gentle upward drift. Duration 0.35 s, within the <400 ms budget.
 */
export const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: EASE },
  },
} as const;

/**
 * fadeIn — opacity-only entrance for simpler cases (icons, overlays, tooltips).
 * Shorter than fadeUp so it feels lighter.
 */
export const fadeIn = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.25, ease: EASE },
  },
} as const;

/**
 * stagger — parent container variant that staggers children.
 * 0.06 s × 6 items + 0.05 s delay = 0.41 s — but stagger applies to *child*
 * animation duration independently; the delayChildren + staggerChildren offset
 * itself is 0.06 × 6 + 0.05 = 0.41 s, which exceeds budget at the 6th item.
 * To stay strictly under 0.4 s, staggerChildren = 0.05, so 0.05 × 6 + 0.05 = 0.35 s.
 */
export const stagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
} as const;

/**
 * slideFromRight — panel-enter variant complementing the right-slide Sheet.
 * Used when content slides in from the right edge (drawer, detail panel).
 */
export const slideFromRight = {
  hidden: { opacity: 0, x: 24 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.35, ease: EASE },
  },
} as const;

// ---------------------------------------------------------------------------
// useSafeVariants — single reduced-motion enforcement point (ARCHITECTURE §5c)
// ---------------------------------------------------------------------------

type TransitionLike = {
  duration?: number;
  staggerChildren?: number;
  delayChildren?: number;
  [key: string]: unknown;
};

type VariantState = {
  transition?: TransitionLike;
  [key: string]: unknown;
};

type VariantsMap = Record<string, VariantState>;

/**
 * useSafeVariants<T>(variants) — hook wrapping useReducedMotion.
 *
 * When `prefers-reduced-motion: reduce` is active:
 *   - Returns a deep-ish copy of the variants with every `transition.duration` set to 0.
 *   - Zeroes `staggerChildren` and `delayChildren` so list entrances are also instant.
 *   - Preserves opacity / transform *end-states* so content is visible immediately.
 *
 * When not reduced: returns `variants` unchanged (same reference).
 *
 * Callers of this hook must be client components (Next.js "use client").
 */
export function useSafeVariants<T extends VariantsMap>(variants: T): T {
  const reduced = useReducedMotion();

  if (!reduced) return variants;

  // Build a shallow-ish copy with transition durations zeroed
  const result = {} as Record<string, VariantState>;

  for (const [key, state] of Object.entries(variants)) {
    if (state && typeof state === "object" && "transition" in state && state.transition) {
      const { transition, ...rest } = state;
      result[key] = {
        ...rest,
        transition: {
          ...transition,
          duration: 0,
          staggerChildren: 0,
          delayChildren: 0,
        },
      };
    } else {
      result[key] = { ...state };
    }
  }

  return result as T;
}
