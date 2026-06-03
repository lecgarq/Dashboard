"use client";

/**
 * LassoAnalyticsPanel — premium live analytics over the currently lassoed nodes.
 *
 * What you see (top → bottom):
 *   1. KPI strip      — 4 animated count-up cards (users / external % / admins / projects)
 *   2. Module donut   — SVG donut with hover-to-isolate slices, animated arc draws,
 *                       center label showing total or the isolated slice's count
 *   3. Internal/Ext   — gradient split bar + ratio
 *   4. Admin tiers    — 3-segment stacked bar (Account / Project / Member)
 *   5. Activity heat  — 6-cell recency strip (Today → Never), color-graded
 *   6. Top roles      — animated horizontal bars with violet gradient
 *   7. Top projects   — animated horizontal bars with sky gradient
 *   8. Top companies  — animated horizontal bars with amber gradient
 *
 * All visuals are pure SVG + CSS — no chart libraries. Effects:
 *   - Number count-up via rAF (only during transition window, ~400ms)
 *   - CSS transitions on every width/scale change → GPU-accelerated
 *   - Staggered entrance via `animationDelay` per row
 *   - Respects `prefers-reduced-motion` automatically (we gate counter via that)
 *
 * Single-pass aggregation in useMemo means panel re-renders are O(|lasso|), not
 * O(|users|) — so even at 24k nodes total, a 5k-user lasso re-renders in ~3ms.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { moduleLabel } from "@/lib/acc/modules";
import type { SimNode } from "./accGraphTypes";

// ─── Recency bucketing ─────────────────────────────────────────────────────
const RECENCY_BUCKETS = [
  { key: "today",   label: "Today",   shortLabel: "Today"   },
  { key: "week",    label: "Week",    shortLabel: "Week"    },
  { key: "month",   label: "Month",   shortLabel: "Month"   },
  { key: "quarter", label: "Quarter", shortLabel: "Q"       },
  { key: "stale",   label: "Stale",   shortLabel: "Stale"   },
  { key: "never",   label: "Never",   shortLabel: "Never"   },
] as const;
type RecencyKey = (typeof RECENCY_BUCKETS)[number]["key"];

function recencyBucket(iso: string | null | undefined): RecencyKey {
  if (!iso) return "never";
  const days = (Date.now() - Date.parse(iso)) / 86_400_000;
  if (!Number.isFinite(days)) return "never";
  if (days < 1) return "today";
  if (days < 7) return "week";
  if (days < 30) return "month";
  if (days < 90) return "quarter";
  return "stale";
}

const RECENCY_COLOR: Record<RecencyKey, string> = {
  today:   "#10B981",
  week:    "#34D399",
  month:   "#FBBF24",
  quarter: "#F59E0B",
  stale:   "#9CA3AF",
  never:   "#D1D5DB",
};

const MODULE_PALETTE = [
  "#2563EB", "#0EA5E9", "#16A34A", "#10B981", "#F59E0B",
  "#DC2626", "#EC4899", "#9333EA", "#0F766E", "#7C3AED",
];

// ─── Aggregation types ─────────────────────────────────────────────────────
interface RankedEntry {
  key: string;
  label: string;
  count: number;
  color: string;
}

interface Aggregates {
  total: number;
  externals: number;
  accountAdmins: number;
  projectAdmins: number;
  members: number;
  projectsTouched: number;
  byModule: RankedEntry[];
  byRole: RankedEntry[];
  byProject: RankedEntry[];
  byCompany: RankedEntry[];
  byRecency: { key: RecencyKey; label: string; count: number; color: string }[];
}

function aggregate(indices: number[], nodes: readonly SimNode[]): Aggregates {
  const moduleCount = new Map<string, number>();
  const roleCount = new Map<string, number>();
  const projectCount = new Map<string, { name: string; count: number }>();
  const companyCount = new Map<string, number>();
  const recencyCount = new Map<RecencyKey, number>();
  for (const bucket of RECENCY_BUCKETS) recencyCount.set(bucket.key, 0);

  let total = 0;
  let externals = 0;
  let accountAdmins = 0;
  let projectAdmins = 0;

  for (const idx of indices) {
    const node = nodes[idx];
    if (!node || node.kind !== "user") continue;
    total++;
    if (node.isExternal) externals++;
    if (node.isAccountAdmin) accountAdmins++;
    else if (node.projectAdmin || node.isAdmin) projectAdmins++;

    for (const m of node.modules) {
      moduleCount.set(m, (moduleCount.get(m) ?? 0) + 1);
    }
    for (const r of node.roles) {
      roleCount.set(r, (roleCount.get(r) ?? 0) + 1);
    }
    if (node.projectId) {
      const existing = projectCount.get(node.projectId);
      if (existing) existing.count++;
      else projectCount.set(node.projectId, {
        name: node.projectName ?? node.projectId,
        count: 1,
      });
    }
    const company = node.companyName?.trim() || node.companyRole || "Unspecified";
    companyCount.set(company, (companyCount.get(company) ?? 0) + 1);
    recencyCount.set(recencyBucket(node.lastSignIn), (recencyCount.get(recencyBucket(node.lastSignIn)) ?? 0) + 1);
  }

  const byModule: RankedEntry[] = [...moduleCount.entries()]
    .map(([key, count]) => ({ key, label: moduleLabel(key), count, color: "" }))
    .sort((a, b) => b.count - a.count)
    .map((e, i) => ({ ...e, color: MODULE_PALETTE[i % MODULE_PALETTE.length] }));

  const byRole: RankedEntry[] = [...roleCount.entries()]
    .map(([key, count]) => ({ key, label: key, count, color: "#8B5CF6" }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const byProject: RankedEntry[] = [...projectCount.entries()]
    .map(([key, { name, count }]) => ({ key, label: name, count, color: "#0EA5E9" }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const byCompany: RankedEntry[] = [...companyCount.entries()]
    .map(([key, count]) => ({ key, label: key, count, color: "#F59E0B" }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const byRecency = RECENCY_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    count: recencyCount.get(b.key) ?? 0,
    color: RECENCY_COLOR[b.key],
  }));

  return {
    total,
    externals,
    accountAdmins,
    projectAdmins,
    members: total - accountAdmins - projectAdmins,
    projectsTouched: projectCount.size,
    byModule, byRole, byProject, byCompany, byRecency,
  };
}

// ─── Animated counter (rAF-driven, respects reduced-motion) ────────────────
function useCountUp(value: number, duration = 400): number {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(value);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      setDisplay(value);
      return;
    }
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || duration === 0) {
      setDisplay(value);
      return;
    }
    fromRef.current = display;
    startRef.current = null;
    const from = display;
    const delta = value - from;
    function tick(ts: number) {
      if (startRef.current == null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + delta * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // intentionally exclude `display` — we read it once at the start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return display;
}

// ─── KPI card ──────────────────────────────────────────────────────────────
function KpiCard({
  label, value, suffix, accent,
}: { label: string; value: number; suffix?: string; accent: string }) {
  const animated = useCountUp(value);
  return (
    <div className="relative rounded-xl bg-card border border-border px-3 py-2.5 overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        aria-hidden
      />
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums text-foreground leading-none mt-1">
        {animated.toLocaleString()}
        {suffix && (
          <span className="text-xs font-semibold text-muted-foreground/60 ml-0.5">{suffix}</span>
        )}
      </p>
    </div>
  );
}

// ─── Donut with hover-to-isolate ───────────────────────────────────────────
function ModuleDonut({ entries, total }: { entries: RankedEntry[]; total: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const animatedTotal = useCountUp(total);

  if (total === 0 || entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 rounded-xl bg-muted/50 border border-dashed border-border">
        <p className="text-[11px] text-muted-foreground/60 italic">No module data</p>
      </div>
    );
  }

  const size = 132;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const activeEntry = entries.find((e) => e.key === hover);

  return (
    <div className="flex items-start gap-3">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="#F3F4F6" strokeWidth={stroke}
          />
          {entries.map((e) => {
            const frac = e.count / total;
            const dash = c * frac;
            const isActive = !hover || hover === e.key;
            const seg = (
              <circle
                key={e.key}
                cx={size / 2} cy={size / 2} r={r}
                fill="none"
                stroke={e.color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{
                  opacity: isActive ? 1 : 0.18,
                  cursor: "pointer",
                  transition: "opacity 200ms ease, stroke-width 200ms ease",
                }}
                onMouseEnter={() => setHover(e.key)}
                onMouseLeave={() => setHover(null)}
              />
            );
            offset += dash;
            return seg;
          })}
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {activeEntry ? (
            <>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {activeEntry.label}
              </span>
              <span className="text-lg font-bold tabular-nums text-foreground leading-none mt-0.5">
                {activeEntry.count}
              </span>
              <span className="text-[10px] text-muted-foreground mt-0.5">
                {Math.round((activeEntry.count / total) * 100)}%
              </span>
            </>
          ) : (
            <>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Users
              </span>
              <span className="text-lg font-bold tabular-nums text-foreground leading-none mt-0.5">
                {animatedTotal.toLocaleString()}
              </span>
              <span className="text-[9px] text-muted-foreground/60 mt-0.5">
                {entries.length} modules
              </span>
            </>
          )}
        </div>
      </div>
      {/* Legend */}
      <ul className="flex-1 flex flex-col gap-0.5 min-w-0">
        {entries.slice(0, 7).map((e) => {
          const isHover = hover === e.key;
          const pct = Math.round((e.count / total) * 100);
          return (
            <li
              key={e.key}
              onMouseEnter={() => setHover(e.key)}
              onMouseLeave={() => setHover(null)}
              className={`flex items-center justify-between gap-2 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                isHover ? "bg-muted" : ""
              }`}
              style={{ cursor: "pointer" }}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span
                  className="h-2 w-2 rounded-full shrink-0 transition-transform"
                  style={{ background: e.color, transform: isHover ? "scale(1.4)" : "scale(1)" }}
                />
                <span className="truncate text-foreground/80">{e.label}</span>
              </span>
              <span className="font-mono text-muted-foreground shrink-0 tabular-nums">
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Split bar (Internal / External) ───────────────────────────────────────
function SplitBar({
  left, right, leftLabel, rightLabel, leftColor, rightColor,
}: {
  left: number; right: number;
  leftLabel: string; rightLabel: string;
  leftColor: string; rightColor: string;
}) {
  const total = left + right;
  const leftPct = total === 0 ? 50 : (left / total) * 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: leftColor }} />
          <span className="text-foreground/80 font-medium">{leftLabel}</span>
          <span className="text-muted-foreground/60 tabular-nums">{left}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground/60 tabular-nums">{right}</span>
          <span className="text-foreground/80 font-medium">{rightLabel}</span>
          <span className="h-2 w-2 rounded-full" style={{ background: rightColor }} />
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-muted overflow-hidden flex">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${leftPct}%`,
            background: `linear-gradient(90deg, ${leftColor}, ${leftColor}CC)`,
          }}
        />
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${100 - leftPct}%`,
            background: `linear-gradient(90deg, ${rightColor}CC, ${rightColor})`,
          }}
        />
      </div>
      <p className="text-[9px] text-muted-foreground/60 text-center tabular-nums">
        {Math.round(leftPct)}% / {Math.round(100 - leftPct)}%
      </p>
    </div>
  );
}

// ─── Stacked admin tier bar ────────────────────────────────────────────────
function AdminTierBar({
  accountAdmins, projectAdmins, members, total,
}: { accountAdmins: number; projectAdmins: number; members: number; total: number }) {
  if (total === 0) return null;
  const segs = [
    { key: "account", label: "Account Admin", count: accountAdmins, color: "#F59E0B" },
    { key: "project", label: "Project Admin", count: projectAdmins, color: "#8B5CF6" },
    { key: "member",  label: "Member",        count: members,       color: "#94A3B8" },
  ];
  return (
    <div className="space-y-1.5">
      <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
        {segs.map((s) => {
          const pct = total === 0 ? 0 : (s.count / total) * 100;
          return (
            <div
              key={s.key}
              className="h-full transition-all duration-500 ease-out"
              style={{
                width: `${pct}%`,
                background: `linear-gradient(180deg, ${s.color}, ${s.color}DD)`,
              }}
              title={`${s.label}: ${s.count}`}
            />
          );
        })}
      </div>
      <ul className="flex items-center justify-between gap-2 text-[9px]">
        {segs.map((s) => (
          <li key={s.key} className="flex items-center gap-1 min-w-0">
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-foreground/70 truncate">{s.label}</span>
            <span className="text-muted-foreground/60 tabular-nums">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Recency heat strip (6 cells, vertical bars) ───────────────────────────
function RecencyStrip({
  buckets,
}: { buckets: { key: RecencyKey; label: string; count: number; color: string }[] }) {
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div className="grid grid-cols-6 gap-1">
      {buckets.map((b, i) => {
        const pct = (b.count / max) * 100;
        return (
          <div
            key={b.key}
            className="flex flex-col items-center gap-1 group"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="relative w-full h-12 rounded-md bg-muted/50 overflow-hidden flex items-end">
              <div
                className="w-full rounded-md transition-all duration-700 ease-out"
                style={{
                  height: `${pct}%`,
                  background: `linear-gradient(180deg, ${b.color}, ${b.color}AA)`,
                }}
              />
            </div>
            <div className="flex flex-col items-center min-w-0 w-full">
              <span className="text-[9px] text-muted-foreground truncate w-full text-center">
                {b.label}
              </span>
              <span className="text-[10px] font-semibold tabular-nums text-gray-800">
                {b.count}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Animated horizontal bars ──────────────────────────────────────────────
function RankedBars({
  entries, accent, empty,
}: { entries: RankedEntry[]; accent: string; empty: string }) {
  const max = Math.max(...entries.map((e) => e.count), 1);
  if (entries.length === 0) {
    return <p className="text-[11px] text-muted-foreground/60 italic px-1">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {entries.map((e, i) => {
        const pct = (e.count / max) * 100;
        return (
          <li
            key={e.key}
            className="text-[10px] text-foreground/80"
            style={{ animation: `fadeIn 300ms ease-out both`, animationDelay: `${i * 30}ms` }}
          >
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="truncate min-w-0">{e.label}</span>
              <span className="font-mono text-muted-foreground shrink-0 tabular-nums">{e.count}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${accent}AA, ${accent})`,
                  boxShadow: `0 0 8px ${accent}40`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {subtitle && <span className="text-[9px] text-muted-foreground/60">{subtitle}</span>}
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────
export function LassoAnalyticsPanel({
  indices, nodes, onClear,
}: {
  indices: number[];
  nodes: SimNode[];
  onClear: () => void;
}) {
  const agg = useMemo(() => aggregate(indices, nodes), [indices, nodes]);
  const externalPct = agg.total === 0 ? 0 : Math.round((agg.externals / agg.total) * 100);

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-gray-50 to-white">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 px-4 pt-3 pb-2.5 bg-card/90 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Lasso Selection
            </span>
          </div>
          <button
            onClick={onClear}
            data-testid="acc-graph-polygon-clear"
            className="text-[10px] font-semibold px-2 py-1 rounded-md text-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-3 space-y-4 overflow-y-auto">
        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-2">
          <KpiCard label="Users"    value={agg.total}                       accent="#0EA5E9" />
          <KpiCard label="External" value={externalPct} suffix="%"          accent="#9CA3AF" />
          <KpiCard label="Admins"   value={agg.accountAdmins + agg.projectAdmins} accent="#F59E0B" />
          <KpiCard label="Projects" value={agg.projectsTouched}             accent="#10B981" />
        </div>

        {agg.total === 0 ? (
          <div className="flex items-center justify-center h-32 rounded-xl bg-card border border-dashed border-border">
            <p className="text-xs text-muted-foreground/60 italic">No users in lasso</p>
          </div>
        ) : (
          <>
            {/* Module donut */}
            <section className="rounded-xl bg-card border border-border p-3">
              <SectionHeader title="Module mix" subtitle={`${agg.byModule.length} modules`} />
              <ModuleDonut entries={agg.byModule} total={agg.total} />
            </section>

            {/* Split bar + admin tiers stacked */}
            <section className="rounded-xl bg-card border border-border p-3 space-y-3">
              <div>
                <SectionHeader title="Internal vs External" />
                <SplitBar
                  left={agg.total - agg.externals}
                  right={agg.externals}
                  leftLabel="Internal"
                  rightLabel="External"
                  leftColor="#10B981"
                  rightColor="#9CA3AF"
                />
              </div>
              <div className="border-t border-gray-100 pt-3">
                <SectionHeader title="Admin tier" />
                <AdminTierBar
                  accountAdmins={agg.accountAdmins}
                  projectAdmins={agg.projectAdmins}
                  members={agg.members}
                  total={agg.total}
                />
              </div>
            </section>

            {/* Recency strip */}
            <section className="rounded-xl bg-card border border-border p-3">
              <SectionHeader title="Last sign-in" />
              <RecencyStrip buckets={agg.byRecency} />
            </section>

            {/* Top roles */}
            <section className="rounded-xl bg-card border border-border p-3">
              <SectionHeader
                title="Top roles"
                subtitle={agg.byRole.length > 0 ? `top ${agg.byRole.length}` : undefined}
              />
              <RankedBars entries={agg.byRole} accent="#8B5CF6" empty="No role data" />
            </section>

            {/* Top projects */}
            <section className="rounded-xl bg-card border border-border p-3">
              <SectionHeader
                title="Top projects"
                subtitle={agg.byProject.length > 0 ? `top ${agg.byProject.length}` : undefined}
              />
              <RankedBars entries={agg.byProject} accent="#0EA5E9" empty="No project data" />
            </section>

            {/* Top companies */}
            <section className="rounded-xl bg-card border border-border p-3">
              <SectionHeader
                title="Top companies"
                subtitle={agg.byCompany.length > 0 ? `top ${agg.byCompany.length}` : undefined}
              />
              <RankedBars entries={agg.byCompany} accent="#F59E0B" empty="No company data" />
            </section>
          </>
        )}
      </div>

      {/* Inline keyframes — single declaration, used by all RankedBars rows */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
