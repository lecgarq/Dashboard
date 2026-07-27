"use client";
import type { ProjectCoverage } from "@/lib/server/projectCoverageView";
import { OTHER_CODE } from "../projectGroups";

/** A project is "fully covered" when we hold both its activity log and folder crawl. */
export function isFullyCovered(c?: ProjectCoverage): boolean {
  return !!c && c.hasActivity && c.folderCrawled;
}

function coverageTitle(c?: ProjectCoverage): string {
  if (!c) return "Coverage unknown";
  const parts = [
    `Activity data ${c.hasActivity ? "✓" : "—"}`,
    `Folder crawl ${c.folderCrawled ? "✓" : "—"}`,
    `File crawl ${c.fileCrawled ? "✓" : "—"}`,
  ];
  return (isFullyCovered(c) ? "Fully covered · " : "") + parts.join(" · ");
}

/** Curated hues for the main city offices; others hash to a stable hue. */
const OFFICE_HUE: Record<string, number> = {
  MTY: 210, CDMX: 280, MXL: 162, TIJ: 28, HMO: 350, GDL: 130, QRO: 320,
};
function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
function officeHue(code: string): number {
  return OFFICE_HUE[code] ?? hashHue(code);
}

/** Small office pill: a hue dot + the office code, theme-safe (neutral chrome). */
export function OfficeBadge({ code, label, className = "" }: { code: string; label?: string; className?: string }) {
  const isOther = code === OTHER_CODE;
  return (
    <span
      title={label && label !== code ? `${label} (${code})` : label ?? code}
      className={`inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${className}`}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: isOther ? "var(--muted-foreground, #94a3b8)" : `hsl(${officeHue(code)} 70% 55%)` }}
      />
      {code === OTHER_CODE ? "Other" : code}
    </span>
  );
}

function Dot({ on, title }: { on: boolean; title: string }) {
  return (
    <span
      title={title}
      aria-hidden
      className={`h-2 w-2 rounded-full ${on ? "bg-success shadow-[0_0_5px_currentColor] text-success" : "bg-muted ring-1 ring-inset ring-border"}`}
    />
  );
}

/** Compact two-dot coverage (activity + folders) for tight rows like the picker. */
export function CoverageDots({ coverage }: { coverage?: ProjectCoverage }) {
  return (
    <span className="inline-flex items-center gap-1" title={coverageTitle(coverage)}>
      <Dot on={!!coverage?.hasActivity} title="Activity data" />
      <Dot on={!!coverage?.folderCrawled} title="Folder crawl" />
    </span>
  );
}

function Chip({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
        on ? "bg-success/15 text-success" : "bg-muted/60 text-muted-foreground/60 line-through decoration-1"
      }`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${on ? "bg-success" : "bg-muted-foreground/40"}`} />
      {label}
    </span>
  );
}

/** Labeled coverage chips (activity / folders / files) for roomier panels. */
export function CoverageChips({ coverage }: { coverage?: ProjectCoverage }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1" title={coverageTitle(coverage)}>
      <Chip on={!!coverage?.hasActivity} label="Activity" />
      <Chip on={!!coverage?.folderCrawled} label="Folders" />
      <Chip on={!!coverage?.fileCrawled} label="Files" />
    </span>
  );
}

/** A short "Fully covered" award pill, shown only when both core signals are present. */
export function FullyCoveredBadge({ coverage }: { coverage?: ProjectCoverage }) {
  if (!isFullyCovered(coverage)) return null;
  return (
    <span
      title={coverageTitle(coverage)}
      className="inline-flex items-center gap-1 rounded-md bg-success/15 px-1.5 py-0.5 text-[11px] font-semibold text-success"
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5 10 17.5 19 6.5" />
      </svg>
      Full data
    </span>
  );
}
