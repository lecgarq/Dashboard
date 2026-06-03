"use client";

/**
 * NodeTooltip.tsx — Phase 4-01 Task 3.
 *
 * Portal-rendered tooltip showing the 6-field NodeFeatureSnapshot anchored to the
 * hovered node's screen position. Clamped to viewport edges so it never falls off
 * the visible area. RESEARCH Pattern 5.
 *
 * Position is set via fixed coordinates so the tooltip survives parent scroll
 * containers. SSR-safe — renders null when document is unavailable.
 */

import { createPortal } from "react-dom";
import type { NodeFeatureSnapshot } from "./interactionTypes";

export interface NodeTooltipProps {
  /** Canvas-local screen pixels (NOT page-relative). null = hide. */
  anchorScreenXY: [number, number] | null;
  /** Feature data for the hovered node. null = hide. */
  feature: NodeFeatureSnapshot | null;
  /**
   * Bounding rect of the underlying graph canvas — needed to translate
   * canvas-local pixels into viewport-fixed coords. Defaults to (0, 0).
   */
  canvasOriginXY?: [number, number];
}

const TOOLTIP_W = 280;
const TOOLTIP_H_EST = 160;
const OFFSET_X = 12;
const OFFSET_Y = 12;

export function NodeTooltip({
  anchorScreenXY,
  feature,
  canvasOriginXY,
}: NodeTooltipProps): React.JSX.Element | null {
  if (!anchorScreenXY || !feature) return null;
  if (typeof document === "undefined") return null;

  const [sx, sy] = anchorScreenXY;
  const [ox, oy] = canvasOriginXY ?? [0, 0];

  // Translate canvas-local → viewport coords, then clamp.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1080;
  const left = Math.min(vw - TOOLTIP_W - 8, Math.max(8, ox + sx + OFFSET_X));
  const top = Math.min(vh - TOOLTIP_H_EST - 8, Math.max(8, oy + sy - OFFSET_Y - TOOLTIP_H_EST));

  return createPortal(
    <div
      data-testid="node-tooltip"
      style={{
        position: "fixed",
        left,
        top,
        width: TOOLTIP_W,
        background: "rgba(24,24,27,0.96)", // zinc-900
        color: "#f4f4f5", // zinc-100
        border: "1px solid #3f3f46", // zinc-700
        borderRadius: 6,
        padding: "10px 12px",
        fontSize: 12,
        lineHeight: 1.4,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13 }}>
        {feature.nameLower ? capitalize(feature.nameLower) : "(unknown)"}
      </div>
      <div style={{ color: "#a1a1aa", fontSize: 11 }}>{feature.emailLower || "—"}</div>
      <div style={{ marginTop: 6 }}>Project: {feature.project}</div>
      <div>Role: {feature.role}</div>
      <div>Last sign-in: {feature.lastSignInRel}</div>
      <div>
        Activity: {feature.activityCountRaw} ({feature.activityBucket})
      </div>
      {typeof feature.projectCount === "number" && (
        <div>Projects: {feature.projectCount}</div>
      )}
    </div>,
    document.body,
  );
}

/** Title-case a lowercased name for display. */
function capitalize(s: string): string {
  return s
    .split(" ")
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}
