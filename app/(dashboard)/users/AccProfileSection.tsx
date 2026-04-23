"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  AlertCircle,
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Master list of all ACC products/modules */
const ALL_MODULES = [
  { key: "documentManagement", name: "Document Management" },
  { key: "designCollaboration", name: "Design Collaboration" },
  { key: "modelCoordination", name: "Model Coordination" },
  { key: "build", name: "Build" },
  { key: "cost", name: "Cost Management" },
  { key: "fieldManagement", name: "Field Management" },
  { key: "insight", name: "Insight" },
  { key: "quantification", name: "Quantification" },
  { key: "docs", name: "Docs" },
  { key: "assets", name: "Assets" },
  { key: "takeoff", name: "Takeoff" },
  { key: "projectManagement", name: "Project Management" },
] as const;

type SortField = "name" | "status" | "modules" | "admin";

// ---------------------------------------------------------------------------
// Apple-style Toggle Indicator (read-only)
// ---------------------------------------------------------------------------

function ToggleIndicator({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "relative inline-flex h-[14px] w-[26px] shrink-0 rounded-full transition-all duration-300",
        active
          ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.3)]"
          : "bg-[hsl(var(--muted-foreground)/0.12)]"
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-[10px] w-[10px] rounded-full shadow-sm transition-all duration-300",
          active
            ? "translate-x-[14px] bg-white"
            : "translate-x-[2px] bg-[hsl(var(--muted-foreground)/0.4)]"
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

