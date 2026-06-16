"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  RefreshCw,
  Building2,
  Search,
  ChevronDown,
  ChevronRight,
  Shield,
  Package,
  FolderOpen,
  ArrowUpDown,
  X,
  Crown,
  Layers,
  Activity,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Master list of ACC/Forma products — 9 modules in display order.
 * "Forma Data Management" is the renamed Autodesk Docs (not a separate entry).
 */
const ALL_MODULES = [
  { key: "datum",                name: "Datum" },
  { key: "documentManagement",   name: "Forma Data Management" },
  { key: "designCollaboration",  name: "Forma Design Collaboration" },
  { key: "modelCoordination",    name: "Model Coordination" },
  { key: "preconstruction",      name: "Preconstruction" },
  { key: "autoSpecs",            name: "AutoSpecs" },
  { key: "build",                name: "Build" },
  { key: "insight",              name: "Insight" },
  { key: "design",               name: "Design" },
] as const;

type SortField = "name" | "status" | "modules" | "admin";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays < 1) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

// ---------------------------------------------------------------------------
// Apple-style Toggle Switch (read-only)
// ---------------------------------------------------------------------------

function ToggleSwitch({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-all duration-300 cursor-default",
        active
          ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.35)]"
          : "bg-gray-600/30"
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] h-[14px] w-[14px] rounded-full shadow transition-all duration-300",
          active
            ? "translate-x-[17px] bg-white"
            : "translate-x-[3px] bg-gray-400"
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AccLoadingProgress
// ---------------------------------------------------------------------------

const LOAD_STEPS = [
  { label: "Connecting to Autodesk", until: 20 },
  { label: "Verifying account access", until: 40 },
  { label: "Fetching projects", until: 65 },
  { label: "Loading modules & roles", until: 88 },
  { label: "Almost done", until: 95 },
];

