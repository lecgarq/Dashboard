"use client";
/**
 * `prefers-reduced-motion: reduce`, subscribed so a live OS toggle re-renders.
 *
 * Extracted from components/ui/EChart.tsx, which had the only correct copy.
 * The CSS blanket rule in app/globals.css only reaches CSS animations and
 * transitions — it cannot stop a `requestAnimationFrame` count-up or a WebGL
 * render loop, so anything JS-driven has to ask.
 *
 * `matchMedia` is feature-checked: it is absent in jsdom test runs, where the
 * honest answer is "no preference expressed".
 */
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(QUERY).matches;
}

/** Server render always reports false — the preference is only knowable client-side. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
