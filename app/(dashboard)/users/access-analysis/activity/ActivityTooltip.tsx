"use client";

/**
 * ActivityTooltip.tsx — v2.7 Phase 39 (ACT-04).
 *
 * Portal tooltip for a hovered activity node — resident data only (zero
 * fetches on hover). Mirrors the established NodeTooltip chrome: popover
 * surface, viewport-clamped fixed positioning, pointer-events-none.
 */

import { createPortal } from "react-dom";
import type { ActivityHoverLabels } from "./activityEventLabels";

export interface ActivityTooltipProps {
  /** Canvas-local screen pixels. null = hide. */
  anchorScreenXY: [number, number] | null;
  labels: ActivityHoverLabels | null;
  /** Canvas origin in viewport coords (getBoundingClientRect). */
  canvasOriginXY?: [number, number];
}

const TOOLTIP_W = 280;
const TOOLTIP_H_EST = 140;
const OFFSET = 12;

export function ActivityTooltip({
  anchorScreenXY,
  labels,
  canvasOriginXY,
}: ActivityTooltipProps): React.JSX.Element | null {
  if (!anchorScreenXY || !labels) return null;
  if (typeof document === "undefined") return null;

  const [sx, sy] = anchorScreenXY;
  const [ox, oy] = canvasOriginXY ?? [0, 0];
  const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1080;
  const left = Math.min(vw - TOOLTIP_W - 8, Math.max(8, ox + sx + OFFSET));
  const top = Math.min(vh - TOOLTIP_H_EST - 8, Math.max(8, oy + sy - OFFSET - TOOLTIP_H_EST));

  return createPortal(
    <div
      data-testid="activity-tooltip"
      className="pointer-events-none fixed z-[9999] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
      style={{ left, top, width: TOOLTIP_W }}
    >
      <div className="text-[13px] font-semibold">{labels.verb}</div>
      <div className="truncate text-[11px] text-muted-foreground">
        {labels.module} · {labels.month}
      </div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground">{labels.project}</div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Author</dt>
        <dd className="truncate text-right font-medium">{labels.author}</dd>
        <dt className="text-muted-foreground">Role</dt>
        <dd className="truncate text-right font-medium">{labels.role}</dd>
        <dt className="text-muted-foreground">Company</dt>
        <dd className="truncate text-right font-medium">{labels.company}</dd>
      </dl>
    </div>,
    document.body,
  );
}
