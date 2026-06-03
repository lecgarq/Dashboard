"use client";

import { useEffect, useRef } from "react";

export interface VgPlotChartProps {
  plot: HTMLElement;
  className?: string;
}

/**
 * A standard, high-performance React adapter for @uwdata/vgplot.
 * It mounts and updates vgplot HTMLElement charts inside a React rendering context
 * without causing extra reflows or duplicating coordinator client registrations.
 */
export function VgPlotChart({ plot, className }: VgPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Direct DOM manipulation guarantees zero-copy, lag-free canvas mounting
    container.replaceChildren(plot);

    return () => {
      container.replaceChildren();
    };
  }, [plot]);

  return <div ref={containerRef} className={className} />;
}
