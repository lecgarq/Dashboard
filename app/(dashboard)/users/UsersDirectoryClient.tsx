"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { trpc } from "@/lib/core/trpc";
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
  Activity,
  UserPlus,
  Database,
  CheckCircle2,
  CircleDashed,
} from "lucide-react";
import { cn } from "@/lib/core/utils";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { AccUsersGraphProps } from "./AccUsersGraph";
import {
  mapFallbackDirectoryToOrgPeople,
  mergeAccSummaryWithEnrichment,
  mergePeopleWithAccSummary,
} from "./useMergedAccUsers";
import { countGroupedItems, limitGroupedItems } from "./directoryRenderWindow";
import { moduleLabel } from "@/lib/acc/modules";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";

const AccProfileSection = dynamic<{ email: string }>(
  () => import("./AccProfileSection").then((m) => m.AccProfileSection),
  { ssr: false, loading: () => <div className="mt-5 h-24 rounded-xl bg-muted/20" /> },
);

const AccAnalysisPanel = dynamic<{ users: BulkAccUser[] }>(
  () => import("./AccAnalysisPanel").then((m) => m.AccAnalysisPanel),
  { ssr: false, loading: () => <div className="h-80 rounded-xl border bg-card animate-pulse" /> },
);

const AccUsersGraph = dynamic<AccUsersGraphProps>(
  () => import("./AccUsersGraph").then((m) => m.AccUsersGraph),
  { ssr: false, loading: () => <div className="h-[680px] rounded-xl border bg-card animate-pulse" /> },
);

const UserActivityBody = dynamic<{ email: string; users: BulkAccUser[] }>(
  () => import("./dashboard/DashboardSidePanel").then((m) => m.UserActivityBody),
  { ssr: false, loading: () => <div className="h-80 rounded-xl bg-muted/20 animate-pulse" /> },
);

const DIRECTORY_RENDER_BATCH = 160;

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
type UsersTab = "directory" | "analysis" | "audit" | "graph";



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
// File-activity column helpers (ACTV-03 / LIST-03 prep)
// ---------------------------------------------------------------------------

type FileActivityKey = "lastView" | "lastUpload" | "lastEdit" | "lastDelete";

const FILE_ACTIVITY_COLUMNS: ReadonlyArray<{ key: FileActivityKey; label: string }> = [
  { key: "lastView", label: "View" },
  { key: "lastUpload", label: "Upload" },
  { key: "lastEdit", label: "Edit" },
  { key: "lastDelete", label: "Delete" },
];

// ---------------------------------------------------------------------------
// Module badge (Phase 08-07 / DC8-16)
// ---------------------------------------------------------------------------
//
// Every File Activity row carries `service` once Phase 8 ingest has run (one
// of the 9 KNOWN_MODULES from lib/acc/dcActivityCsvIngest.ts). The badge is a
// tiny inline chip rendered at the start of each activity row so the user can
// see at a glance which ACC module produced the event (Docs / Issues / RFIs /
// etc.) without reading the action label.
//
// Color hint mirrors the 6-step tier ramp from Phase 4 06 — distinct hue per
// module, low-saturation backgrounds with high-contrast text.
//
// Exported for reuse by DashboardSidePanel.UserActivityBody (the actual row
// rendering site).
export const MODULE_BADGE_COLORS: Record<string, string> = {
  docs: "bg-blue-100 text-blue-800",
  issues: "bg-red-100 text-red-800",
  submittals: "bg-amber-100 text-amber-800",
  rfis: "bg-emerald-100 text-emerald-800",
  sheets: "bg-indigo-100 text-indigo-800",
  admin: "bg-slate-100 text-slate-700",
  cost: "bg-purple-100 text-purple-800",
  assets: "bg-teal-100 text-teal-800",
  bridge: "bg-orange-100 text-orange-800",
};

export function ModuleBadge({ service }: { service: string | null | undefined }) {
  if (!service) return null;
  // Lookup keyed by row.service (DC8-16) — falls back to neutral slate for
  // any future / unmapped module name so we never crash on novel surfaces.
  const className =
    MODULE_BADGE_COLORS[service.toLowerCase()] ?? "bg-slate-200 text-slate-700";
  return (
    <span
      className={cn(
        "inline-block px-1.5 py-0.5 text-[10px] font-medium rounded uppercase tracking-wide shrink-0",
        className
      )}
      title={`Source module: ${service}`}
    >
      {service}
    </span>
  );
}

