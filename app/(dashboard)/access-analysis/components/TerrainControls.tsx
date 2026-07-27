/**
 * TerrainControls.tsx — SPLIT-02 (REF-01)
 *
 * Presentational chrome for FolderPermissionTerrain: mode toggle, project
 * pickers (single-select + searchable multi-select), the tier legend, and the
 * detail card (incl. its tier-breakdown bar). Extracted verbatim — this file
 * owns only its own local UI state (multi-select open/search); the terrain's
 * mode/selection state lives in the FolderPermissionTerrain shell.
 */
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  tierSwatch,
  tierSwatchTextColor,
  TIER_LEGEND,
  type TerrainCell,
  type TerrainProjectOption,
} from "../folderTerrain";
import { officeLabel } from "../projectGroups";
import { type Mode, type Metric, type Hover } from "./terrainViewModel";

/**
 * Theme-aware tier colours for the FLAT chips in this file — legend swatches,
 * tooltip dots, the detail-panel header, breakdown bars. These are rendered
 * swatches on the card surface, so they take `tierSwatch`, not the raw
 * `TIER_COLORS` ramp (which is theme-invariant and fails the 3:1 floor: "View
 * only" measured 1.38:1 on the zinc card). `TIER_COLORS` stays correct for the
 * lit 3D terrain geometry, where the hex is a lighting input.
 */
function useTierChips() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  return {
    swatch: (rank: number) => tierSwatch(rank, dark),
    ink: (rank: number) => tierSwatchTextColor(rank, dark),
  };
}

export function ToolButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`${label} (left-drag)`}
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
    >{label}</button>
  );
}

export function Tooltip({ hover, width, metric }: { hover: Hover; width: number; metric: Metric }) {
  const chips = useTierChips();
  if (!hover) return null;
  const n = hover.cell.userCount;
  const line = metric === "projects" ? `${n} ${n === 1 ? "project" : "projects"} configure this` : `${n} ${n === 1 ? "user" : "users"} in this role`;
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
      style={{ left: Math.min(hover.x + 12, width - 210), top: Math.max(4, hover.y - 10) }}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-foreground">{hover.cell.folderName}</span>
        {hover.cell.inherited && (
          <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">inherited</span>
        )}
      </div>
      <div className="text-muted-foreground">{hover.cell.roleName}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: chips.swatch(hover.cell.rank) }} />
        <span className="text-foreground">{metric === "projects" ? "typically " : ""}{hover.cell.tier}</span>
        {hover.cell.inherited && <span className="text-muted-foreground">· from parent</span>}
      </div>
      <div className="text-muted-foreground">{line}</div>
    </div>
  );
}