export function AccLoadingProgress() {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    function tick(ts: number) {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const target = 95 * (1 - Math.exp(-elapsed / 3500));
      setProgress(Math.min(target, 95));
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const activeStep =
    LOAD_STEPS.find((s) => progress < s.until) ??
    LOAD_STEPS[LOAD_STEPS.length - 1];

  return (
    <div className="mt-6 pt-5 border-t-2 border-border/50 space-y-4">
      <h3 className="text-sm font-bold text-foreground uppercase tracking-wide flex items-center gap-2">
        <Activity size={16} className="text-primary" />
        Autodesk ACC
      </h3>
      <div className="relative h-2 rounded-full bg-muted/30 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-primary/70 transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground animate-pulse">
        {activeStep.label}… {Math.round(progress)}%
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Card — bold, clear, color-coded
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: React.ElementType;
  value: number | string;
  label: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl bg-card border border-border/40">
      <Icon size={16} className={color} />
      <span className="text-xl font-extrabold tabular-nums text-foreground leading-none">
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module toggle row — larger, clearer
// ---------------------------------------------------------------------------

function ModuleToggleRow({ name, active }: { name: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg hover:bg-muted/10 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        {active ? (
          <CheckCircle2 size={13} className="text-green-500 shrink-0" />
        ) : (
          <XCircle size={13} className="text-gray-500/40 shrink-0" />
        )}
        <span
          className={cn(
            "text-xs font-medium truncate",
            active ? "text-foreground" : "text-muted-foreground/40 line-through"
          )}
        >
          {name}
        </span>
      </div>
      <ToggleSwitch active={active} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible Project Card — much more visible
// ---------------------------------------------------------------------------

export type ProjectData = {
  id: string;
  name: string;
  status: string;
  isAdmin: boolean;
  roles?: string[];
  modules?: string[];
  addedOn?: string;
};

function AccProjectCard({
  project,
  defaultExpanded = false,
}: {
  project: ProjectData;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const activeModuleSet = useMemo(
    () => new Set(project.modules ?? []),
    [project.modules]
  );
  const roles = project.roles ?? [];
  const moduleCount = activeModuleSet.size;

  const extraModules = useMemo(
    () =>
      (project.modules ?? []).filter(
        (m) => !ALL_MODULES.some((am) => am.key === m)
      ),
    [project.modules]
  );

  const isActive = project.status === "active";

  return (
    <div
      className={cn(
        "rounded-xl border-2 transition-all duration-200 overflow-hidden",
        expanded
          ? "border-primary/30 bg-card shadow-lg shadow-primary/5"
          : "border-border/30 bg-card/80 hover:border-primary/20 hover:shadow-md"
      )}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left group"
        title={`${expanded ? "Collapse" : "Expand"} ${project.name}`}
      >
        {/* Status indicator */}
        <div
          className={cn(
            "w-2.5 h-2.5 rounded-full shrink-0",
            isActive
              ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]"
              : "bg-gray-500/30"
          )}
        />

        {/* Name */}
        <span className="text-sm font-semibold text-foreground truncate flex-1 min-w-0">
          {project.name}
        </span>

        {/* Admin badge */}
        {project.isAdmin && (
          <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/20 shrink-0 font-bold">
            <Crown size={10} />
            Admin
          </span>
        )}

        {/* Status */}
        <span
          className={cn(
            "text-[11px] px-2 py-0.5 rounded-full font-semibold shrink-0 capitalize",
            isActive
              ? "bg-green-500/10 text-green-500 border border-green-500/20"
              : "bg-gray-500/10 text-gray-400 border border-gray-500/20"
          )}
        >
          {project.status}
        </span>

        {/* Module count bar */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-12 h-1.5 rounded-full bg-muted/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${(moduleCount / ALL_MODULES.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground font-mono tabular-nums">
            {moduleCount}/{ALL_MODULES.length}
          </span>
        </div>

        {/* Chevron */}
        {expanded ? (
          <ChevronDown size={16} className="text-primary shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-muted-foreground/40 shrink-0 group-hover:text-primary transition-colors" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/30 pt-4">
          {/* Roles */}
          {roles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide flex items-center gap-1.5">
                <Shield size={12} className="text-violet-500" />
                Roles ({roles.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {roles.map((role) => (
                  <span
                    key={role}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-violet-500/20 bg-violet-500/8 text-violet-400 font-semibold"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Modules — all listed with Apple toggles */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide flex items-center gap-1.5">
              <Package size={12} className="text-cyan-500" />
              Modules ({moduleCount} of {ALL_MODULES.length} active)
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0 p-2 rounded-lg bg-muted/5 border border-border/20">
              {ALL_MODULES.map((mod) => (
                <ModuleToggleRow
                  key={mod.key}
                  name={mod.name}
                  active={activeModuleSet.has(mod.key)}
                />
              ))}
              {extraModules.map((mod) => (
                <ModuleToggleRow key={mod} name={mod} active={true} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AccProfileFull — the full ACC section
// ---------------------------------------------------------------------------

export type AccProfileData = {
  found: true;
  status: string;
  name?: string;
  autodeskId?: string;
  syncedAt: string;
  role?: string;
  company?: string;
  addedOn?: string;
  lastSignIn?: string;
  photoUrl?: string | null;
  costCenter?: string | null;
  projects?: ProjectData[];
};

export function AccProfileFull({
  data,
  email,
  onRefresh,
}: {
  data: AccProfileData;
  email: string;
  onRefresh: () => void;
}) {
  const projects = data.projects ?? [];
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 150);
  }, []);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  // Aggregate stats
  const stats = useMemo(() => {
    const activeProjects = projects.filter((p) => p.status === "active").length;
    const adminProjects = projects.filter((p) => p.isAdmin).length;
    const uniqueRoles = new Set(projects.flatMap((p) => p.roles ?? []));
    const uniqueModules = new Set(projects.flatMap((p) => p.modules ?? []));
    return {
      total: projects.length,
      active: activeProjects,
      admin: adminProjects,
      roles: uniqueRoles.size,
      modules: uniqueModules.size,
    };
  }, [projects]);

  // Filter + Sort
  const filteredProjects = useMemo(() => {
    let result = [...projects];

    if (statusFilter === "active") result = result.filter((p) => p.status === "active");
    if (statusFilter === "inactive") result = result.filter((p) => p.status !== "active");

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.roles ?? []).some((r) => r.toLowerCase().includes(q)) ||
          (p.modules ?? []).some((m) => m.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "status":
          cmp = (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1);
          break;
        case "modules":
          cmp = (b.modules?.length ?? 0) - (a.modules?.length ?? 0);
          break;
        case "admin":
          cmp = (b.isAdmin ? 1 : 0) - (a.isAdmin ? 1 : 0);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [projects, statusFilter, debouncedSearch, sortField, sortAsc]);

  function cycleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  return (
    <div className="mt-6 pt-5 border-t-2 border-border/50 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wide flex items-center gap-2">
            <Building2 size={16} className="text-primary" />
            Autodesk ACC
          </h3>
          <Badge
            variant="secondary"
            className={cn(
              "text-xs px-2.5 py-0.5 font-bold border",
              data.status === "active"
                ? "text-green-400 border-green-500/30 bg-green-500/10"
                : "text-muted-foreground border-border/30"
            )}
          >
            {data.status}
          </Badge>
          {data.role && (
            <Badge
              variant="outline"
              className="text-xs px-2.5 py-0.5 font-bold border-primary/25 text-primary capitalize"
            >
              {data.role.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
        <button
          onClick={onRefresh}
          title="Refresh ACC data"
          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/30 hover:border-primary/30 hover:bg-primary/5 transition-all font-medium shrink-0"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* ── Company, Added On & Last Sign-In ── */}
      {(data.company || data.addedOn || data.lastSignIn) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 px-1">
          {data.company && (
            <div className="flex items-center gap-2 text-sm">
              <Building2 size={13} className="text-muted-foreground/50 shrink-0" />
              <span className="text-muted-foreground/60 font-medium">Company:</span>
              <span className="text-foreground font-semibold">{data.company}</span>
            </div>
          )}
          {data.addedOn && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground/60 font-medium">Added on:</span>
              <span className="text-foreground font-semibold">
                {new Date(data.addedOn).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </span>
            </div>
          )}
          {data.lastSignIn && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground/60 font-medium">Last sign-in:</span>
              <span className="text-foreground font-semibold">
                {new Date(data.lastSignIn).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </span>
              <span className="text-muted-foreground/40 text-xs">
                ({formatRelativeTime(data.lastSignIn)})
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Aggregate Stats ── */}
      {projects.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          <StatCard icon={FolderOpen} value={stats.total} label="Projects" color="text-blue-500" />
          <StatCard icon={Layers} value={stats.active} label="Active" color="text-green-500" />
          <StatCard icon={Crown} value={stats.admin} label="Admin" color="text-amber-500" />
          <StatCard icon={Shield} value={stats.roles} label="Roles" color="text-violet-500" />
          <StatCard icon={Package} value={stats.modules} label="Modules" color="text-cyan-500" />
        </div>
      )}

      {/* ── Search + Filter + Sort ── */}
      {projects.length > 3 && (
        <div className="space-y-3 p-4 rounded-xl bg-muted/5 border border-border/20">
          {/* Search bar */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50"
            />
            <input
              type="text"
              placeholder="Search projects, roles, or modules..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-9 text-sm rounded-lg border border-border/30 bg-card text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => handleSearch("")}
                title="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Sort + Filter controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-bold">Sort:</span>
            {(
              [
                ["name", "Name"],
                ["status", "Status"],
                ["modules", "Modules"],
                ["admin", "Admin"],
              ] as const
            ).map(([field, label]) => (
              <button
                key={field}
                onClick={() => cycleSort(field)}
                title={`Sort by ${label}`}
                className={cn(
                  "flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border font-semibold transition-all",
                  sortField === field
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border/20 text-muted-foreground/50 hover:text-foreground hover:border-border/40"
                )}
              >
                <ArrowUpDown size={10} />
                {label}
                {sortField === field && (
                  <span className="text-[10px]">{sortAsc ? "↑" : "↓"}</span>
                )}
              </button>
            ))}

            <div className="w-px h-5 bg-border/30 mx-1" />

            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-bold">Filter:</span>
            {(["all", "active", "inactive"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                title={`Show ${s} projects`}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-lg border font-semibold transition-all capitalize",
                  statusFilter === s
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border/20 text-muted-foreground/50 hover:text-foreground hover:border-border/40"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Projects list ── */}
      {filteredProjects.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">
              Projects
            </p>
            {filteredProjects.length !== projects.length && (
              <p className="text-xs text-primary font-semibold">
                {filteredProjects.length} of {projects.length} shown
              </p>
            )}
          </div>
          <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {filteredProjects.map((proj, i) => (
              <AccProjectCard
                key={proj.id}
                project={proj}
                defaultExpanded={filteredProjects.length <= 3 && i === 0}
              />
            ))}
          </div>
        </div>
      )}

      {filteredProjects.length === 0 && projects.length > 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No projects match your search
        </p>
      )}

      {/* ── Extended insight panels ── */}
      <div className="space-y-2 pt-2">
        <AccUserActivityPanel email={email} />
        <AccUserFolderAccessPanel email={email} />
        <AccUserRecentAdditionsPanel projects={projects} />
      </div>

      {/* Synced timestamp */}
      <p className="text-[10px] text-muted-foreground/40">
        Last synced {new Date(data.syncedAt).toLocaleString()}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible panel primitive
// ---------------------------------------------------------------------------

function CollapsiblePanel({
  title,
  icon,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border/30 bg-card/40 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/10 transition-colors"
      >
        <div className="flex items-center gap-2.5 text-sm font-bold text-foreground">
          {icon}
          {title}
          {subtitle && (
            <span className="text-xs font-medium text-muted-foreground/60">
              {subtitle}
            </span>
          )}
        </div>
        {open ? (
          <ChevronDown size={16} className="text-muted-foreground/60" />
        ) : (
          <ChevronRight size={16} className="text-muted-foreground/60" />
        )}
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity panel
// ---------------------------------------------------------------------------

function AccUserActivityPanel({ email }: { email: string }) {
  const { data, isLoading } = trpc.users.getAccUserActivity.useQuery(
    { email },
    { enabled: !!email, staleTime: 60_000 }
  );

  const subtitle = data
    ? `${data.last30dCount.toLocaleString()} events in last 30 days`
    : isLoading
    ? "loading…"
    : "no data";

  return (
    <CollapsiblePanel
      title="Activity"
      subtitle={subtitle}
      icon={<Activity size={15} className="text-cyan-500" />}
    >
      {isLoading && (
        <p className="text-xs text-muted-foreground/60 py-2">Loading activity…</p>
      )}
      {data && data.totalCount === 0 && (
        <p className="text-xs text-muted-foreground/60 py-2">
          No activity recorded for this user yet. Data populates as Data Connector ingests complete.
        </p>
      )}
      {data && data.totalCount > 0 && (
        <div className="space-y-4">
          {/* Top actions */}
          {data.topActions.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-bold mb-2">
                Top actions (last 30 days)
              </p>
              <div className="space-y-1.5">
                {data.topActions.map((a) => (
                  <div key={a.action} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-foreground font-medium">{a.action}</span>
                    <span className="text-muted-foreground/60 font-semibold">{a.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Recent events */}
          {data.recentEvents.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-bold mb-2">
                Recent events ({data.recentEvents.length})
              </p>
              <div className="max-h-[40vh] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                {data.recentEvents.map((e) => (
                  <div
                    key={e.id}
                    className="text-xs rounded-lg border border-border/20 bg-muted/5 px-3 py-2 space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">{e.action}</span>
                      <span className="text-[10px] text-muted-foreground/50">
                        {new Date(e.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {(e.projectName || e.service) && (
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                        {e.projectName && <span className="truncate">{e.projectName}</span>}
                        {e.service && (
                          <span className="px-1.5 py-px rounded bg-muted/20">
                            {e.service}
                            {e.tool ? ` · ${e.tool}` : ""}
                          </span>
                        )}
                      </div>
                    )}
                    {e.details && (
                      <p className="text-[11px] text-muted-foreground/70 truncate">{e.details}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </CollapsiblePanel>
  );
}

// ---------------------------------------------------------------------------
// Folder access panel
// ---------------------------------------------------------------------------

function AccUserFolderAccessPanel({ email }: { email: string }) {
  const { data, isLoading } = trpc.users.getAccUserFolderAccess.useQuery(
    { email },
    { enabled: !!email, staleTime: 5 * 60_000 }
  );

  const subtitle = data
    ? `${data.folders.length.toLocaleString()} folder${data.folders.length === 1 ? "" : "s"} (${data.coverage.crawledProjects}/${data.coverage.totalProjects} projects crawled)`
    : isLoading
    ? "loading…"
    : "no data";

  // Group folders by project for cleaner display
  type FolderRow = NonNullable<typeof data>["folders"][number];
  const grouped = useMemo(() => {
    const list: FolderRow[] = data?.folders ?? [];
    if (list.length === 0) return [] as Array<{ projectId: string; projectName: string; folders: FolderRow[] }>;
    const byProject = new Map<string, { projectId: string; projectName: string; folders: FolderRow[] }>();
    for (const f of list) {
      if (!byProject.has(f.projectId)) {
        byProject.set(f.projectId, { projectId: f.projectId, projectName: f.projectName, folders: [] });
      }
      byProject.get(f.projectId)!.folders.push(f);
    }
    return [...byProject.values()].sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [data]);

  return (
    <CollapsiblePanel
      title="Folder access"
      subtitle={subtitle}
      icon={<FolderOpen size={15} className="text-amber-500" />}
    >
      {isLoading && (
        <p className="text-xs text-muted-foreground/60 py-2">Loading folder access…</p>
      )}
      {data && data.folders.length === 0 && (
        <p className="text-xs text-muted-foreground/60 py-2">
          {data.coverage.crawledProjects === 0
            ? "Folder crawl hasn't reached this user's projects yet. Permissions populate as the crawl progresses."
            : "This user has no role-based folder grants in the crawled projects."}
        </p>
      )}
      {data && data.folders.length > 0 && (
        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
          {grouped.map((g) => (
            <div key={g.projectId} className="rounded-lg border border-border/20 bg-muted/5 p-2.5 space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground/70">
                {g.projectName}{" "}
                <span className="font-normal lowercase text-muted-foreground/40">
                  · {g.folders.length} folder{g.folders.length === 1 ? "" : "s"}
                </span>
              </p>
              <div className="space-y-1">
                {g.folders.map((f) => (
                  <div
                    key={f.folderId + "::" + f.roleId}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FolderOpen size={11} className="text-muted-foreground/40 shrink-0" />
                      <span className="truncate text-foreground" title={f.folderPath ?? f.folderName}>
                        {f.folderPath || f.folderName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-px font-semibold border-violet-500/30 text-violet-400"
                      >
                        {f.roleName}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-px font-semibold border-amber-500/30 text-amber-400"
                      >
                        {f.permType}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsiblePanel>
  );
}

// ---------------------------------------------------------------------------
// Recent additions panel — uses per-project addedOn from the profile data
// ---------------------------------------------------------------------------

function AccUserRecentAdditionsPanel({ projects }: { projects: ProjectData[] }) {
  const recent = useMemo(() => {
    return projects
      .filter((p) => !!p.addedOn)
      .map((p) => ({ ...p, addedTs: new Date(p.addedOn as string).getTime() }))
      .filter((p) => !Number.isNaN(p.addedTs))
      .sort((a, b) => b.addedTs - a.addedTs)
      .slice(0, 20);
  }, [projects]);

  const subtitle = recent.length
    ? `${recent.length} most recent`
    : projects.length === 0
    ? "no projects"
    : "no dates available";

  return (
    <CollapsiblePanel
      title="Recent project additions"
      subtitle={subtitle}
      icon={<Layers size={15} className="text-green-500" />}
    >
      {recent.length === 0 && (
        <p className="text-xs text-muted-foreground/60 py-2">
          Per-project membership dates aren&apos;t available yet. Refresh to fetch them.
        </p>
      )}
      {recent.length > 0 && (
        <div className="space-y-1.5">
          {recent.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 text-xs rounded-lg border border-border/20 bg-muted/5 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Building2 size={11} className="text-muted-foreground/40 shrink-0" />
                <span className="truncate text-foreground font-medium" title={p.name}>
                  {p.name}
                </span>
                {p.isAdmin && (
                  <Badge variant="outline" className="text-[9px] px-1 py-px font-bold border-amber-500/30 text-amber-400 shrink-0">
                    ADMIN
                  </Badge>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                {new Date(p.addedOn as string).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </CollapsiblePanel>
  );
}
