"use client";

// Presentational sub-components for the ACC users spatial graph. These have no
// access to the parent's refs/state — they receive everything via props. Pulled
// out of AccUsersGraph.tsx to keep the main component small.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/core/utils";
import { moduleLabel } from "@/lib/acc/modules";
import type {
  FileActivity,
  FilterOption,
  SidePanelState,
  UserNode,
} from "./accGraphTypes";

export function ModuleToggle({ label, enabled, onToggle }: { label: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span
        className={cn(
          "text-[11px] truncate max-w-[120px]",
          enabled ? "text-gray-700" : "text-gray-400 line-through",
        )}
      >
        {label}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={cn(
            "text-[9px] font-semibold tracking-wide w-6 text-right",
            enabled ? "text-emerald-600" : "text-gray-400",
          )}
        >
          {enabled ? "ON" : "OFF"}
        </span>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={onToggle}
          className={cn(
            "relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200",
            enabled ? "bg-emerald-500" : "bg-gray-300",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-3 w-3 rounded-full shadow transform transition-transform duration-200",
              enabled ? "translate-x-3 bg-white" : "translate-x-0 bg-gray-50",
            )}
          />
        </button>
      </div>
    </div>
  );
}

// DATA-01: companyRole multi-select rendered as a dropdown popover.
// Click the trigger to open; click outside or press Escape to dismiss.
// Selecting an option keeps the panel open so the user can multi-select.
export function CompanyRoleFilter({ options, selected, onToggle }: {
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );
  const triggerLabel =
    selected.length === 0
      ? "All roles"
      : `${selected.length} role${selected.length === 1 ? "" : "s"} selected`;

  return (
    <div className="min-w-0 space-y-1">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Company Role</span>
      <div ref={containerRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white/80 px-2 py-1 text-left text-[11px] text-gray-700 hover:border-gray-400"
        >
          <span className="truncate">{triggerLabel}</span>
          <span className="text-[9px] text-gray-400">{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg p-2 space-y-1.5">
            <input
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search…"
              className="h-6 w-full rounded-md border border-gray-200 bg-white px-2 text-[10px] text-gray-700 outline-none focus:border-gray-400"
            />
            <div className="max-h-40 overflow-y-auto space-y-0.5 pr-0.5">
              {filtered.length === 0 ? (
                <span className="block px-1 text-[10px] text-gray-400">No options</span>
              ) : (
                filtered.map((option) => {
                  const active = selected.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      onClick={() => onToggle(option.value)}
                      title={option.label}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                        active
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900",
                      )}
                    >
                      <span className="truncate">{option.label}</span>
                      <span className={active ? "ml-1 opacity-70" : "ml-1 text-gray-400"}>{option.count}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SliderControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-white/80 px-2 py-1">
      <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="min-w-0 flex-1 accent-gray-900"
        aria-label={label}
      />
      <span className="w-7 shrink-0 rounded bg-gray-100 px-1 py-0.5 text-right text-[10px] font-semibold tabular-nums text-gray-900">
        {value}
      </span>
    </label>
  );
}

export function FilterMenu({
  label,
  options,
  selected,
  onToggle,
  query,
  onQueryChange,
  placeholder,
  maxVisible = 6,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  query?: string;
  onQueryChange?: (value: string) => void;
  placeholder?: string;
  maxVisible?: number;
}) {
  const shownOptions = options.slice(0, maxVisible);
  return (
    <div className="min-w-0 rounded-lg border border-gray-200 bg-white/80 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        {selected.length > 0 && (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
            {selected.length}
          </span>
        )}
      </div>
      {onQueryChange && (
        <input
          value={query ?? ""}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder={placeholder}
          className="mb-1.5 h-6 w-full rounded-md border border-gray-200 bg-white px-2 text-[10px] text-gray-700 outline-none focus:border-gray-400"
        />
      )}
      <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto pr-0.5">
        {shownOptions.length === 0 ? (
          <span className="text-[10px] text-gray-400">No options</span>
        ) : (
          shownOptions.map((option) => {
            const active = selected.includes(option.value);
            return (
              <button
                key={option.value}
                onClick={() => onToggle(option.value)}
                title={option.label}
                className={cn(
                  "max-w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  active
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900",
                )}
              >
                {option.label}
                <span className={active ? "ml-1 opacity-70" : "ml-1 text-gray-400"}>{option.count}</span>
              </button>
            );
          })
        )}
        {options.length > shownOptions.length && (
          <span className="self-center text-[10px] text-gray-400">+{options.length - shownOptions.length}</span>
        )}
      </div>
    </div>
  );
}

export function ToggleFilterControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-200 bg-white/80 p-2">
      <div className="mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      </div>
      <div className="flex gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-md border px-1.5 py-1 text-[10px] font-medium transition-colors",
              value === option.value
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}

/** Format a Date or ISO string as a relative time (e.g. "3 days ago") */
export function fmtRelative(dt: Date | string | null | undefined): string {
  if (!dt) return "—";
  try {
    const d = dt instanceof Date ? dt : new Date(dt);
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days < 1) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  } catch {
    return "—";
  }
}

