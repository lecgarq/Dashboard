"use client";

import { useMemo, useState, useTransition, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/core/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Search,
  Users,
  Mail,
  Building2,
  Briefcase,
  Phone,
  AlertCircle,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronRight,
  X,
  DollarSign,
  Filter,
  UserCircle,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/core/utils";
import { AccProfileSection } from "./AccProfileSection";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgPerson {
  resourceName: string;
  displayName: string;
  email: string;
  photoUrl: string | null;
  department: string | null;
  jobTitle: string | null;
  phoneNumber: string | null;
  costCenter: string | null;
}

interface LocalDirectoryUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  department: string | null;
  jobTitle: string | null;
}

type GroupByField = "none" | "department" | "jobTitle" | "costCenter";
type ViewMode = "grid" | "list";

interface AccSummaryItem {
  email: string;
  found: boolean;
  projectCount: number;
  activeCount: number;
  adminCount: number;
  hasNoProjects: boolean;
  syncedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b)
  );
}

/** Parse field-scoped tokens like `dept:engineering` from the query */
function parseSearchTokens(raw: string) {
  const fieldAliases: Record<string, keyof OrgPerson> = {
    dept: "department",
    department: "department",
    depto: "department",
    departamento: "department",
    job: "jobTitle",
    title: "jobTitle",
    puesto: "jobTitle",
    cargo: "jobTitle",
    role: "jobTitle",
    cc: "costCenter",
    cost: "costCenter",
    centro: "costCenter",
    presupuesto: "costCenter",
    phone: "phoneNumber",
    tel: "phoneNumber",
    telefono: "phoneNumber",
    email: "email",
    correo: "email",
    name: "displayName",
    nombre: "displayName",
  };

  const fieldFilters: Partial<Record<keyof OrgPerson, string>> = {};
  const freeTerms: string[] = [];

  // Split by spaces but keep quoted strings together
  const parts = raw.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];

  for (const part of parts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx > 0) {
      const prefix = part.slice(0, colonIdx).toLowerCase();
      const value = part.slice(colonIdx + 1).replace(/^"|"$/g, "");
      const field = fieldAliases[prefix];
      if (field && value) {
        fieldFilters[field] = normalize(value);
        continue;
      }
    }
    freeTerms.push(normalize(part));
  }

  return { fieldFilters, freeText: freeTerms.join(" ") };
}

function matchesPerson(
  person: OrgPerson,
  freeText: string,
  fieldFilters: Partial<Record<keyof OrgPerson, string>>
): boolean {
  // Field-scoped filters must all match
  for (const [field, query] of Object.entries(fieldFilters)) {
    const value = person[field as keyof OrgPerson];
    if (!value || !normalize(String(value)).includes(query!)) return false;
  }

  // Free text matches any field
  if (freeText) {
    const haystack = normalize(
      [
        person.displayName,
        person.email,
        person.department,
        person.jobTitle,
        person.phoneNumber,
        person.costCenter,
      ]
        .filter(Boolean)
        .join(" ")
    );
    return haystack.includes(freeText);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PersonAvatar({
  person,
  size = "lg",
}: {
  person: OrgPerson;
  size?: "sm" | "md" | "lg";
}) {
  const dim = {
    sm: "w-9 h-9 text-xs",
    md: "w-12 h-12 text-base",
    lg: "w-20 h-20 text-2xl",
  }[size];

  const initials = person.displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  if (person.photoUrl) {
    return (
      <img
        src={person.photoUrl}
        alt={person.displayName}
        referrerPolicy="no-referrer"
        className={cn("rounded-full object-cover ring-2 ring-primary/20 shrink-0", dim)}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full bg-gradient-to-br from-primary to-chart-4 flex items-center justify-center ring-2 ring-primary/20 font-bold text-white shrink-0",
        dim
      )}
    >
      {initials || "?"}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); copy(); }}
      className="opacity-0 group-hover/row:opacity-100 hover:text-primary transition-all"
      title="Copy"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </button>
  );
}

