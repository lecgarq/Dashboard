/**
 * sidebarWidth.ts — pure helpers for the resizable right rail (RightPanelStack).
 *
 * The rail width is user-draggable and persisted per-browser. All clamping +
 * persistence lives here so the React component only owns the drag gesture, and
 * the bounds stay unit-testable. Default 384 == the old fixed `w-96` (24rem).
 */

export const SIDEBAR_MIN_WIDTH = 300;
export const SIDEBAR_MAX_WIDTH = 720;
export const SIDEBAR_DEFAULT_WIDTH = 384;
export const SIDEBAR_WIDTH_STORAGE_KEY = "acc-graph:sidebar-width";

/** Clamp a pixel width into [MIN, MAX], rounding; non-finite → default (∞ clamps to MAX). */
export function clampSidebarWidth(px: number): number {
  if (Number.isNaN(px)) return SIDEBAR_DEFAULT_WIDTH;
  if (px === Number.POSITIVE_INFINITY) return SIDEBAR_MAX_WIDTH;
  if (px === Number.NEGATIVE_INFINITY) return SIDEBAR_MIN_WIDTH;
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(px)));
}

/** Read the persisted width (clamped). Default when unset / corrupt / non-browser. */
export function loadSidebarWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (raw == null) return SIDEBAR_DEFAULT_WIDTH;
    const n = Number(raw);
    return Number.isFinite(n) ? clampSidebarWidth(n) : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

/** Persist a width (clamped) for the next session. No-op outside the browser. */
export function saveSidebarWidth(px: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clampSidebarWidth(px)));
  } catch {
    /* storage unavailable — width simply won't persist */
  }
}
