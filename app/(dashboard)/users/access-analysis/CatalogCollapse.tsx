"use client";
import { AnimatePresence, motion } from "framer-motion";

/** Animated height+opacity collapse for a tree branch. Children unmount when closed
 *  (so the full dim tree never animates at once). Uses the project motion easing
 *  (globals.css --motion-ease cubic-bezier(0.22,1,0.36,1)). */
export function CatalogCollapse({ open, children }: { open: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