function InfoRow({
  icon: Icon,
  children,
  href,
  copyText,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  href?: string;
  copyText?: string;
}) {
  const content = href ? (
    <a
      href={href}
      className="hover:text-primary truncate transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  ) : (
    <span className="truncate">{children}</span>
  );

  return (
    <div className="group/row flex items-center gap-2 text-muted-foreground text-sm">
      <Icon size={13} className="shrink-0 text-primary/50" />
      {content}
      {copyText && <CopyButton text={copyText} />}
    </div>
  );
}

function PersonDetailModal({
  person,
  open,
  onOpenChange,
}: {
  person: OrgPerson | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!person) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex flex-col max-w-3xl w-[90vw] bg-card border-border/50 text-foreground p-0 overflow-hidden shadow-2xl shadow-black/20"
        style={{ resize: "both", minWidth: 380, minHeight: 400, maxHeight: "90vh" }}
      >
        <VisuallyHidden>
          <DialogTitle>{person.displayName}</DialogTitle>
        </VisuallyHidden>

        {/* Header banner */}
        <div className="h-20 bg-gradient-to-br from-primary/25 via-chart-4/15 to-primary/8 relative shrink-0">
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
            <PersonAvatar person={person} size="lg" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="pt-12 pb-6 px-6">
            <div className="text-center mb-5">
              <h2 className="text-lg font-bold">{person.displayName}</h2>
              {person.jobTitle && (
                <p className="text-sm text-muted-foreground mt-0.5">{person.jobTitle}</p>
              )}
            </div>

            {/* Tags */}
            <div className="flex flex-wrap justify-center gap-1.5 mb-5">
              {person.department && (
                <Badge variant="secondary" className="text-[11px] gap-1">
                  <Building2 size={10} />
                  {person.department}
                </Badge>
              )}
              {person.costCenter && (
                <Badge variant="secondary" className="text-[11px] gap-1">
                  <DollarSign size={10} />
                  {person.costCenter}
                </Badge>
              )}
            </div>

            <div className="space-y-3 pt-4 border-t border-border/30">
              <InfoRow icon={Mail} href={`mailto:${person.email}`} copyText={person.email}>
                {person.email}
              </InfoRow>
              {person.department && (
                <InfoRow icon={Building2}>{person.department}</InfoRow>
              )}
              {person.jobTitle && (
                <InfoRow icon={Briefcase}>{person.jobTitle}</InfoRow>
              )}
              {person.costCenter && (
                <InfoRow icon={DollarSign}>{person.costCenter}</InfoRow>
              )}
              {person.phoneNumber && (
                <InfoRow icon={Phone} href={`tel:${person.phoneNumber}`} copyText={person.phoneNumber}>
                  {person.phoneNumber}
                </InfoRow>
              )}
            </div>

            {/* Autodesk ACC profile section */}
            <AccProfileSection email={person.email} />

            {/* Quick actions */}
            <div className="flex gap-2 mt-5 pt-4 border-t border-border/30">
              <a
                href={`mailto:${person.email}`}
                className="flex-1 flex items-center justify-center gap-2 text-xs font-medium py-2.5 rounded-xl bg-primary/8 text-primary hover:bg-primary/15 border border-primary/10 transition-all"
              >
                <Mail size={13} />
                Email
              </a>
              {person.phoneNumber && (
                <a
                  href={`tel:${person.phoneNumber}`}
                  className="flex-1 flex items-center justify-center gap-2 text-xs font-medium py-2.5 rounded-xl bg-primary/8 text-primary hover:bg-primary/15 border border-primary/10 transition-all"
                >
                  <Phone size={13} />
                  Call
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Resize handle hint */}
        <div className="absolute bottom-1 right-1 pointer-events-none opacity-20">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M11 1v10H1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M11 5v6H5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M11 9v2H9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Small ACC project count badge shown on person cards/rows */
function AccBadge({ summary }: { summary: AccSummaryItem | undefined }) {
  if (!summary) return null;
  if (summary.hasNoProjects) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-1.5 py-0.5 shrink-0">
        <AlertCircle size={9} className="shrink-0" />
        No projects
      </span>
    );
  }
  if (summary.projectCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
        {summary.projectCount} {summary.projectCount === 1 ? "project" : "projects"}
      </span>
    );
  }
  return null;
}

