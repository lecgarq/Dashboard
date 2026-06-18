"use client";

/**
 * UsersTableHeader — Premium page header for /users.
 *
 * Renders:
 *  - Left: Page title "Users" with icon
 *  - Right: Three glass KPI tiles (Total users · Active 30d · Admins)
 *           each with a smooth AnimatedNumber count-up (~1s ease-out, once per mount)
 *  - Background: subtle R3F particle accent via dynamic import (ssr:false, frameloop:demand)
 *
 * The header has `position: relative` so HeaderParticleAccent can absolutely-position within it.
 * KPI values are passed as props — no tRPC query in this component.
 *
 * Plan: 04-04 (VIS-04, USR-02)
 */

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { PremiumSurface } from "@/components/ui/PremiumSurface";

// ---------------------------------------------------------------------------
// R3F particle accent — dynamic import (ssr:false) to keep WebGL off the
// data table and out of SSR. Pitfall 4: confined to header strip only.
// ---------------------------------------------------------------------------
const HeaderParticleAccent = dynamic(
  () => import("./HeaderParticleAccent"),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// AnimatedNumber — count-up hook (ease-out ~1s), re-armed on value CHANGE.
//
// The directory data loads asynchronously, so the header first mounts with 0
// and the real KPI values arrive a moment later. A "fire once on mount" guard
// would capture that initial 0 and freeze forever (the G2 live bug). Instead we
// animate from the current displayed value to the target whenever the target
// CHANGES — so it counts up once when data lands, and does NOT restart on
// incidental re-renders (sort/filter/density/panel-open) because those don't
// change the KPI value. Uses requestAnimationFrame for deterministic testing.
// ---------------------------------------------------------------------------
function useAnimatedNumber(target: number): number {
  const [displayed, setDisplayed] = useState(0);
  // The value we're animating FROM (the last rendered frame's number).
  const fromRef = useRef(0);
  // The last target we kicked off an animation toward — guards against
  // restarting when a re-render passes the SAME value.
  const lastTargetRef = useRef<number | null>(null);

  useEffect(() => {
    if (lastTargetRef.current === target) return; // unchanged value → no restart
    lastTargetRef.current = target;

    const from = fromRef.current;
    if (from === target) {
      setDisplayed(target);
      return;
    }

    const duration = 1000; // ms ease-out
    const startTime = performance.now();
    let rafId: number;

    function tick(now: number) {
      const progress = Math.min((now - startTime) / duration, 1);
      // ease-out cubic: f(t) = 1 - (1-t)^3
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (target - from) * eased);
      setDisplayed(current);
      fromRef.current = current;

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        fromRef.current = target; // snap to exact target at the end
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target]); // re-arm whenever the target value changes

  return displayed;
}

// ---------------------------------------------------------------------------
// AnimatedNumber component
// ---------------------------------------------------------------------------
function AnimatedNumber({ value }: { value: number }) {
  const displayed = useAnimatedNumber(value);
  return <>{displayed.toLocaleString()}</>;
}

// ---------------------------------------------------------------------------
// KpiTile
// ---------------------------------------------------------------------------
interface KpiTileProps {
  label: string;
  value: number;
}

function KpiTile({ label, value }: KpiTileProps) {
  return (
    <PremiumSurface variant="glass" className="px-5 py-3 min-w-[110px]">
      <p className="text-xs text-muted-foreground font-medium leading-tight mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground tabular-nums leading-none">
        <AnimatedNumber value={value} />
      </p>
    </PremiumSurface>
  );
}

// ---------------------------------------------------------------------------
// UsersTableHeader
// ---------------------------------------------------------------------------
export interface UsersTableHeaderProps {
  totalUsers: number;
  active30d: number;
  admins: number;
}

export function UsersTableHeader({ totalUsers, active30d, admins }: UsersTableHeaderProps) {
  return (
    <div className="relative flex items-center justify-between py-2 overflow-hidden rounded-2xl">
      {/* Particle accent — absolutely positioned behind KPIs, pointer-events:none */}
      <HeaderParticleAccent />

      {/* Left: title block */}
      <div className="relative z-10 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0">
          <Users size={16} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Users</h1>
          <p className="text-xs text-muted-foreground">People &amp; access directory</p>
        </div>
      </div>

      {/* Right: KPI tiles */}
      <div className="relative z-10 flex items-center gap-3">
        <KpiTile label="Total users" value={totalUsers} />
        <KpiTile label="Active 30d" value={active30d} />
        <KpiTile label="Admins" value={admins} />
      </div>
    </div>
  );
}
