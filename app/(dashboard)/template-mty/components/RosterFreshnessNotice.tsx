// app/(dashboard)/template-mty/components/RosterFreshnessNotice.tsx
"use client";

import type { RosterAge } from "@/lib/acc/rosterFreshness";

/**
 * The template roster is transcribed by hand from ACC's web UI — no ACC API
 * returns it (see lib/acc/template-mty-roster.ts). Every other number on this
 * page comes from the live database, so a bare "Roster updated 2026-06-10" line
 * reads as telemetry and looks identical on day 1 and day 400.
 *
 * This states the provenance in words and ages the capture date, so the snapshot
 * degrades visibly instead of quietly.
 */
export function RosterFreshnessNotice({ age }: { age: RosterAge }) {
  const stale = age.tone !== "fresh";
  return (
    <div
      role="note"
      data-testid="roster-freshness"
      data-tone={age.tone}
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3 py-2 text-xs ${
        stale
          ? "border-warning/40 bg-warning-bg text-warning"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${stale ? "bg-warning" : "bg-muted-foreground"}`}
      />
      <span className="font-semibold uppercase tracking-wide">Hand-maintained snapshot</span>
      <span aria-hidden className="opacity-40">·</span>
      <span>
        captured <time dateTime={age.capturedAt}>{age.capturedAt}</time>, {age.ageLabel}
      </span>
      <span aria-hidden className="opacity-40">·</span>
      <span className={stale ? "" : "text-muted-foreground"}>
        no ACC API returns this roster, so it only refreshes when someone re-copies it
        {stale ? " — re-capture before quoting these figures" : ""}.
      </span>
    </div>
  );
}