export function ModeToggle({ mode, hasOverview, onChange }: { mode: Mode; hasOverview: boolean; onChange: (m: Mode) => void }) {
  const modes: Mode[] = hasOverview ? ["single", "compare", "overview"] : ["single", "compare"];
  const label: Record<Mode, string> = { single: "Single project", compare: "Compare", overview: "Overview" };
  return (
    <div className="inline-flex rounded-lg border border-border bg-background p-0.5 text-xs">
      {modes.map((m) => (
        <button key={m} onClick={() => onChange(m)} className={`rounded-md px-3 py-1 font-medium transition ${mode === m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          {label[m]}
        </button>
      ))}
    </div>
  );
}

function useOfficeGroups(projects: TerrainProjectOption[]) {
  return useMemo(() => {
    const by = new Map<string, TerrainProjectOption[]>();
    for (const p of projects) { const arr = by.get(p.office); if (arr) arr.push(p); else by.set(p.office, [p]); }
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [projects]);
}

export function ProjectSelect({ projects, value, onChange, disabled }: { projects: TerrainProjectOption[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const groups = useOfficeGroups(projects);
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="max-w-[460px] rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
      {groups.map(([office, opts]) => (
        <optgroup key={office} label={officeLabel(office)}>
          {opts.map((p) => (<option key={p.id} value={p.id}>{p.name} · {p.permCount} perms</option>))}
        </optgroup>
      ))}
    </select>
  );
}

export function ProjectMultiSelect({ projects, selected, onChange, disabled }: { projects: TerrainProjectOption[]; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const groups = useOfficeGroups(projects);
  const sel = useMemo(() => new Set(selected), [selected]);
  const nameById = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (id: string) => { const next = new Set(sel); next.has(id) ? next.delete(id) : next.add(id); onChange([...next]); };
  const filtered = (opts: TerrainProjectOption[]) => (q ? opts.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) : opts);
  const toggleOffice = (opts: TerrainProjectOption[]) => {
    const ids = opts.map((p) => p.id);
    const allOn = ids.every((id) => sel.has(id));
    const next = new Set(sel);
    for (const id of ids) allOn ? next.delete(id) : next.add(id);
    onChange([...next]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        className="flex max-w-[460px] items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <span className="truncate">
          {selected.length === 0 ? "Pick projects to compare…" : selected.slice(0, 2).map((id) => nameById.get(id) ?? id).join(", ")}
          {selected.length > 2 ? ` +${selected.length - 2}` : ""}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{selected.length}</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 flex max-h-[360px] w-[360px] flex-col rounded-xl border border-border bg-popover shadow-xl">
          <div className="flex items-center gap-2 border-b border-border p-2">
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <button onClick={() => onChange([])} className="shrink-0 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">Clear</button>
          </div>
          <div className="overflow-y-auto p-1">
            {groups.map(([office, opts]) => {
              const fopts = filtered(opts);
              if (fopts.length === 0) return null;
              return (
                <div key={office} className="mb-1">
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{officeLabel(office)}</span>
                    <button onClick={() => toggleOffice(fopts)} className="rounded px-1.5 text-[10px] text-primary hover:underline">All</button>
                  </div>
                  {fopts.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted">
                      <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} className="accent-primary" />
                      <span className="truncate text-foreground">{p.name}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{p.permCount}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function TierLegend({ ink }: { ink: string }) {
  const chips = useTierChips();
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: ink }}>
      <span className="uppercase tracking-wider">Less</span>
      <div className="flex items-center gap-0.5">
        {TIER_LEGEND.map((t) => (<span key={t.rank} title={t.label} className="inline-block h-3 w-5 rounded-sm" style={{ background: chips.swatch(t.rank) }} />))}
      </div>
      <span className="uppercase tracking-wider">Full control</span>
      <span className="mx-0.5 h-3 w-px opacity-25" style={{ background: "currentColor" }} aria-hidden />
      <span className="inline-flex items-center gap-1" title="Folders that simply inherit their parent's permissions are dimmed; the bright bars are deliberate access changes.">
        <span className="inline-block h-3 w-5 rounded-sm" style={{ background: chips.swatch(3), opacity: 0.28 }} />
        <span>inherited</span>
      </span>
    </div>
  );
}

export function DetailPanel({ cell, project, metric, users, crossProject, onClose }: {
  cell: TerrainCell; project: string; metric: Metric; users: { name: string; email: string }[];
  crossProject: { project: string; tier: string; rank: number }[] | null; onClose: () => void;
}) {
  const chips = useTierChips();
  const overview = metric === "projects";
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
      <div className="flex items-center justify-between gap-3 px-3 py-2" style={{ background: chips.swatch(cell.rank), color: chips.ink(cell.rank) }}>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{cell.roleName} <span className="opacity-80">on</span> {cell.folderName}</div>
          <div className="truncate text-[11px] opacity-90">{project} · {cell.tier}</div>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-md bg-black/20 px-2 py-0.5 text-xs hover:bg-black/30">Close</button>
      </div>
      <div className="p-3">
        <div className="mb-2 text-xs text-muted-foreground">
          {overview
            ? `Typically ${cell.tier} · configured in ${cell.userCount} ${cell.userCount === 1 ? "project" : "projects"}`
            : `${cell.tier} · ${users.length} ${users.length === 1 ? "user holds" : "users hold"} this role`}
        </div>
        {overview ? (
          <TierBreakdown breakdown={cell.tierBreakdown ?? {}} total={cell.userCount} />
        ) : users.length === 0 ? (
          <p className="text-xs text-muted-foreground">No members are currently assigned this role on the project.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {users.map((u) => (<li key={u.email || u.name} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs" title={u.email}>{u.name}</li>))}
          </ul>
        )}
        {crossProject && crossProject.length > 1 && (
          <div className="mt-3 border-t border-border pt-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">This cell across your projects</div>
            <ul className="flex flex-wrap gap-1.5">
              {crossProject.map((c) => (
                <li key={c.project} className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-1 text-[11px]" title={`${c.project}: ${c.tier}`}>
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: chips.swatch(c.rank) }} />
                  <span className="max-w-[140px] truncate text-foreground">{c.project}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function TierBreakdown({ breakdown, total }: { breakdown: Record<number, number>; total: number }) {
  const chips = useTierChips();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-3 overflow-hidden rounded-full border border-border">
        {TIER_LEGEND.map((t) => {
          const n = breakdown[t.rank] ?? 0;
          if (n === 0) return null;
          return <span key={t.rank} title={`${t.label}: ${n}`} style={{ width: `${(n / Math.max(1, total)) * 100}%`, background: chips.swatch(t.rank) }} />;
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {TIER_LEGEND.filter((t) => (breakdown[t.rank] ?? 0) > 0).map((t) => (
          <span key={t.rank} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: chips.swatch(t.rank) }} />
            {t.label}: {breakdown[t.rank]}
          </span>
        ))}
      </div>
    </div>
  );
}