/**
 * Reads from React Query cache only — does NOT fire a query. This honors
 * ACTV-03's "NOT eager-loaded" contract. Data arrives via hover prefetch
 * (250ms debounce) or via the side-panel open (which calls useQuery directly).
 */
function FileActivityCell({
  email,
  field,
  active,
  onClick,
}: {
  email: string;
  field: FileActivityKey;
  active: boolean;
  onClick: () => void;
}) {
  // `enabled: active` guards: cell only fetches when row was hovered
  // (we set active=true on enter, leave it true after to keep cache warm).
  const { data } = trpc.accActivity.getFileActivityForUser.useQuery(
    { email },
    { enabled: active, staleTime: 5 * 60_000, retry: false },
  );

  const value = data ? data[field] : undefined;

  if (!active || data === undefined) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="text-muted-foreground/40 hover:text-primary text-[11px] tabular-nums"
        title="Hover the row to load activity"
      >
        —
      </button>
    );
  }

  if (value === null || value === undefined) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="text-muted-foreground/50 hover:text-primary text-[11px]"
      >
        Never
      </button>
    );
  }

  const date: Date = value instanceof Date ? value : new Date(value as string | number);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="text-foreground hover:text-primary text-[11px] tabular-nums truncate text-left"
      title={date.toISOString()}
    >
      {formatDistanceToNowStrict(date, { addSuffix: true })}
    </button>
  );
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
function AccBadge({ summary }: { summary: BulkAccUser | undefined }) {
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
  accSummary?: BulkAccUser;
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
  activityActive,
  onHoverEnter,
  onHoverLeave,
  onActivityCellClick,
}: {
  person: OrgPerson;
  accSummary?: BulkAccUser;
  onClick: () => void;
  activityActive: boolean;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onActivityCellClick: () => void;
}) {
  return (
    <div
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      className="group/row w-full flex items-center gap-4 px-4 py-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all duration-150 cursor-pointer"
      onClick={onClick}
    >
      <PersonAvatar person={person} size="sm" />
      <div className="min-w-0 flex-1 grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr_0.7fr_0.7fr_0.7fr_0.7fr_auto] gap-3 items-center">
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
        {FILE_ACTIVITY_COLUMNS.map((col) => (
          <div key={col.key} className="min-w-0">
            <FileActivityCell
              email={person.email}
              field={col.key}
              active={activityActive}
              onClick={onActivityCellClick}
            />
          </div>
        ))}
        <div className="shrink-0">
          <AccBadge summary={accSummary} />
        </div>
      </div>
    </div>
  );
}

/**
 * Window-virtualized list of PersonRows. Only ~20 rows live in the DOM at any
 * time; the rest occupy reserved height so the document scrollHeight is correct.
 * Saved ~5000+ DOM nodes when the directory accordion expands at hub scale.
 */