function PersonCard({
  person,
  accSummary,
  onClick,
}: {
  person: OrgPerson;
  accSummary?: AccSummaryItem;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left p-4 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start gap-3">
        <PersonAvatar person={person} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate leading-tight">
            {person.displayName}
          </p>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {person.email}
          </p>
        </div>
      </div>

      <div className="mt-2.5 space-y-1">
        {person.department && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Building2 size={10} className="shrink-0" />
            <span className="truncate">{person.department}</span>
          </div>
        )}
        {person.jobTitle && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Briefcase size={10} className="shrink-0" />
            <span className="truncate">{person.jobTitle}</span>
          </div>
        )}
        {person.costCenter && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <DollarSign size={10} className="shrink-0" />
            <span className="truncate">{person.costCenter}</span>
          </div>
        )}
        {person.phoneNumber && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Phone size={10} className="shrink-0" />
            <span className="truncate">{person.phoneNumber}</span>
          </div>
        )}
      </div>

      {/* ACC badge */}
      <div className="mt-2.5">
        <AccBadge summary={accSummary} />
      </div>
    </button>
  );
}

function PersonRow({
  person,
  accSummary,
  onClick,
}: {
  person: OrgPerson;
  accSummary?: AccSummaryItem;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group/row w-full text-left flex items-center gap-4 px-4 py-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all duration-150"
    >
      <PersonAvatar person={person} size="sm" />
      <div className="min-w-0 flex-1 grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr_auto] gap-3 items-center">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{person.displayName}</p>
          <p className="text-[11px] text-muted-foreground truncate">{person.email}</p>
        </div>
        <div className="min-w-0 text-xs text-muted-foreground truncate">
          {person.department || <span className="text-muted-foreground/30">--</span>}
        </div>
        <div className="min-w-0 text-xs text-muted-foreground truncate">
          {person.jobTitle || <span className="text-muted-foreground/30">--</span>}
        </div>
        <div className="min-w-0 text-xs text-muted-foreground truncate">
          {person.costCenter || <span className="text-muted-foreground/30">--</span>}
        </div>
        <div className="min-w-0 text-xs text-muted-foreground truncate">
          {person.phoneNumber || <span className="text-muted-foreground/30">--</span>}
        </div>
        <div className="shrink-0">
          <AccBadge summary={accSummary} />
        </div>
      </div>
    </button>
  );
}

