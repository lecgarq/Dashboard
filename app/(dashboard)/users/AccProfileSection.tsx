"use client";

import { useState } from "react";
import { AlertCircle, RefreshCw, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/core/utils";
import { trpc } from "@/lib/core/trpc";

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

  // 1. Loading skeleton
  if (isLoading || isFetching) {
    return (
      <div className="space-y-2 pt-4 border-t border-border animate-pulse">
        <div className="h-3 bg-muted/40 rounded w-1/3" />
        <div className="h-2.5 bg-muted/30 rounded w-2/3" />
        <div className="h-2.5 bg-muted/30 rounded w-1/2" />
      </div>
    );
  }

  // 2. 403 / PRECONDITION_FAILED — no Account Admin privilege
  if (error?.data?.code === "PRECONDITION_FAILED") {
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

  // 3. Other error
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
      <div className="pt-4 border-t border-border space-y-3">
        {/* Header: label + status badge + refresh */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
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
          </div>
          <button
            onClick={handleRefresh}
            className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1 transition-colors"
          >
            <RefreshCw size={10} />
            Refresh
          </button>
        </div>

        {/* Projects */}
        {(data.projects ?? []).length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
              Projects ({(data.projects ?? []).length})
            </p>
            {(data.projects ?? []).map((proj) => (
              <div
                key={proj.id}
                className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2 space-y-1"
              >
                <div className="flex items-center gap-1.5">
                  <Building2 size={10} className="text-primary/50 shrink-0" />
                  <p className="text-[11px] font-medium text-foreground truncate">{proj.name}</p>
                </div>
                {proj.roles.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {proj.roles.map((role) => (
                      <Badge
                        key={role.id}
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 border-primary/20 text-primary/70"
                      >
                        {role.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Products */}
        {(data.products ?? []).length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
              Products / Modules
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(data.products ?? []).map((product) => (
                <span
                  key={product.id}
                  className={cn(
                    "inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border",
                    product.status === "active"
                      ? "border-green-400/20 bg-green-400/5 text-green-400"
                      : "border-border text-muted-foreground/50"
                  )}
                >
                  {getProductDisplayName(product.name)}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/30">
          Synced {new Date(data.syncedAt).toLocaleDateString()}
        </p>
      </div>
    );
  }

  // No data yet (initial state before query resolves)
  return null;
}