function PersonRowList({
  list,
  accSummaryMap,
  activatedEmails,
  onPersonClick,
  onHoverEnter,
  onHoverLeave,
  onActivityCellClick,
}: {
  list: OrgPerson[];
  accSummaryMap: Map<string, BulkAccUser>;
  activatedEmails: Set<string>;
  onPersonClick: (p: OrgPerson) => void;
  onHoverEnter: (email: string) => void;
  onHoverLeave: (email: string) => void;
  onActivityCellClick: (email: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  // Force re-render once parentRef mounts so scrollMargin picks up its offsetTop.
  const [, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const virtualizer = useWindowVirtualizer({
    count: list.length,
    estimateSize: () => 72,
    overscan: 8,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
  });

  return (
    <div
      ref={parentRef}
      style={{ position: "relative", height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((vi) => {
        const person = list[vi.index];
        return (
          <div
            key={person.resourceName}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)`,
              paddingBottom: 6,
            }}
          >
            <PersonRow
              person={person}
              accSummary={accSummaryMap.get(person.email)}
              onClick={() => onPersonClick(person)}
              activityActive={activatedEmails.has(person.email)}
              onHoverEnter={() => onHoverEnter(person.email)}
              onHoverLeave={() => onHoverLeave(person.email)}
              onActivityCellClick={() => onActivityCellClick(person.email)}
            />
          </div>
        );
      })}
    </div>
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

function CoveragePill({
  label,
  available,
  loading,
  detail,
}: {
  label: string;
  available: boolean;
  loading?: boolean;
  detail?: string;
}) {
  const Icon = loading ? CircleDashed : available ? CheckCircle2 : AlertCircle;
  return (
    <span
      title={detail}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium",
        loading
          ? "border-border bg-card text-muted-foreground"
          : available
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
            : "border-amber-500/25 bg-amber-500/10 text-amber-500",
      )}
    >
      <Icon size={12} className={cn("shrink-0", loading && "animate-spin")} />
      {label}
    </span>
  );
}

function DataCoverageStrip({
  coverage,
}: {
  coverage: Array<{ label: string; available: boolean; loading?: boolean; detail?: string }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Database size={12} />
        Data Coverage
      </span>
      <div className="h-4 w-px bg-border/60" />
      {coverage.map((item) => (
        <CoveragePill key={item.label} {...item} />
      ))}
    </div>
  );
}

function ActivityAuditPanel({
  users,
  invitations,
  invitationsLoading,
  selectedEmail,
  onSelectEmail,
}: {
  users: BulkAccUser[];
  invitations: Array<{
    inviteeEmail: string | null;
    inviteeName: string | null;
    primary: {
      createdAt: Date | string;
      inviterName: string | null;
      inviterEmail: string | null;
      inviteeEmail: string | null;
    };
    others: unknown[];
  }>;
  invitationsLoading: boolean;
  selectedEmail: string | null;
  onSelectEmail: (email: string) => void;
}) {
  const [query, setQuery] = useState("");
  const searchableUsers = useMemo(() => {
    const q = normalize(query);
    return users
      .filter((user) => user.found)
      .filter((user) => {
        if (!q) return true;
        return normalize(`${user.name ?? ""} ${user.email}`).includes(q);
      })
      .slice(0, 80);
  }, [users, query]);

  const recentUsers = useMemo(
    () => users
      .filter((user) => user.addedOn)
      .sort((a, b) => String(b.addedOn).localeCompare(String(a.addedOn)))
      .slice(0, 12),
    [users],
  );

  const activeEmail = selectedEmail ?? searchableUsers[0]?.email ?? recentUsers[0]?.email ?? null;

  return (
    <div className="grid min-h-[620px] grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col gap-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity size={15} className="text-primary" />
            <h2 className="text-sm font-semibold">Activity Audit</h2>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Find a user"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
            {searchableUsers.map((user) => (
              <button
                key={user.email}
                onClick={() => onSelectEmail(user.email)}
                className={cn(
                  "w-full rounded-lg px-2.5 py-2 text-left transition-colors",
                  activeEmail === user.email ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <p className="truncate text-xs font-semibold">{user.name || user.email}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <UserPlus size={15} className="text-primary" />
            <h2 className="text-sm font-semibold">Who Added Whom</h2>
          </div>
          {invitationsLoading ? (
            <p className="text-xs text-muted-foreground">Loading invitations...</p>
          ) : invitations.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recent invitation activity found.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {invitations.slice(0, 20).map((item) => {
                const created = item.primary.createdAt instanceof Date
                  ? item.primary.createdAt
                  : new Date(item.primary.createdAt);
                const invitee = item.inviteeName || item.inviteeEmail || "Unknown invitee";
                const inviter = item.primary.inviterName || item.primary.inviterEmail || "Unknown inviter";
                return (
                  <div key={`${item.primary.inviteeEmail ?? invitee}:${created.toISOString()}`} className="rounded-lg bg-muted/40 p-2">
                    <p className="text-xs font-medium">{invitee}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Added by {inviter} · {formatDistanceToNowStrict(created, { addSuffix: true })}
                      {item.others.length > 0 ? ` · +${item.others.length} others` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {recentUsers.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Recently Added</h2>
            <div className="space-y-1">
              {recentUsers.map((user) => (
                <button
                  key={user.email}
                  onClick={() => onSelectEmail(user.email)}
                  className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted"
                >
                  <p className="truncate text-xs font-medium">{user.name || user.email}</p>
                  <p className="text-[11px] text-muted-foreground">{String(user.addedOn).slice(0, 10)}</p>
                </button>
              ))}
            </div>
          </section>
        )}
      </aside>

      <section className="min-h-0 rounded-xl border border-border bg-card">
        {activeEmail ? (
          <UserActivityBody email={activeEmail} users={users} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            Select a user to inspect activity.
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function UsersDirectoryClient() {
  const [activeTab, setActiveTab] = useState<UsersTab>("directory");
  const [selectedPersonEmail, setSelectedPersonEmail] = useState<string | null>(null);
  const [auditEmail, setAuditEmail] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<OrgPerson | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [groupBy, setGroupBy] = useState<GroupByField>("none");
  const [filterDept, setFilterDept] = useState<string | null>(null);
  const [filterJobTitle, setFilterJobTitle] = useState<string | null>(null);
  const [filterCostCenter, setFilterCostCenter] = useState<string | null>(null);
  const [filterNoProjects, setFilterNoProjects] = useState(false);
  const [filterAccProject, setFilterAccProject] = useState<string | null>(null);
  const [filterAccRole, setFilterAccRole] = useState<string | null>(null);
  const [filterAccModule, setFilterAccModule] = useState<string | null>(null);
  const [directoryRenderLimit, setDirectoryRenderLimit] = useState(DIRECTORY_RENDER_BATCH);
  const [perfLoggingEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.has("usersPerf") || localStorage.getItem("users-perf") === "1";
  });
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ACTV-03: per-row hover-prefetch state. activatedEmails tracks rows whose
  // file-activity query has been "activated" by hover; FileActivityCell flips
  // its useQuery `enabled` flag on once activated and stays on so the cache
  // keeps serving subsequent renders.
  const utils = trpc.useUtils();
  const [activatedEmails, setActivatedEmails] = useState<Set<string>>(new Set());
  const hoverTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [activityEmail, setActivityEmail] = useState<string | null>(null);

  const activateEmail = useCallback((email: string) => {
    setActivatedEmails((prev) => {
      if (prev.has(email)) return prev;
      const next = new Set(prev);
      next.add(email);
      return next;
    });
  }, []);

  const handleRowHoverEnter = useCallback(
    (email: string) => {
      // Already active? Skip — no double prefetch.
      if (activatedEmails.has(email)) return;
      // Existing timer? Skip — debounce already in flight.
      if (hoverTimers.current.has(email)) return;
      const timer = setTimeout(() => {
        hoverTimers.current.delete(email);
        utils.accActivity.getFileActivityForUser
          .prefetch({ email }, { staleTime: 5 * 60_000 })
          .catch(() => {
            // Silent — query.error will surface in the side panel if needed.
          });
        activateEmail(email);
      }, 250);
      hoverTimers.current.set(email, timer);
    },
    [activatedEmails, utils, activateEmail],
  );

  const handleRowHoverLeave = useCallback((email: string) => {
    const timer = hoverTimers.current.get(email);
    if (timer) {
      clearTimeout(timer);
      hoverTimers.current.delete(email);
    }
  }, []);

  const openActivitySheet = useCallback(
    (email: string) => {
      activateEmail(email); // also flips the cell from "—" to populated
      setActivityEmail(email);
    },
    [activateEmail],
  );

  // Cleanup all hover timers on unmount
  useEffect(() => {
    const timers = hoverTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // Bulk ACC cache summary — used for instant "No ACC Projects" filter + card badges (Plan 7.1)
  // and for the ACC Analysis panel (Plan 7.2). Extended fields: allRoles, allModules, projects[].
  const { data: accSummaryRaw = [], refetch: refetchAccSummary } = trpc.users.bulkAccSummary.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });
  const { data: enrichedUsers = [], isLoading: enrichedLoading } = trpc.accMembers.enrichedUsers.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });
  const invitationsQuery = trpc.accActivity.listInvitations.useQuery(
    { windowDays: 90, limit: 100 },
    { staleTime: 300_000, retry: false, enabled: activeTab === "audit" },
  );
  const activityCoverageQuery = trpc.accActivity.getCoverage.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });
  const folderCoverageQuery = trpc.accFolders.getCoverage.useQuery(undefined, {
    staleTime: 600_000,
    retry: false,
  });
  const accSummary = useMemo<BulkAccUser[]>(() => {
    return mergeAccSummaryWithEnrichment(accSummaryRaw as BulkAccUser[], enrichedUsers);
  }, [accSummaryRaw, enrichedUsers]);

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

    return mapFallbackDirectoryToOrgPeople(fallbackDirectory as LocalDirectoryUser[]);
  }, [directoryData, fallbackDirectory]);

  const isLoading = !people.length && isDirectoryLoading && isFallbackLoading;

  // Map of email -> BulkAccUser for O(1) lookup in render
  const accSummaryMap = useMemo<Map<string, BulkAccUser>>(() => {
    const map = new Map<string, BulkAccUser>();
    for (const item of accSummary) {
      map.set(item.email, item);
    }
    return map;
  }, [accSummary]);

  // All 1197 directory people merged with ACC cache data — unregistered people get found:false stubs
  const mergedAccUsers = useMemo<BulkAccUser[]>(() => {
    const byEmail = new Map<string, BulkAccUser>();
    for (const u of accSummary) byEmail.set(u.email.toLowerCase(), u);
    return people.map((p) => byEmail.get(p.email.toLowerCase()) ?? {
      email: p.email,
      name: p.displayName,
      found: false,
      projectCount: 0,
      activeCount: 0,
      adminCount: 0,
      hasNoProjects: true,
      syncedAt: "",
      allRoles: [],
      allModules: [],
      projects: [],
      isAccountAdmin: false,
      addedOn: null,
    });
  }, [people, accSummary]);

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

  // Auto-open modal for user navigated from Graph tab
  useEffect(() => {
    if (!selectedPersonEmail || activeTab !== "directory") return;
    const person = people.find((p) => p.email === selectedPersonEmail);
    if (person) {
      setSelectedPerson(person);
      setSelectedPersonEmail(null);
    }
  }, [selectedPersonEmail, activeTab, people]);

  // Derived data
  const departments = useMemo(() => uniqueSorted(people.map((p) => p.department)), [people]);
  const jobTitles = useMemo(() => uniqueSorted(people.map((p) => p.jobTitle)), [people]);
  const costCenters = useMemo(() => uniqueSorted(people.map((p) => p.costCenter)), [people]);

  const accProjects = useMemo(() => {
    const set = new Set<string>();
    for (const u of accSummary) {
      for (const p of u.projects) set.add(p.name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accSummary]);

  const accRoles = useMemo(() => {
    const set = new Set<string>();
    for (const u of accSummary) {
      for (const r of u.allRoles) set.add(r);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accSummary]);

  const accModules = useMemo(() => {
    const set = new Set<string>();
    for (const u of accSummary) {
      for (const m of u.allModules) set.add(m);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accSummary]);

  const coverage = useMemo(() => {
    const hasProjectMembers = accSummary.some((user) => user.found);
    const hasRoles = accSummary.some((user) => (user.allRoles?.length ?? 0) > 0);
    const hasLastSignIn = accSummary.some((user) => !!user.lastSignIn);
    const activityRows = activityCoverageQuery.data?.totalRows ?? 0;
    const attributedActivityRows = activityCoverageQuery.data?.attributedRows ?? 0;
    const folderCount = folderCoverageQuery.data?.folderCount ?? 0;
    const permissionCount = folderCoverageQuery.data?.permissionCount ?? 0;
    const hasRecentAdditions =
      accSummary.some((user) => !!user.addedOn) ||
      (invitationsQuery.data?.invitations.length ?? 0) > 0;
    return [
      { label: "Project Members", available: hasProjectMembers, loading: !accSummaryRaw.length && isLoading },
      { label: "Roles", available: hasRoles, loading: enrichedLoading },
      { label: "Last Sign-In", available: hasLastSignIn, loading: !accSummaryRaw.length && isLoading },
      {
        label: "Activity Logs",
        available: activityRows > 0,
        loading: activityCoverageQuery.isLoading,
        detail: `${activityRows.toLocaleString()} activity rows, ${attributedActivityRows.toLocaleString()} matched to users`,
      },
      {
        label: "Folder Permissions",
        available: permissionCount > 0,
        loading: folderCoverageQuery.isLoading,
        detail: `${permissionCount.toLocaleString()} permission rows across ${folderCount.toLocaleString()} folders`,
      },
      { label: "Recent Additions", available: hasRecentAdditions, loading: invitationsQuery.isLoading },
    ];
  }, [
    activityCoverageQuery.data,
    activityCoverageQuery.isLoading,
    accSummary,
    accSummaryRaw.length,
    enrichedLoading,
    folderCoverageQuery.data,
    folderCoverageQuery.isLoading,
    invitationsQuery.data,
    invitationsQuery.isLoading,
    isLoading,
  ]);

  const hasActiveFilters = !!(
    filterDept || filterJobTitle || filterCostCenter || filterNoProjects ||
    filterAccProject || filterAccRole || filterAccModule
  );

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
      // ACC filters
      if (filterAccProject || filterAccRole || filterAccModule) {
        const summary = accSummaryMap.get(p.email);
        if (!summary) return false;
        if (filterAccProject && !summary.projects?.some((proj) => proj.name === filterAccProject)) return false;
        if (filterAccRole && !summary.allRoles?.includes(filterAccRole)) return false;
        if (filterAccModule && !summary.allModules?.includes(filterAccModule)) return false;
      }
      
      // Search bar (free text + field scoped)
      return matchesPerson(p, freeText, fieldFilters);
    });
  }, [
    people, debouncedSearch, filterDept, filterJobTitle, filterCostCenter, 
    filterNoProjects, filterAccProject, filterAccRole, filterAccModule, accSummaryMap
  ]);

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

  useEffect(() => {
    setDirectoryRenderLimit(DIRECTORY_RENDER_BATCH);
  }, [
    debouncedSearch,
    filterDept,
    filterJobTitle,
    filterCostCenter,
    filterNoProjects,
    filterAccProject,
    filterAccRole,
    filterAccModule,
    groupBy,
    viewMode,
  ]);

  const visibleFiltered = useMemo(
    () => filtered.slice(0, directoryRenderLimit),
    [filtered, directoryRenderLimit],
  );

  const visibleGroups = useMemo(
    () => groups ? limitGroupedItems(groups, directoryRenderLimit) : null,
    [groups, directoryRenderLimit],
  );

  const renderedDirectoryCount = visibleGroups ? countGroupedItems(visibleGroups) : visibleFiltered.length;
  const hasMoreDirectoryRows = renderedDirectoryCount < filtered.length;

  useEffect(() => {
    if (!perfLoggingEnabled) return;
    const frame = requestAnimationFrame(() => {
      const memory = "memory" in performance
        ? (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory
        : undefined;
      console.debug("[UsersPerf]", {
        activeTab,
        people: people.length,
        filtered: filtered.length,
        renderedDirectoryCount,
        directoryRenderLimit,
        accUsers: mergedAccUsers.length,
        heapMB: memory?.usedJSHeapSize ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : null,
      });
      performance.mark(`users-tab-render:${activeTab}:${renderedDirectoryCount}`);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    activeTab,
    directoryRenderLimit,
    filtered.length,
    mergedAccUsers.length,
    people.length,
    perfLoggingEnabled,
    renderedDirectoryCount,
  ]);

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
    setFilterAccProject(null);
    setFilterAccRole(null);
    setFilterAccModule(null);
    handleSearchChange("");
  }

  function renderPeople(list: OrgPerson[]) {
    if (viewMode === "list") {
      return (
        <div className="space-y-1.5">
          {/* Two-row grouped header — top row spans "File Activity" across 4 sub-columns */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr_2.8fr_auto] gap-3 px-4 pt-2 pl-[68px] text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
              <span>Name</span>
              <span>Department</span>
              <span>Job Title</span>
              <span>Cost Center</span>
              <span>Phone</span>
              <span className="text-center border-b border-border/30 pb-0.5">
                File Activity
              </span>
              <span>ACC</span>
            </div>
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr_0.7fr_0.7fr_0.7fr_0.7fr_auto] gap-3 px-4 py-1 pl-[68px] text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span className="text-muted-foreground/80">View</span>
              <span className="text-muted-foreground/80">Upload</span>
              <span className="text-muted-foreground/80">Edit</span>
              <span className="text-muted-foreground/80">Delete</span>
              <span />
            </div>
          </div>
          <PersonRowList
            list={list}
            accSummaryMap={accSummaryMap}
            activatedEmails={activatedEmails}
            onPersonClick={setSelectedPerson}
            onHoverEnter={handleRowHoverEnter}
            onHoverLeave={handleRowHoverLeave}
            onActivityCellClick={openActivitySheet}
          />
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
    <div className={cn(
      activeTab === "graph"
        ? "flex h-full w-full flex-col"
        : "mx-auto max-w-[1600px] p-6 space-y-4 animate-fade-up",
    )}>
      {/* Header */}
      <div className={cn("flex items-center justify-between shrink-0", activeTab === "graph" && "px-6 pt-6")}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
            <Users size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              Users
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

        {/* Directory view controls */}
        {activeTab === "directory" && (
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
        )}
      </div>

      {/* Tab switcher */}
      <div className={cn("flex items-center gap-1 border-b border-border/40 pb-0 shrink-0", activeTab === "graph" && "px-6")}>
        {([
          ["directory", "Directory"],
          ["analysis", "Access Analysis"],
          ["audit", "Activity Audit"],
          ["graph", "Spatial Graph"],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-all -mb-px",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={cn("shrink-0", activeTab === "graph" && "px-6")}>
        <DataCoverageStrip coverage={coverage} />
      </div>

      {/* Access Analysis tab */}
      {activeTab === "analysis" && (
        <AccAnalysisPanel users={mergedAccUsers} />
      )}

      {/* Activity Audit tab */}
      {activeTab === "audit" && (
        <ActivityAuditPanel
          users={mergedAccUsers}
          invitations={invitationsQuery.data?.invitations ?? []}
          invitationsLoading={invitationsQuery.isLoading}
          selectedEmail={auditEmail}
          onSelectEmail={setAuditEmail}
        />
      )}

      {/* Spatial Graph tab */}
      {activeTab === "graph" && (
        <div className="flex-1 min-h-0 pt-4">
          <AccUsersGraph
            users={mergedAccUsers}
            onSelectUser={(email) => {
              setSelectedPersonEmail(email);
              setActiveTab("directory");
            }}
          />
        </div>
      )}

      {/* General tab content: search bar, filters, directory listing */}
      {activeTab === "directory" && (
      <>
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
              onValueChange={(v) => setFilterAccModule(v === "__all__" ? null : v)}
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
                value={moduleLabel(filterAccModule)}
                onClear={() => setFilterAccModule(null)}
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
          {visibleGroups ? (
            <div className="space-y-6">
              {visibleGroups.map(([label, members]) => (
                <CollapsibleGroup
                  key={label}
                  label={label}
                  count={members.length}
                  defaultOpen={visibleGroups.length <= 8}
                >
                  {renderPeople(members)}
                </CollapsibleGroup>
              ))}
            </div>
          ) : (
            renderPeople(visibleFiltered)
          )}

          {hasMoreDirectoryRows && (
            <div className="flex items-center justify-center pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDirectoryRenderLimit((limit) => limit + DIRECTORY_RENDER_BATCH)}
              >
                Show {Math.min(DIRECTORY_RENDER_BATCH, filtered.length - renderedDirectoryCount).toLocaleString()} more
              </Button>
            </div>
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

      {/* File Activity drill-down sheet (ACTV-05) — opens when a row's
          file-activity cell is clicked. Reuses UserActivityBody from the
          dashboard side panel so the experience matches. */}
      <Sheet
        open={!!activityEmail}
        onOpenChange={(v) => {
          if (!v) setActivityEmail(null);
        }}
      >
        <SheetContent side="right" className="sm:max-w-lg">
          {activityEmail && (
            <UserActivityBody email={activityEmail} users={mergedAccUsers} />
          )}
        </SheetContent>
      </Sheet>
      </>
      )}
    </div>
  );
}
