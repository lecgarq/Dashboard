"use client";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Building2,
  Briefcase,
  AlertCircle,
  LayoutGrid,
  X,
  DollarSign,
  Filter,
  UserCircle,
  CheckCircle2,
  ShieldCheck,
  Globe,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/core/utils";
import { type AggregatedStatus } from "@/lib/acc/accStatusReduction";
import { STATUS_PILL_LABEL } from "./DirectoryPills";
import { useUsersDirectoryStore } from "./useUsersDirectoryStore";
import { moduleLabel } from "@/lib/acc/modules";

// ---------------------------------------------------------------------------
// ActiveFilterPill — moved from UsersDirectoryClient (USR-01 decomposition, Wave 6).
// ---------------------------------------------------------------------------
function ActiveFilterPill({
  label,
  value,
  onClear,
}: {
  label: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full pl-2.5 pr-1.5 py-0.5">
      <span className="font-medium">{label}:</span>
      <span className="truncate max-w-[120px]">{value}</span>
      <button
        onClick={onClear}
        aria-label={`Clear ${label} filter`}
        className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
      >
        <X size={10} aria-hidden />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// DirectoryFilterBar props
// ---------------------------------------------------------------------------
export interface DirectoryFilterBarProps {
  // Search (shell owns debounce logic; filter bar owns the controlled input)
  search: string;
  onSearchChange: (value: string) => void;

  // Option lists (derived from data hook in shell)
  departments: string[];
  jobTitles: string[];
  costCenters: string[];
  accProjects: string[];
  accRoles: string[];
  accModules: string[];

  // No-projects chip visibility
  noProjectsCount: number;
}

// ---------------------------------------------------------------------------
// DirectoryFilterBar — search input + filter dropdowns + active-filter pills.
// Reads all filter state and setters directly from useUsersDirectoryStore to
// keep the prop surface minimal (USR-01 CONTEXT: prefer store reads).
// ---------------------------------------------------------------------------
export function DirectoryFilterBar({
  search,
  onSearchChange,
  departments,
  jobTitles,
  costCenters,
  accProjects,
  accRoles,
  accModules,
  noProjectsCount,
}: DirectoryFilterBarProps) {
  // Store: filter values
  const filterDept = useUsersDirectoryStore((s) => s.filterDept);
  const filterJobTitle = useUsersDirectoryStore((s) => s.filterJobTitle);
  const filterCostCenter = useUsersDirectoryStore((s) => s.filterCostCenter);
  const filterNoProjects = useUsersDirectoryStore((s) => s.filterNoProjects);
  const filterAccProject = useUsersDirectoryStore((s) => s.filterAccProject);
  const filterAccRole = useUsersDirectoryStore((s) => s.filterAccRole);
  const filterAccModule = useUsersDirectoryStore((s) => s.filterAccModule);
  const filterAccModuleTier = useUsersDirectoryStore((s) => s.filterAccModuleTier);
  const statusFilter = useUsersDirectoryStore((s) => s.statusFilter);
  const projectAdminFilter = useUsersDirectoryStore((s) => s.projectAdminFilter);
  const affiliationFilter = useUsersDirectoryStore((s) => s.affiliationFilter);

  // Store: setters
  const setFilterDept = useUsersDirectoryStore((s) => s.setFilterDept);
  const setFilterJobTitle = useUsersDirectoryStore((s) => s.setFilterJobTitle);
  const setFilterCostCenter = useUsersDirectoryStore((s) => s.setFilterCostCenter);
  const setFilterNoProjects = useUsersDirectoryStore((s) => s.setFilterNoProjects);
  const setFilterAccProject = useUsersDirectoryStore((s) => s.setFilterAccProject);
  const setFilterAccRole = useUsersDirectoryStore((s) => s.setFilterAccRole);
  const setFilterAccModule = useUsersDirectoryStore((s) => s.setFilterAccModule);
  const setFilterAccModuleTier = useUsersDirectoryStore((s) => s.setFilterAccModuleTier);
  const setStatusFilter = useUsersDirectoryStore((s) => s.setStatusFilter);
  const setProjectAdminFilter = useUsersDirectoryStore((s) => s.setProjectAdminFilter);
  const setAffiliationFilter = useUsersDirectoryStore((s) => s.setAffiliationFilter);
  const clearAllFilters = useUsersDirectoryStore((s) => s.clearAllFilters);

  const hasActiveFilters = !!(
    filterDept || filterJobTitle || filterCostCenter || filterNoProjects ||
    filterAccProject || filterAccRole || filterAccModule ||
    statusFilter.length > 0 || projectAdminFilter || affiliationFilter
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Search input */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Search anything... or use dept:, job:, cc:, phone:, email:"
          className="pl-8 pr-10 bg-card border-border"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter size={12} className="text-muted-foreground/50" />

        {departments.length > 0 && (
          <Select
            value={filterDept ?? "__all__"}
            onValueChange={(v) => setFilterDept(v === "__all__" ? null : v)}
          >
            <SelectTrigger className="h-7 w-auto min-w-[130px] text-[11px] bg-card border-border gap-1">
              <Building2 size={11} className="shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {jobTitles.length > 0 && (
          <Select
            value={filterJobTitle ?? "__all__"}
            onValueChange={(v) => setFilterJobTitle(v === "__all__" ? null : v)}
          >
            <SelectTrigger className="h-7 w-auto min-w-[130px] text-[11px] bg-card border-border gap-1">
              <Briefcase size={11} className="shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Job Title" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Job Titles</SelectItem>
              {jobTitles.map((j) => (
                <SelectItem key={j} value={j}>
                  {j}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {costCenters.length > 0 && (
          <Select
            value={filterCostCenter ?? "__all__"}
            onValueChange={(v) => setFilterCostCenter(v === "__all__" ? null : v)}
          >
            <SelectTrigger className="h-7 w-auto min-w-[130px] text-[11px] bg-card border-border gap-1">
              <DollarSign size={11} className="shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Cost Center" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Cost Centers</SelectItem>
              {costCenters.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {accProjects.length > 0 && (
          <Select
            value={filterAccProject ?? "__all__"}
            onValueChange={(v) => setFilterAccProject(v === "__all__" ? null : v)}
          >
            <SelectTrigger className="h-7 w-auto min-w-[130px] text-[11px] bg-card border-border gap-1">
              <Building2 size={11} className="shrink-0 text-muted-foreground" />
              <SelectValue placeholder="ACC Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All ACC Projects</SelectItem>
              {accProjects.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {accRoles.length > 0 && (
          <Select
            value={filterAccRole ?? "__all__"}
            onValueChange={(v) => setFilterAccRole(v === "__all__" ? null : v)}
          >
            <SelectTrigger className="h-7 w-auto min-w-[130px] text-[11px] bg-card border-border gap-1">
              <UserCircle size={11} className="shrink-0 text-muted-foreground" />
              <SelectValue placeholder="ACC Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All ACC Roles</SelectItem>
              {accRoles.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {accModules.length > 0 && (
          <Select
            value={filterAccModule ?? "__all__"}
            onValueChange={(v) => {
              setFilterAccModule(v === "__all__" ? null : v);
              setFilterAccModuleTier(null);
            }}
          >
            <SelectTrigger className="h-7 w-auto min-w-[130px] text-[11px] bg-card border-border gap-1">
              <LayoutGrid size={11} className="shrink-0 text-muted-foreground" />
              <SelectValue placeholder="ACC Module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All ACC Modules</SelectItem>
              {accModules.map((m) => (
                <SelectItem key={m} value={m}>
                  {moduleLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Affiliation facet — email-domain rule (internalDomains). Combine with
            "Project Admin only" to surface external users with admin permissions. */}
        <Select
          value={affiliationFilter ?? "__all__"}
          onValueChange={(v) => setAffiliationFilter(v === "__all__" ? null : (v as "internal" | "external"))}
        >
          <SelectTrigger className="h-7 w-auto min-w-[110px] text-[11px] bg-card border-border gap-1">
            <Globe size={11} className="shrink-0 text-muted-foreground" />
            <SelectValue placeholder="Affiliation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Users</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
            <SelectItem value="external">External</SelectItem>
          </SelectContent>
        </Select>

        {/* Phase 09 LIST-01 — Status multi-select facet */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-[11px] gap-1 bg-card border-border"
            >
              <CheckCircle2 size={11} className="shrink-0 text-muted-foreground" />
              Status
              {statusFilter.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {statusFilter.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="text-[11px]">User status</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(["active", "pending", "deleted"] as AggregatedStatus[]).map((s) => (
              <DropdownMenuCheckboxItem
                key={s}
                checked={statusFilter.includes(s)}
                onCheckedChange={(checked) => {
                  setStatusFilter((prev) =>
                    checked ? [...prev, s] : prev.filter((x) => x !== s),
                  );
                }}
                onSelect={(e) => e.preventDefault()}
              >
                {STATUS_PILL_LABEL[s]}
              </DropdownMenuCheckboxItem>
            ))}
            {statusFilter.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <button
                  onClick={() => setStatusFilter([])}
                  className="w-full text-left px-2 py-1.5 text-[11px] text-primary hover:bg-accent rounded-sm"
                >
                  Clear status filter
                </button>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Phase 09 LIST-02 — Project Admin binary facet */}
        <button
          onClick={() => setProjectAdminFilter((prev) => !prev)}
          className={cn(
            "inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all",
            projectAdminFilter
              ? "border-primary/60 bg-primary/15 text-primary"
              : "border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-primary",
          )}
        >
          <ShieldCheck size={11} className="shrink-0" />
          Project Admin only
        </button>

        {/* ACC "No Projects" filter chip — only visible when there is cache data */}
        {noProjectsCount > 0 && (
          <button
            onClick={() => setFilterNoProjects(!filterNoProjects)}
            className={cn(
              "inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all",
              filterNoProjects
                ? "border-amber-500/60 bg-amber-500/15 text-amber-400"
                : "border-amber-500/25 bg-transparent text-amber-500/70 hover:border-amber-500/50 hover:text-amber-400"
            )}
          >
            <AlertCircle size={11} className="shrink-0" />
            No ACC Projects ({noProjectsCount})
          </button>
        )}

        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-[11px] text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
          >
            <X size={10} />
            Clear all
          </button>
        )}
      </div>

      {/* Active filter pills */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5">
          {filterDept && (
            <ActiveFilterPill
              label="Dept"
              value={filterDept}
              onClear={() => setFilterDept(null)}
            />
          )}
          {filterJobTitle && (
            <ActiveFilterPill
              label="Job"
              value={filterJobTitle}
              onClear={() => setFilterJobTitle(null)}
            />
          )}
          {filterCostCenter && (
            <ActiveFilterPill
              label="CC"
              value={filterCostCenter}
              onClear={() => setFilterCostCenter(null)}
            />
          )}
          {filterAccProject && (
            <ActiveFilterPill
              label="Project"
              value={filterAccProject}
              onClear={() => setFilterAccProject(null)}
            />
          )}
          {filterAccRole && (
            <ActiveFilterPill
              label="Role"
              value={filterAccRole}
              onClear={() => setFilterAccRole(null)}
            />
          )}
          {filterAccModule && (
            <ActiveFilterPill
              label="Module"
              value={
                filterAccModuleTier
                  ? `${moduleLabel(filterAccModule)} (Tier: ${
                      filterAccModuleTier.charAt(0).toUpperCase() + filterAccModuleTier.slice(1)
                    })`
                  : moduleLabel(filterAccModule)
              }
              onClear={() => {
                setFilterAccModule(null);
                setFilterAccModuleTier(null);
              }}
            />
          )}
          {statusFilter.map((s) => (
            <ActiveFilterPill
              key={s}
              label="Status"
              value={STATUS_PILL_LABEL[s]}
              onClear={() =>
                setStatusFilter((prev) => prev.filter((x) => x !== s))
              }
            />
          ))}
          {projectAdminFilter && (
            <ActiveFilterPill
              label="Admin"
              value="Project Admin only"
              onClear={() => setProjectAdminFilter(false)}
            />
          )}
          {affiliationFilter && (
            <ActiveFilterPill
              label="Affiliation"
              value={affiliationFilter === "external" ? "External" : "Internal"}
              onClear={() => setAffiliationFilter(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
