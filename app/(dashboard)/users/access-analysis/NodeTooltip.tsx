"use client";

/**
 * NodeTooltip.tsx — Phase 4-01 Task 3.
 *
 * Portal-rendered headline tooltip anchored to the hovered node's screen position.
 * Clamped to viewport edges so it never falls off the visible area.
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
const TOOLTIP_H_EST = 150;
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
  const permissionKnown = feature.permissionCoverage !== "unknown";
  const breadth = feature.permissionTypeSummary?.folderBreadth;
  const tier = permissionKnown && feature.permTier ? feature.permTier : "Unavailable";
  const breadthText =
    permissionKnown && typeof breadth === "number"
      ? `${breadth.toLocaleString("en-US")} folders${
          feature.permissionCoverage === "partial" ? " (partial)" : ""
        }`
      : "Unavailable";

  return createPortal(
    <div
      data-testid="node-tooltip"
      className="pointer-events-none fixed z-[9999] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
      style={{ left, top, width: TOOLTIP_W }}
    >
      <div className="text-[13px] font-semibold">
        {feature.nameLower ? capitalize(feature.nameLower) : "(unknown)"}
      </div>
      <div className="truncate text-[11px] text-muted-foreground">
        {feature.emailLower || "—"}
      </div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground">
        {feature.project} · {feature.role}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Permission tier</dt>
        <dd className="text-right font-medium">{tier}</dd>
        <dt className="text-muted-foreground">Activity recency</dt>
        <dd className="text-right font-medium">
          {feature.activityRecencyBucket ?? "Unavailable"}
        </dd>
        <dt className="text-muted-foreground">Folder breadth</dt>
        <dd className="text-right font-medium">{breadthText}</dd>
      </dl>
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