export function UserTooltip({
  node,
  fileActivity,
  fileActivityLoading,
}: {
  node: UserNode;
  fileActivity: FileActivity;
  fileActivityLoading: boolean;
}) {
  const statusPill = node.aggregatedStatus ?? null;
  const statusColor =
    statusPill === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : statusPill === "pending" ? "bg-amber-50 text-amber-700 border-amber-200"
    : statusPill === "deleted" ? "bg-red-50 text-red-600 border-red-200"
    : null;

  const lastFileAt = fileActivity
    ? ([fileActivity.lastView, fileActivity.lastUpload, fileActivity.lastEdit, fileActivity.lastDelete]
        .filter((d): d is Date => d != null) as Date[])
        .map((d) => new Date(d))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
    : null;

  return (
    <div className="space-y-1.5 min-w-[180px]">
      <p className="text-xs font-semibold text-gray-900 leading-tight">{node.name || node.email}</p>
      <p className="text-[10px] text-gray-500 break-all">{node.email}</p>

      {statusPill && statusColor && (
        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-semibold", statusColor)}>
          {statusPill.charAt(0).toUpperCase() + statusPill.slice(1)}
        </span>
      )}

      {(node.companyName ?? node.companyRole) && (
        <p className="text-[10px] text-gray-600 font-medium truncate">
          {node.companyName ?? node.companyRole}
        </p>
      )}

      {(node.isAccountAdmin || node.projectAdmin || node.executive) && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {node.isAccountAdmin && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-200 font-semibold">
              Hub Admin
            </span>
          )}
          {node.projectAdmin && !node.isAccountAdmin && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
              Project Admin
            </span>
          )}
          {node.executive && !node.isAccountAdmin && !node.projectAdmin && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-semibold">
              Executive
            </span>
          )}
          {node.isAdmin && !node.isAccountAdmin && !node.projectAdmin && !node.executive && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              Admin Access
            </span>
          )}
        </div>
      )}
      {!node.isAccountAdmin && !node.projectAdmin && !node.executive && node.isAdmin && (
        <p className="text-[9px] text-emerald-600 font-semibold">Admin Access</p>
      )}

      {node.lastSignIn && (
        <p className="text-[9px] text-gray-400">
          Sign-in: {fmtRelative(node.lastSignIn)}
        </p>
      )}

      {fileActivityLoading ? (
        <p className="text-[9px] text-gray-400 animate-pulse">File activity…</p>
      ) : lastFileAt ? (
        <p className="text-[9px] text-gray-400">
          File activity: {fmtRelative(lastFileAt)}
        </p>
      ) : null}

      {node.roles.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {node.roles.slice(0, 4).map((r) => (
            <span key={r} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 font-medium">
              {r}
            </span>
          ))}
          {node.roles.length > 4 && <span className="text-[9px] text-gray-400">+{node.roles.length - 4}</span>}
        </div>
      )}

      {node.individualAccess && <p className="text-[9px] text-sky-600 font-semibold">Individual Access Config</p>}
    </div>
  );
}

export function SidePanel({
  state,
  onClose,
}: {
  state: SidePanelState;
  onClose: () => void;
}) {
  const node = state.node;
  const title = node.name || node.email;

  return (
    <div className="w-full h-full bg-white/95 backdrop-blur-sm rounded-xl border border-gray-200 p-4 flex flex-col gap-3 overflow-y-auto shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 leading-snug">{title}</h3>
          <p className="text-[11px] text-gray-400 break-all mt-0.5">{node.email}</p>
        </div>
        <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none mt-0.5">&times;</button>
      </div>

      <div className="space-y-3">
        {!node.found && (
          <p className="text-[11px] text-gray-400 italic bg-gray-50 rounded-lg px-2 py-1.5">
            Not yet synced to ACC.
          </p>
        )}
        {node.found && node.hasNoProjects && (
          <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5">
            Synced but no projects assigned.
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {node.isAdmin && <Tag color="emerald">Admin Access</Tag>}
          {node.individualAccess && <Tag color="gray">Individual Access</Tag>}
        </div>

        {node.projectName && (
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Project</p>
            <p className="text-[11px] text-gray-700 font-medium">{node.projectName}</p>
          </div>
        )}
        {!node.projectName && node.projectCount > 0 && (
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Projects</p>
            <p className="text-[11px] text-gray-700">{node.projectCount} project{node.projectCount > 1 ? "s" : ""}</p>
          </div>
        )}

        {node.lastAddedBucket && (
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Added</p>
            <p className="text-[11px] text-gray-700">{node.lastAddedBucket}</p>
          </div>
        )}

        {node.roles.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Roles</p>
            <div className="flex flex-wrap gap-1">
              {node.roles.map((role) => (
                <span
                  key={role}
                  className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200"
                >
                  {role}
                </span>
              ))}
            </div>
          </div>
        )}

        {node.modules.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Modules</p>
            <div className="flex flex-wrap gap-1">
              {node.modules.map((moduleName) => (
                <span
                  key={moduleName}
                  className="text-[10px] px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200"
                >
                  {moduleLabel(moduleName)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Tag({ color, children }: { color: "emerald" | "amber" | "gray"; children: React.ReactNode }) {
  const styles = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    gray: "bg-gray-100 text-gray-600 border-gray-200",
  };

  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${styles[color]}`}>
      {children}
    </span>
  );
}