function CollapsibleGroup({
  label,
  count,
  children,
  defaultOpen = true,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 mb-2 group"
      >
        {open ? (
          <ChevronDown size={14} className="text-primary" />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
        )}
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {count}
        </Badge>
      </button>
      {open && children}
    </div>
  );
}

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
        className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
      >
        <X size={10} />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function UsersDirectoryClient() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<OrgPerson | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [groupBy, setGroupBy] = useState<GroupByField>("none");
  const [filterDept, setFilterDept] = useState<string | null>(null);
  const [filterJobTitle, setFilterJobTitle] = useState<string | null>(null);
  const [filterCostCenter, setFilterCostCenter] = useState<string | null>(null);
  const [filterNoProjects, setFilterNoProjects] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Bulk ACC cache summary — used for instant "No ACC Projects" filter + card badges
  const { data: accSummaryRaw = [] } = trpc.users.bulkAccSummary.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });

  const {
    data: directoryData,
    isLoading: isDirectoryLoading,
    error,
  } = trpc.users.getOrgDirectory.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });

  const {
    data: fallbackDirectory = [],
    isLoading: isFallbackLoading,
  } = trpc.users.getDirectory.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });

  const people = useMemo<OrgPerson[]>(() => {
    if (directoryData?.status === "ok") {
      return directoryData.people ?? [];
    }

    return (fallbackDirectory as LocalDirectoryUser[]).map((user) => ({
      resourceName: user.id,
      displayName: user.name ?? user.email,
      email: user.email,
      photoUrl: user.image ?? null,
      department: user.department ?? null,
      jobTitle: user.jobTitle ?? null,
      phoneNumber: null,
      costCenter: null,
    }));
  }, [directoryData, fallbackDirectory]);

  const isLoading = !people.length && isDirectoryLoading && isFallbackLoading;

  // Map of email -> AccSummaryItem for O(1) lookup in render
  const accSummaryMap = useMemo<Map<string, AccSummaryItem>>(() => {
    const map = new Map<string, AccSummaryItem>();
    for (const item of accSummaryRaw as AccSummaryItem[]) {
      map.set(item.email, item);
    }
    return map;
  }, [accSummaryRaw]);

  // Count of people in the directory who have hasNoProjects === true
  const noProjectsCount = useMemo(
    () => people.filter((p) => accSummaryMap.get(p.email)?.hasNoProjects === true).length,
    [people, accSummaryMap]
  );

  const usingFallbackDirectory =
    !error && (directoryData?.status !== "ok" || (isDirectoryLoading && fallbackDirectory.length > 0));

  const directoryBanner = useMemo(() => {
    if (error || directoryData?.status === "ok") {
      return null;
    }

    if (isDirectoryLoading && fallbackDirectory.length > 0) {
      return {
        title: "Loading organization directory",
        description:
          "Google directory is still loading. Showing registered app users for now.",
      };
    }

    if (directoryData?.status === "not_linked") {
      return {
        title: "Google directory not linked",
        description:
          "Google is not linked for organization lookup. Showing registered app users only.",
      };
    }

    return {
      title: "Organization directory unavailable",
      description: `${
        directoryData?.message ?? "Reconnect your Google account to restore Directory access."
      } Showing registered app users only.`,
    };
  }, [directoryData, error, fallbackDirectory.length, isDirectoryLoading]);

  // Debounced search for real-time feel without excessive re-renders
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(value), 150);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  // Derived data
  const departments = useMemo(() => uniqueSorted(people.map((p) => p.department)), [people]);
  const jobTitles = useMemo(() => uniqueSorted(people.map((p) => p.jobTitle)), [people]);
  const costCenters = useMemo(() => uniqueSorted(people.map((p) => p.costCenter)), [people]);

  const hasActiveFilters = !!(filterDept || filterJobTitle || filterCostCenter || filterNoProjects);

  // Filter + search
  const filtered = useMemo(() => {
    const { fieldFilters, freeText } = parseSearchTokens(debouncedSearch);

    return people.filter((p) => {
      // Dropdown filters
      if (filterDept && p.department !== filterDept) return false;
      if (filterJobTitle && p.jobTitle !== filterJobTitle) return false;
      if (filterCostCenter && p.costCenter !== filterCostCenter) return false;
      // ACC "No Projects" filter — only show users with cache entry AND hasNoProjects true
      if (filterNoProjects) {
        const summary = accSummaryMap.get(p.email);
        if (!summary || !summary.hasNoProjects) return false;
      }
      // Search bar (free text + field scoped)
      return matchesPerson(p, freeText, fieldFilters);
    });
  }, [people, debouncedSearch, filterDept, filterJobTitle, filterCostCenter, filterNoProjects, accSummaryMap]);

  // Grouped data
  const groups = useMemo(() => {
    if (groupBy === "none") return null;

    const map = new Map<string, OrgPerson[]>();
    for (const person of filtered) {
      const key = (person[groupBy] as string | null) || "Not specified";
      const arr = map.get(key) ?? [];
      arr.push(person);
      map.set(key, arr);
    }

    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "Not specified") return 1;
      if (b === "Not specified") return -1;
      return a.localeCompare(b);
    });
  }, [filtered, groupBy]);

  // Stats
  const stats = useMemo(() => ({
    total: people.length,
    shown: filtered.length,
    depts: departments.length,
    costCenters: costCenters.length,
  }), [people, filtered, departments, costCenters]);

  function clearAllFilters() {
    setFilterDept(null);
    setFilterJobTitle(null);
    setFilterCostCenter(null);
    setFilterNoProjects(false);
    handleSearchChange("");
  }

  function renderPeople(list: OrgPerson[]) {
    if (viewMode === "list") {
      return (
        <div className="space-y-1.5">
          {/* List header */}
          <div className="hidden lg:grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr_auto] gap-3 px-4 py-2 pl-[68px] text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
            <span>Name</span>
            <span>Department</span>
            <span>Job Title</span>
            <span>Cost Center</span>
            <span>Phone</span>
            <span>ACC</span>
          </div>
          {list.map((person) => (
            <PersonRow
              key={person.resourceName}
              person={person}
              accSummary={accSummaryMap.get(person.email)}
              onClick={() => setSelectedPerson(person)}
            />
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {list.map((person) => (
          <PersonCard
            key={person.resourceName}
            person={person}
            accSummary={accSummaryMap.get(person.email)}
            onClick={() => setSelectedPerson(person)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-4 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
            <Users size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              Organization Directory
            </h1>
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? "Loading..."
                : stats.shown === stats.total
                  ? `${stats.total} ${usingFallbackDirectory ? "registered users" : "people"}`
                  : `${stats.shown} of ${stats.total} ${usingFallbackDirectory ? "registered users" : "people"}`}
              {stats.depts > 0 && !isLoading && (
                <span className="text-muted-foreground/50">
                  {" "}&middot; {stats.depts} departments
                </span>
              )}
              {stats.costCenters > 0 && !isLoading && (
                <span className="text-muted-foreground/50">
                  {" "}&middot; {stats.costCenters} cost centers
                </span>
              )}
            </p>
          </div>
        </div>

        {/* View toggle + Group by */}
        <div className="flex items-center gap-2">
          <Select
            value={groupBy}
            onValueChange={(v) => setGroupBy(v as GroupByField)}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs bg-card border-border">
              <SelectValue placeholder="Group by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grouping</SelectItem>
              <SelectItem value="department">Department</SelectItem>
              <SelectItem value="jobTitle">Job Title</SelectItem>
              <SelectItem value="costCenter">Cost Center</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === "grid"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === "list"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search anything... or use dept:, job:, cc:, phone:, email:"
            className="pl-8 pr-10 bg-card border-border"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {search && (
            <button
              onClick={() => handleSearchChange("")}
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

          {/* ACC "No Projects" filter chip — only visible when there is cache data */}
          {noProjectsCount > 0 && (
            <button
              onClick={() => setFilterNoProjects((prev) => !prev)}
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
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <div>
            <p className="font-medium">Could not load organization directory</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Refresh the page and try again. If the problem persists, check the server logs.
            </p>
          </div>
        </div>
      )}

      {directoryBanner && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <div>
            <p className="font-medium">{directoryBanner.title}</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              {directoryBanner.description}
            </p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="p-4 rounded-2xl border border-border bg-card animate-pulse"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-muted/50 shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 bg-muted/50 rounded w-3/4" />
                  <div className="h-2.5 bg-muted/30 rounded w-1/2" />
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="h-2 bg-muted/20 rounded w-2/3" />
                <div className="h-2 bg-muted/20 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!isLoading && (
        <>
          {groups ? (
            <div className="space-y-6">
              {groups.map(([label, members]) => (
                <CollapsibleGroup
                  key={label}
                  label={label}
                  count={members.length}
                  defaultOpen={groups.length <= 8}
                >
                  {renderPeople(members)}
                </CollapsibleGroup>
              ))}
            </div>
          ) : (
            renderPeople(filtered)
          )}

          {filtered.length === 0 && !error && (
            <div className="text-center py-16 space-y-2">
              <UserCircle
                size={40}
                className="mx-auto text-muted-foreground/30"
              />
              <p className="text-sm text-muted-foreground">
                {search || hasActiveFilters
                  ? "No people match your search or filters"
                  : usingFallbackDirectory
                    ? "No registered users found."
                    : "No people found in your organization directory."}
              </p>
              {(search || hasActiveFilters) && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-primary hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </>
      )}

      <PersonDetailModal
        person={selectedPerson}
        open={!!selectedPerson}
        onOpenChange={(v) => {
          if (!v) setSelectedPerson(null);
        }}
      />
    </div>
  );
}
