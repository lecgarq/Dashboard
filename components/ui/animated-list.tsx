"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/** Shared easing — matches --motion-ease in app/globals.css. */
export const EASE = [0.22, 1, 0.36, 1] as const;
const STAGGER = 0.025;
const STAGGER_CAP = 16; // beyond this index, items appear together (bounded entrance)

/**
 * Returns a function that produces framer-motion props for a list item so it
 * fades + slides up on mount, with a capped stagger by index. No-ops under
 * prefers-reduced-motion. Usage:
 *   const entrance = useEntrance();
 *   <motion.li {...entrance(i)}>…</motion.li>
 */
export function useEntrance(): (index: number) => Record<string, unknown> {
  const reduce = useReducedMotion();
  return (index: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 6 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: 0.18,
            ease: EASE,
            delay: Math.min(index, STAGGER_CAP) * STAGGER,
          },
        };
}

/** Height-eased open/close wrapper. Replaces instant `{open && …}` snaps. */
export function AnimatedExpand({ open, children }: { open: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="expand"
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: EASE }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** In-view fade-up for a panel/section. Settles content as the user scrolls. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
