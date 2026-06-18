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
// AnimatedNumber — count-up hook (once per mount, ease-out ~1s)
// Uses requestAnimationFrame for deterministic testability.
// Depends only on the initial value so re-renders don't restart the animation.
// ---------------------------------------------------------------------------
function useAnimatedNumber(target: number): number {
  // Capture the initial target on mount — never update this dep to prevent re-firing.
  const initialTarget = useRef(target);
  const [displayed, setDisplayed] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    const finalValue = initialTarget.current;
    if (finalValue === 0) {
      setDisplayed(0);
      return;
    }

    const duration = 1000; // ms ease-out
    const startTime = performance.now();

    let rafId: number;

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic: f(t) = 1 - (1-t)^3
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * finalValue);
      setDisplayed(current);

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty dep array — fires once on mount only

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
