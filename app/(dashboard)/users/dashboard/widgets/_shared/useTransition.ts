"use client";

/**
 * Phase 04.1 Plan 01 — Reduced-motion-aware transition wrapper.
 *
 * Wraps framer-motion's `useReducedMotion()` so widgets can declare a spring
 * once and have it auto-collapse to an instant transition when the OS-level
 * `prefers-reduced-motion: reduce` is set. SSR-safe — `useReducedMotion`
 * returns null on the server, treated as "do not reduce".
 */

import { useReducedMotion, type Transition } from "framer-motion";

const INSTANT: Transition = { duration: 0 };

export function useTransition(spring: Transition): Transition {
  const reduce = useReducedMotion();
  if (reduce) return INSTANT;
  return spring;
}
