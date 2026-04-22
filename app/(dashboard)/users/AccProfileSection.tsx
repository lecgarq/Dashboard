"use client";

import { useState, useEffect, useRef } from "react";
import { AlertCircle, RefreshCw, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";

// ---------------------------------------------------------------------------
// AccLoadingProgress
// ---------------------------------------------------------------------------

const LOAD_STEPS = [
  { label: "Connecting to Autodesk", until: 20 },
  { label: "Verifying account access", until: 40 },
  { label: "Fetching projects", until: 65 },
  { label: "Loading modules", until: 88 },
  { label: "Almost done", until: 95 },
];

function AccLoadingProgress() {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    // Eases toward 95% over ~4s, slowing as it approaches the cap
    function tick(ts: number) {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      // Exponential ease: approaches 95 asymptotically over ~5s
      const target = 95 * (1 - Math.exp(-elapsed / 3500));
      setProgress(Math.min(target, 95));
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const activeStep = LOAD_STEPS.find((s) => progress < s.until) ?? LOAD_STEPS[LOAD_STEPS.length - 1];

  return (
    <div className="pt-4 border-t border-border space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Autodesk ACC
        </h3>
        <span className="text-[10px] font-mono text-primary/60 tabular-nums">
          {Math.round(progress)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-1 rounded-full bg-muted/30 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary/60 transition-none"
          style={{ width: `${progress}%` }}
        />
        {/* shimmer */}
        <div
          className="absolute inset-y-0 w-16 rounded-full bg-gradient-to-r from-transparent via-primary/30 to-transparent animate-shimmer"
          style={{ left: `calc(${progress}% - 2rem)` }}
        />
      </div>

      {/* Current step label */}
      <p className="text-[10px] text-muted-foreground/50 animate-pulse">
        {activeStep.label}…
      </p>

      {/* Step dots */}
      <div className="flex items-center gap-1.5">
        {LOAD_STEPS.map((s) => (
          <div
            key={s.label}
            className={cn(
              "h-1 rounded-full transition-all duration-500",
              progress >= s.until
                ? "bg-primary/60 w-4"
                : progress >= s.until - 20
                  ? "bg-primary/30 w-2"
                  : "bg-muted/30 w-1"
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product name mapping
// ---------------------------------------------------------------------------

const PRODUCT_NAMES: Record<string, string> = {
  documentManagement: "Document Management",
  fieldManagement: "Field Management",
  build: "Build",
  docs: "Docs",
  cost: "Cost Management",
  designCollaboration: "Design Collaboration",
  insight: "Insight",
  quantification: "Quantification",
};

function getProductDisplayName(rawName: string) {
  return PRODUCT_NAMES[rawName] ?? rawName;
}

// ---------------------------------------------------------------------------
// AccProfileFull — extracted so hooks run unconditionally
// ---------------------------------------------------------------------------

type AccProfileData = {
  found: true;
  status: string;
  name?: string;
  autodeskId?: string;
  syncedAt: string;
  role?: string;
  projects?: Array<{ id: string; name: string; status: string; isAdmin: boolean; roles: string[] }>;
  products?: Array<{ key: string; name: string; projectIds?: string[] }>;
};

function AccProfileFull({
  data,
  onRefresh,
}: {
  data: AccProfileData;
  onRefresh: () => void;
}) {
  const products = data.products ?? [];
  const projects = data.projects ?? [];

  // Build a map: projectId → module names active on that project
  const modulesByProject = new Map<string, string[]>();
  for (const product of products) {
    for (const pid of (product.projectIds ?? [])) {
      if (!modulesByProject.has(pid)) modulesByProject.set(pid, []);
      modulesByProject.get(pid)!.push(getProductDisplayName(product.name));
    }
  }

  return (
    <div className="pt-4 border-t border-border space-y-3">
      {/* Header: label + status badge + role + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Autodesk ACC
          </h3>
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] px-1.5 py-0",
              data.status === "active"
                ? "text-green-400 border-green-400/20"
                : "text-muted-foreground"
            )}
          >
            {data.status}
          </Badge>
          {data.role && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-primary/20 text-primary/70 capitalize"
            >
              {data.role.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
        <button
          onClick={onRefresh}
          className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors"
        >
          <RefreshCw size={10} />
          Refresh
        </button>
      </div>

      {/* Projects with per-project modules */}
      {projects.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
            Projects ({projects.length})
          </p>
          {projects.map((proj) => {
            const mods = modulesByProject.get(proj.id) ?? [];
            return (
              <div
                key={proj.id}
                className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Building2 size={10} className="text-primary/50 shrink-0" />
                    <p className="text-[11px] font-medium text-foreground truncate">{proj.name}</p>
                  </div>
                  {proj.isAdmin && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/20 text-primary/70 shrink-0">
                      Admin
                    </Badge>
                  )}
                </div>
                {proj.roles.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {proj.roles.map((role) => (
                      <span
                        key={role}
                        className="inline-flex items-center text-[10px] px-1.5 py-0 rounded-full border border-primary/15 bg-primary/5 text-primary/60"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                )}
                {mods.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {mods.map((mod) => (
                      <span
                        key={mod}
                        className="inline-flex items-center text-[10px] px-1.5 py-0 rounded-full border border-green-400/20 bg-green-400/5 text-green-400/80"
                      >
                        {mod}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/30">
        Synced {new Date(data.syncedAt).toLocaleDateString()}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AccProfileSection component
// ---------------------------------------------------------------------------

export function AccProfileSection({ email }: { email: string }) {
  const [forceRefresh, setForceRefresh] = useState(false);

  const { data, isLoading, error, isFetching } = trpc.users.getAccProfile.useQuery(
    { email, forceRefresh },
    { staleTime: 5 * 60 * 1000, retry: false }
  );

  function handleRefresh() {
    setForceRefresh(true);
    // Reset after a tick so subsequent opens don't always force-refresh
    setTimeout(() => setForceRefresh(false), 200);
  }

  // 1. Loading
  if (isLoading || isFetching) {
    return <AccLoadingProgress />;
  }

  // 2. UNAUTHORIZED — token expired, missing, or Autodesk not linked
  if (error?.data?.code === "UNAUTHORIZED") {
    return (
      <div className="pt-4 border-t border-border">
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Autodesk not connected</p>
            <p className="text-[10px] text-amber-400/70 mt-0.5">
              Link your Autodesk account in Settings to view ACC data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 3. FORBIDDEN — valid token but no Account Admin privilege in the hub
  if (error?.data?.code === "FORBIDDEN") {
    return (
      <div className="pt-4 border-t border-border">
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Account Admin privileges required</p>
            <p className="text-[10px] text-amber-400/70 mt-0.5">
              Ensure your Autodesk account is an Account Admin in the hub to view ACC data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 4. Other error
  if (error) {
    return (
      <div className="pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground/60">Failed to load ACC data.</p>
      </div>
    );
  }

  // 4. Not found
  if (data && !data.found) {
    return (
      <div className="pt-4 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Autodesk ACC
          </h3>
          <button
            onClick={handleRefresh}
            className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors"
          >
            <RefreshCw size={10} />
            Refresh
          </button>
        </div>
        <p className="text-xs text-muted-foreground/60">Not found in ACC hub</p>
        <p className="text-[10px] text-muted-foreground/40 mt-0.5">
          Last checked: {new Date(data.syncedAt).toLocaleDateString()}
        </p>
      </div>
    );
  }

  // 5. Full profile
  if (data?.found === true) {
    return (
      <AccProfileFull data={data as AccProfileData} onRefresh={handleRefresh} />
    );
  }

  // No data yet (initial state before query resolves)
  return null;
}
