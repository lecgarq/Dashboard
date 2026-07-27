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
import { useReducedMotion } from "@/hooks/use-reduced-motion";

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
function useAnimatedNumber(target: number, reducedMotion: boolean): number {
  const [displayed, setDisplayed] = useState(0);
  // The value we're animating FROM (the last rendered frame's number).
  const fromRef = useRef(0);
  // The last target we kicked off an animation toward — guards against
  // restarting when a re-render passes the SAME value.
  const lastTargetRef = useRef<number | null>(null);

  useEffect(() => {
    // Checked BEFORE the unchanged-target guard so switching the OS preference
    // on mid-count lands on the real figure instead of freezing part-way.
    // The globals.css reduced-motion rule only clamps CSS animation and
    // transition; a requestAnimationFrame loop is invisible to it.
    if (reducedMotion) {
      lastTargetRef.current = target;
      fromRef.current = target;
      setDisplayed(target);
      return;
    }

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
  }, [target, reducedMotion]); // re-arm on a new value or a preference change

  return displayed;
}

// ---------------------------------------------------------------------------
// AnimatedNumber component
// ---------------------------------------------------------------------------
function AnimatedNumber({ value, reducedMotion }: { value: number; reducedMotion: boolean }) {
  const displayed = useAnimatedNumber(value, reducedMotion);
  return <>{displayed.toLocaleString()}</>;
}

// ---------------------------------------------------------------------------
// KpiTile
// ---------------------------------------------------------------------------
interface KpiTileProps {
  label: string;
  /** null = not measured yet. Renders an em-dash instead of a number: a KPI whose
   *  source query hasn't landed must not animate a confident 0 at 24px on a
   *  projector. Truthful over impressive, including while loading. */
  value: number | null;
  reducedMotion: boolean;
}

function KpiTile({ label, value, reducedMotion }: KpiTileProps) {
  return (
    <PremiumSurface variant="glass" className="px-4 py-2.5 min-w-[96px]">
      <p className="text-xs text-muted-foreground font-medium leading-tight mb-1 whitespace-nowrap">{label}</p>
      <p className="text-2xl font-bold text-foreground tabular-nums leading-none">
        {value === null ? (
          <span className="text-muted-foreground" title="Still loading — no measurement yet">
            &mdash;
          </span>
        ) : (
          <AnimatedNumber value={value} reducedMotion={reducedMotion} />
        )}
      </p>
    </PremiumSurface>
  );
}

// ---------------------------------------------------------------------------
// UsersTableHeader
// ---------------------------------------------------------------------------
export interface UsersTableHeaderProps {
  totalUsers: number;
  inAcc: number;
  notInAcc: number;
  internals: number;
  externals: number;
  /** null while the activity map query is still in flight — see KpiTileProps.value. */
  active30d: number | null;
  admins: number;
}

export function UsersTableHeader({ totalUsers, inAcc, notInAcc, internals, externals, active30d, admins }: UsersTableHeaderProps) {
  const reducedMotion = useReducedMotion();
  return (
    <div className="relative flex flex-wrap items-center justify-between gap-y-2 py-2 overflow-hidden rounded-2xl">
      {/* Particle accent — absolutely positioned behind KPIs, pointer-events:none.
          Gated here rather than inside the accent so reduced-motion users never
          fetch the three.js chunk or open a WebGL context at all: the field is a
          perpetual loop, which is exactly what the preference asks us not to run. */}
      {!reducedMotion && <HeaderParticleAccent />}

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

      {/* Right: KPI tiles — wraps so no tile is ever clipped by overflow-hidden */}
      <div className="relative z-10 flex flex-wrap items-center justify-end gap-2">
        <KpiTile label="Total users" value={totalUsers} reducedMotion={reducedMotion} />
        <KpiTile label="In ACC" value={inAcc} reducedMotion={reducedMotion} />
        <KpiTile label="Not in ACC" value={notInAcc} reducedMotion={reducedMotion} />
        <KpiTile label="Internal" value={internals} reducedMotion={reducedMotion} />
        <KpiTile label="External" value={externals} reducedMotion={reducedMotion} />
        <KpiTile label="Active 30d" value={active30d} reducedMotion={reducedMotion} />
        <KpiTile label="Admins" value={admins} reducedMotion={reducedMotion} />
      </div>
    </div>
  );
}