function AccLoadingProgress() {
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
    <div className="pt-4 border-t border-border/30 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Autodesk ACC
        </h3>
        <span className="text-[10px] font-mono text-primary/60 tabular-nums">
          {Math.round(progress)}%
        </span>
      </div>
      <div className="relative h-1 rounded-full bg-muted/20 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/70 to-primary/40 transition-none"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute inset-y-0 w-16 rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
          style={{ left: `calc(${progress}% - 2rem)` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground/40 animate-pulse">
        {activeStep.label}…
      </p>
      <div className="flex items-center gap-1.5">
        {LOAD_STEPS.map((s) => (
          <div
            key={s.label}
            className={cn(
              "h-0.5 rounded-full transition-all duration-500",
              progress >= s.until
                ? "bg-primary/50 w-4"
                : progress >= s.until - 20
                  ? "bg-primary/20 w-2"
                  : "bg-muted/20 w-1"
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat pill
// ---------------------------------------------------------------------------

function StatPill({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: React.ElementType;
  value: number | string;
  label: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/8 border border-border/15">
      <Icon size={11} className={accent ?? "text-muted-foreground/40"} />
      <span className="text-[11px] font-bold tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module toggle row
// ---------------------------------------------------------------------------

function ModuleToggleRow({ name, active }: { name: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-[3px]">
      <span
        className={cn(
          "text-[10px] truncate transition-colors",
          active ? "text-foreground/80" : "text-muted-foreground/30 line-through decoration-muted-foreground/10"
        )}
      >
        {name}
      </span>
      <ToggleIndicator active={active} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible Project Card
// ---------------------------------------------------------------------------

type ProjectData = {
  id: string;
  name: string;
  status: string;
  isAdmin: boolean;
  roles?: string[];
  modules?: string[];
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

  // Include any modules from API not in our master list
  const extraModules = useMemo(
    () =>
      (project.modules ?? []).filter(
        (m) => !ALL_MODULES.some((am) => am.key === m)
      ),
    [project.modules]
  );

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-200 overflow-hidden",
        expanded
          ? "border-border/40 bg-card/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
          : "border-border/15 bg-muted/5 hover:border-border/25 hover:bg-muted/8"
      )}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left group"
      >
        {/* Status dot */}
        <div
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            project.status === "active"
              ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]"
              : "bg-muted-foreground/20"
          )}
        />

        {/* Name */}
        <span className="text-[11px] font-medium text-foreground truncate flex-1 min-w-0">
          {project.name}
        </span>

        {/* Admin badge */}
        {project.isAdmin && (
          <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0 rounded-full bg-amber-500/10 text-amber-500/90 border border-amber-500/15 shrink-0 font-medium">
            <Crown size={8} />
            Admin
          </span>
        )}

        {/* Module count */}
        <span className="text-[9px] text-muted-foreground/35 shrink-0 tabular-nums">
          {moduleCount}/{ALL_MODULES.length}
        </span>

        {/* Chevron */}
        {expanded ? (
          <ChevronDown size={12} className="text-muted-foreground/30 shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-muted-foreground/20 shrink-0 group-hover:text-muted-foreground/40 transition-colors" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-border/10 pt-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Roles */}
          {roles.length > 0 && (
            <div className="space-y-1">
              <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider font-medium">
                Roles
              </p>
              <div className="flex flex-wrap gap-1">
                {roles.map((role) => (
                  <span
                    key={role}
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border border-primary/10 bg-primary/5 text-primary/70 font-medium"
                  >
                    <Shield size={8} className="text-primary/40" />
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Modules — all listed with toggles */}
          <div className="space-y-1">
            <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider font-medium">
              Modules
              <span className="ml-1.5 text-muted-foreground/25">
                ({moduleCount} active)
              </span>
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0">
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

          {/* Status line */}
          <div className="flex items-center gap-1.5 pt-1">
            <div
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-md capitalize",
                project.status === "active"
                  ? "bg-green-500/8 text-green-500/70 border border-green-500/10"
                  : "bg-muted/10 text-muted-foreground/40 border border-border/10"
              )}
            >
              {project.status}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AccProfileFull
// ---------------------------------------------------------------------------

type AccProfileData = {
  found: true;
  status: string;
  name?: string;
  autodeskId?: string;
  syncedAt: string;
  role?: string;
  projects?: ProjectData[];
};

function AccProfileFull({
  data,
  onRefresh,
}: {
  data: AccProfileData;
  onRefresh: () => void;
}) {
  const projects = data.projects ?? [];
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [showFilters, setShowFilters] = useState(false);
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

    // Status filter
    if (statusFilter === "active") result = result.filter((p) => p.status === "active");
    if (statusFilter === "inactive") result = result.filter((p) => p.status !== "active");

    // Search
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.roles ?? []).some((r) => r.toLowerCase().includes(q)) ||
          (p.modules ?? []).some((m) => m.toLowerCase().includes(q))
      );
    }

    // Sort
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
    <div className="pt-4 border-t border-border/30 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Autodesk ACC
          </h3>
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] px-1.5 py-0 border",
              data.status === "active"
                ? "text-green-400 border-green-500/15 bg-green-500/5"
                : "text-muted-foreground border-border/20"
            )}
          >
            {data.status}
          </Badge>
          {data.role && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-primary/15 text-primary/60 capitalize"
            >
              {data.role.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
        <button
          onClick={onRefresh}
          className="text-[10px] text-muted-foreground/40 hover:text-primary flex items-center gap-1 transition-colors"
        >
          <RefreshCw size={10} />
          Refresh
        </button>
      </div>

      {/* Aggregate Stats */}
      {projects.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <StatPill icon={FolderOpen} value={stats.total} label="Projects" accent="text-primary/50" />
          <StatPill icon={Layers} value={stats.active} label="Active" accent="text-green-500/60" />
          <StatPill icon={Crown} value={stats.admin} label="Admin" accent="text-amber-500/60" />
          <StatPill icon={Shield} value={stats.roles} label="Roles" accent="text-violet-500/60" />
          <StatPill icon={Package} value={stats.modules} label="Modules" accent="text-cyan-500/60" />
        </div>
      )}

      {/* Search + Filter + Sort */}
      {projects.length > 3 && (
        <div className="space-y-2">
          {/* Search bar */}
          <div className="relative">
            <Search
              size={11}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/30"
            />
            <input
              type="text"
              placeholder="Search projects, roles, modules..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full h-7 pl-7 pr-8 text-[10px] rounded-lg border border-border/15 bg-muted/5 text-foreground placeholder:text-muted-foreground/25 focus:outline-none focus:border-primary/30 focus:bg-card/50 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => handleSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-foreground transition-colors"
              >
                <X size={10} />
              </button>
            )}
          </div>

          {/* Sort + Filter controls */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Sort buttons */}
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
                className={cn(
                  "flex items-center gap-0.5 text-[9px] px-2 py-1 rounded-md border transition-all",
                  sortField === field
                    ? "border-primary/20 bg-primary/5 text-primary/80"
                    : "border-border/10 bg-transparent text-muted-foreground/30 hover:text-muted-foreground/60 hover:border-border/20"
                )}
              >
                <ArrowUpDown size={8} />
                {label}
                {sortField === field && (
                  <span className="text-[8px] opacity-50">
                    {sortAsc ? "↑" : "↓"}
                  </span>
                )}
              </button>
            ))}

            <div className="w-px h-3 bg-border/15 mx-0.5" />

            {/* Status filter */}
            {(["all", "active", "inactive"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "text-[9px] px-2 py-1 rounded-md border transition-all capitalize",
                  statusFilter === s
                    ? "border-primary/20 bg-primary/5 text-primary/80"
                    : "border-border/10 bg-transparent text-muted-foreground/30 hover:text-muted-foreground/60"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Projects list */}
      {filteredProjects.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] text-muted-foreground/35 uppercase tracking-wider font-medium">
            Projects
            {filteredProjects.length !== projects.length && (
              <span className="ml-1 text-primary/50">
                ({filteredProjects.length} of {projects.length})
              </span>
            )}
          </p>
          <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
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
        <p className="text-[10px] text-muted-foreground/30 text-center py-4">
          No projects match your search
        </p>
      )}

      {/* Synced timestamp */}
      <p className="text-[9px] text-muted-foreground/20">
        Last synced {new Date(data.syncedAt).toLocaleString()}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AccProfileSection — entry point
// ---------------------------------------------------------------------------

export function AccProfileSection({ email }: { email: string }) {
  const [forceRefresh, setForceRefresh] = useState(false);
  const utils = trpc.useUtils();

  const { data, isLoading, error, isFetching } =
    trpc.users.getAccProfile.useQuery(
      { email, forceRefresh },
      { staleTime: 5 * 60 * 1000, retry: false }
    );

  function handleRefresh() {
    setForceRefresh(true);
    utils.users.getAccProfile
      .fetch({ email, forceRefresh: true })
      .then((fresh) => {
        utils.users.getAccProfile.setData(
          { email, forceRefresh: false },
          fresh
        );
        setForceRefresh(false);
      })
      .catch(() => setForceRefresh(false));
  }

  // 1. Loading
  if (isLoading || isFetching) {
    return <AccLoadingProgress />;
  }

  // 2. UNAUTHORIZED
  if (error?.data?.code === "UNAUTHORIZED") {
    return (
      <div className="pt-4 border-t border-border/30">
        <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-500/15 bg-amber-500/5 text-amber-400 text-xs">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Autodesk not connected</p>
            <p className="text-[10px] text-amber-400/60 mt-0.5">
              Link your Autodesk account in Settings to view ACC data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 3. FORBIDDEN
  if (error?.data?.code === "FORBIDDEN") {
    return (
      <div className="pt-4 border-t border-border/30">
        <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-500/15 bg-amber-500/5 text-amber-400 text-xs">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Account Admin privileges required</p>
            <p className="text-[10px] text-amber-400/60 mt-0.5">
              Ensure your Autodesk account is an Account Admin in the hub.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 4. Other error
  if (error) {
    return (
      <div className="pt-4 border-t border-border/30">
        <p className="text-xs text-muted-foreground/50">
          Failed to load ACC data.
        </p>
      </div>
    );
  }

  // 5. Not found
  if (data && !data.found) {
    return (
      <div className="pt-4 border-t border-border/30">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Autodesk ACC
          </h3>
          <button
            onClick={handleRefresh}
            className="text-[10px] text-muted-foreground/40 hover:text-primary flex items-center gap-1 transition-colors"
          >
            <RefreshCw size={10} />
            Refresh
          </button>
        </div>
        <p className="text-xs text-muted-foreground/50">
          Not found in ACC hub
        </p>
        <p className="text-[9px] text-muted-foreground/25 mt-0.5">
          Last checked: {new Date(data.syncedAt).toLocaleString()}
        </p>
      </div>
    );
  }

  // 6. Full profile
  if (data?.found === true) {
    return (
      <AccProfileFull
        data={data as AccProfileData}
        onRefresh={handleRefresh}
      />
    );
  }

  return null;
}
