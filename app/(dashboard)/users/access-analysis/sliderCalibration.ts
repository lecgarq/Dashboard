/**
 * sliderCalibration.ts — Perceptual slider→force response curve (Phase D).
 *
 * A force sim saturates: most visible cluster separation happens in the first
 * slider increments. This maps the raw normalized slider (0..1) to an eased value
 * used for the per-node force pull so each 10-pt step yields a more even increment
 * in separation (spec §10.4). Tuned empirically by the acc-positioning calibration
 * probe. GAMMA > 1 is convex → delays motion → evens out late steps.
 *
 * Default GAMMA = 1 → identity (no behavior change) until the probe sets it.
 * Pure & deterministic: same input → same output, so cached positions never "snap".
 */
export const SLIDER_RESPONSE_GAMMA = 1; // tuned by tests/e2e/acc-positioning.spec.ts

export function calibrateSliderResponse(norm: number): number {
  const n = Math.min(1, Math.max(0, norm));
  return SLIDER_RESPONSE_GAMMA === 1 ? n : Math.pow(n, SLIDER_RESPONSE_GAMMA);
}
