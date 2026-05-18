"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Phase 09-04 LIST-03 (display path): IntersectionObserver-backed hook that
 * returns the set of email addresses currently rendered within (or near)
 * the viewport. Consumers attach the row DOM node via `registerRow(email)`;
 * the hook batches visibility updates inside `requestAnimationFrame` to avoid
 * update storms during rapid scrolling (RESEARCH Pitfall 5).
 *
 * Contract:
 *   - One stable IntersectionObserver per hook instance (memoized via useRef).
 *   - `rootMargin: 200px` so off-screen-but-near rows pre-warm.
 *   - `registerRow` identity is stable across renders (useCallback).
 *   - Cleanup disconnects observer on unmount.
 *
 * Output:
 *   - `visibleEmails`: deduped, lowercased, sorted ascending string[].
 *   - `registerRow(email)`: returns a ref callback (el | null) → void.
 *
 * Cleanup semantics:
 *   - Each call to `registerRow(email)` returns a NEW ref-callback closure
 *     that captures the most-recently-attached element. When React invokes
 *     it with `null` on unmount, the closure unobserves that captured
 *     element. Re-registering the same email with a different node
 *     transparently rebinds.
 */
export function useVisibleRowEmails(): {
  visibleEmails: string[];
  registerRow: (email: string) => (el: HTMLElement | null) => void;
} {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementToEmailRef = useRef<Map<Element, string>>(new Map());
  const emailToElementsRef = useRef<Map<string, Set<Element>>>(new Map());
  const visibleEmailsSetRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number | null>(null);

  const [visibleEmails, setVisibleEmails] = useState<string[]>([]);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current !== null) return;
    const raf =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : ((cb: FrameRequestCallback) =>
            setTimeout(() => cb(0), 16) as unknown as number);
    rafRef.current = raf(() => {
      rafRef.current = null;
      setVisibleEmails(Array.from(visibleEmailsSetRef.current).sort());
    });
  }, []);

  const getObserver = useCallback((): IntersectionObserver | null => {
    if (typeof window === "undefined") return null;
    if (typeof IntersectionObserver === "undefined") return null;
    if (observerRef.current) return observerRef.current;

    const obs = new IntersectionObserver(
      (entries) => {
        let mutated = false;
        for (const entry of entries) {
          const email = elementToEmailRef.current.get(entry.target);
          if (!email) continue;
          if (entry.isIntersecting) {
            if (!visibleEmailsSetRef.current.has(email)) {
              visibleEmailsSetRef.current.add(email);
              mutated = true;
            }
          } else {
            const elements = emailToElementsRef.current.get(email);
            // Drop the email only when no remaining registered element is
            // intersecting. For the common single-element-per-email case
            // this is just a delete; for the brief rebind window it's a
            // no-op (observer will re-fire once the surviving element is
            // re-evaluated).
            if (!elements || elements.size <= 1) {
              if (visibleEmailsSetRef.current.delete(email)) {
                mutated = true;
              }
            }
          }
        }
        if (mutated) scheduleFlush();
      },
      { rootMargin: "200px" },
    );
    observerRef.current = obs;
    return obs;
  }, [scheduleFlush]);

  // Unmount cleanup — disconnect observer + clear state.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      elementToEmailRef.current.clear();
      emailToElementsRef.current.clear();
      visibleEmailsSetRef.current.clear();
    };
  }, []);

  const registerRow = useCallback(
    (email: string) => {
      const normalized = (email ?? "").trim().toLowerCase();
      // Closure-scoped reference to the most-recently-bound element so the
      // `null` invocation knows what to unobserve.
      let bound: Element | null = null;

      return (el: HTMLElement | null) => {
        if (!normalized || !normalized.includes("@")) return;
        const observer = getObserver();

        if (el) {
          // If a previous element was bound by THIS callback closure, drop
          // it first.
          if (bound && bound !== el) {
            observer?.unobserve(bound);
            elementToEmailRef.current.delete(bound);
            const prevBucket = emailToElementsRef.current.get(normalized);
            prevBucket?.delete(bound);
            if (prevBucket && prevBucket.size === 0) {
              emailToElementsRef.current.delete(normalized);
            }
          }

          elementToEmailRef.current.set(el, normalized);
          let bucket = emailToElementsRef.current.get(normalized);
          if (!bucket) {
            bucket = new Set();
            emailToElementsRef.current.set(normalized, bucket);
          }
          bucket.add(el);
          bound = el;
          observer?.observe(el);
        } else if (bound) {
          // Unmount: unobserve the previously bound element.
          observer?.unobserve(bound);
          elementToEmailRef.current.delete(bound);
          const bucket = emailToElementsRef.current.get(normalized);
          bucket?.delete(bound);
          if (bucket && bucket.size === 0) {
            emailToElementsRef.current.delete(normalized);
            if (visibleEmailsSetRef.current.delete(normalized)) {
              scheduleFlush();
            }
          }
          bound = null;
        }
      };
    },
    [getObserver, scheduleFlush],
  );

  return { visibleEmails, registerRow };
}
