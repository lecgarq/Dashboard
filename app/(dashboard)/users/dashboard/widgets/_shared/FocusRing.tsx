"use client";

/**
 * Phase 04.1 Plan 01 — Cosmos-glow keyboard focus ring.
 *
 * Renders an SVG outline (rect or circle) with a soft drop-shadow glow.
 * Widgets render this as a sibling overlay above the focused element so the
 * browser default outline can be suppressed (`outline: none` on the focused
 * shape) and the Cosmos look is preserved.
 *
 * Keep `pointer-events: none` so the ring never intercepts clicks — the
 * focused shape underneath remains interactive.
 */

import { motion } from "framer-motion";
import { useDashboardAccent } from "./dashboardTokens";
import { useTransition } from "./useTransition";

type CommonProps = {
  visible: boolean;
  /** Stroke width in px. */
  strokeWidth?: number;
};

type CircleProps = CommonProps & {
  shape?: "circle";
  cx: number;
  cy: number;
  r: number;
};

type RectProps = CommonProps & {
  shape: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
};

export type FocusRingProps = CircleProps | RectProps;

const FAST_SPRING = { type: "spring" as const, stiffness: 300, damping: 28 };

export function FocusRing(props: FocusRingProps) {
  const { highlight } = useDashboardAccent();
  const transition = useTransition(FAST_SPRING);
  const strokeWidth = props.strokeWidth ?? 2;
  const filter = `drop-shadow(0 0 6px ${highlight})`;

  const commonStyle: React.CSSProperties = {
    pointerEvents: "none",
    filter,
  };

  if (props.shape === "rect") {
    return (
      <motion.rect
        x={props.x}
        y={props.y}
        width={props.width}
        height={props.height}
        rx={props.rx}
        fill="none"
        stroke={highlight}
        strokeWidth={strokeWidth}
        style={commonStyle}
        initial={{ opacity: 0 }}
        animate={{ opacity: props.visible ? 1 : 0 }}
        transition={transition}
      />
    );
  }

  return (
    <motion.circle
      cx={props.cx}
      cy={props.cy}
      r={props.r}
      fill="none"
      stroke={highlight}
      strokeWidth={strokeWidth}
      style={commonStyle}
      initial={{ opacity: 0 }}
      animate={{ opacity: props.visible ? 1 : 0 }}
      transition={transition}
    />
  );
}
