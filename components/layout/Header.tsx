"use client";

import { useDashboardAuth } from "@/components/providers/dashboard-auth-provider";
import { Sparkles } from "lucide-react";

export function Header({ title }: { title: string }) {
  const { user, role } = useDashboardAuth();
  const firstName = user?.name?.split(" ")[0] ?? "Team";
  const roleLabel = role ? role.charAt(0) + role.slice(1).toLowerCase() : "Member";

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border/60 bg-card/70 shadow-[var(--shadow-elevated)] backdrop-blur-xl">
      <div className="flex min-h-20 items-center justify-between gap-4 px-6 py-4">
        <div className="animate-fade-down space-y-2">
          <div className="surface-chip inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.26em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Live workspace
          </div>
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold tracking-[-0.04em] text-primary">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {firstName}. {roleLabel} access is active.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="surface-chip hidden rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground lg:inline-flex">
            Role: {roleLabel}
          </div>
          <div className="surface-chip hidden items-center gap-2 rounded-full px-4 py-2 text-sm text-muted-foreground lg:flex">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulseGlow" />
            Focus mode on
          </div>
        </div>
      </div>
    </header>
  );
}
