"use client";

/**
 * UserProfilePanel — the single, shared user-detail "tab".
 *
 * Renders the same rich ACC profile that /users shows (AccProfileFull), but fed
 * from an in-memory synced BulkAccUser via bulkUserToProfileData — so it opens
 * INSTANTLY with no getAccProfile round trip. The manual Refresh button is the
 * only path that fetches live from Autodesk.
 *
 * G4 fix: in dialog variant the panel additionally fetches the FULL (non-lean)
 * BulkAccUser from accDcGraph.bulkUser — a local DC snapshot proc with no live
 * Autodesk call — so per-project roles[] and modules[] are populated automatically.
 * The panel renders the lean base data immediately (instant open), then enriches
 * the ACC section when the full data arrives. A subtle "loading details…" indicator
 * is shown on the ACC section header while the fetch is in flight.
 *
 * variant:
 *   - "dialog" — embedded inside the /users PersonDetailModal (modal owns chrome).
 *   - "rail"   — mounted in the access-analysis right rail; fixed w-96 (camera
 *                stability) with its own header + close button + scroll.
 */

import { useState } from "react";
import { RefreshCw, Mail, Building2, Briefcase, Phone, DollarSign, Loader2 } from "lucide-react";
import { trpc } from "@/lib/core/trpc";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { AccProfileFull, AccLoadingProgress } from "./AccProfileSection";
import type { AccProfileData } from "./statCardTypes";
import { bulkUserToProfileData } from "./bulkUserToProfileData";
import { ProfileAvatar } from "./ProfileAvatar";
import { Badge } from "@/components/ui/badge";
import type { OrgPerson } from "./directoryUtils";
import { PersonAvatar } from "./PersonAvatar";

export interface UserProfilePanelProps {
  user: BulkAccUser | null;
  email: string;
  onClose?: () => void;
  variant?: "dialog" | "rail";
  /** Optional org-directory person record. When supplied in dialog variant, renders
   *  the person header chrome (gradient banner, avatar, name, job title, badge tags,
   *  contact rows) above the ACC profile body. Omitting it preserves the prior
   *  behavior — no chrome rendered. Rail variant ignores this prop. */
  person?: OrgPerson;
}

export function UserProfilePanel({
  user,
  email,
  onClose,
  variant = "dialog",
  person,
}: UserProfilePanelProps): React.JSX.Element {
  const utils = trpc.useUtils();
  const [override, setOverride] = useState<AccProfileData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // G4: fetch the full (non-lean) BulkAccUser from the DC snapshot so per-project
  // roles[] and modules[] are populated automatically — no Autodesk API call.
  // Only enabled in dialog variant (rail panels don't need the enrichment).
  const { data: fullBulkUser, isLoading: fullUserLoading } =
    trpc.accDcGraph.bulkUser.useQuery(
      { email },
      {
        enabled: variant === "dialog" && !!email,
        staleTime: 5 * 60_000,
      },
    );

  // Derive display data: Refresh override wins; otherwise use the full DC snapshot
  // if available (has real roles/modules and email matches); fall back to lean
  // in-memory user.
  const baseData: AccProfileData | null = (() => {
    if (override) return override;
    if (
      fullBulkUser &&
      fullBulkUser.found &&
      fullBulkUser.email.toLowerCase() === email.toLowerCase()
    ) {
      return bulkUserToProfileData(fullBulkUser);
    }
    if (user && user.found) return bulkUserToProfileData(user);
    return null;
  })();

  function handleRefresh(): void {
    setRefreshing(true);
    utils.users.getAccProfile
      .fetch({ email, forceRefresh: true })
      .then((fresh) => {
        if (fresh && (fresh as AccProfileData).found) {
          setOverride(fresh as AccProfileData);
        }
      })
      .catch(() => {
        /* keep showing synced data on refresh failure */
      })
      .finally(() => setRefreshing(false));
  }

  // G4: true when the full-user fetch is in-flight (dialog only; rail skips it)
  const detailLoading = variant === "dialog" && fullUserLoading && !fullBulkUser;

  const body =
    refreshing && !baseData ? (
      <AccLoadingProgress />
    ) : baseData ? (
      <>
        {detailLoading && (
          <div
            data-testid="acc-detail-loading"
            className="mt-6 pt-4 flex items-center gap-2 text-xs text-muted-foreground/60"
          >
            <Loader2 size={12} className="animate-spin shrink-0" />
            Loading project details…
          </div>
        )}
        <AccProfileFull data={baseData} email={email} onRefresh={handleRefresh} />
      </>
    ) : (
      <div className="mt-6 pt-5 border-t-2 border-border/50">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
            Autodesk ACC
          </h3>
          <button
            type="button"
            onClick={handleRefresh}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
        <p className="text-sm text-muted-foreground">Not synced yet</p>
        <p className="mt-1 text-[11px] text-muted-foreground/60">
          This user has no synced ACC snapshot. Refresh to pull live, or wait for
          the next automatic sync.
        </p>
      </div>
    );

  if (variant === "dialog") {
    return (
      <div data-testid="user-detail-panel">
        {person && (
          <div data-testid="person-chrome-header">
            {/* Gradient banner with centered avatar */}
            <div className="h-20 bg-gradient-to-br from-primary/25 via-chart-4/15 to-primary/8 relative shrink-0 -mx-6 -mt-6 mb-0">
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
                <PersonAvatar person={person} size="lg" />
              </div>
            </div>

            {/* Name, job title, badge tags, contact rows */}
            <div className="pt-12 pb-4">
              <div className="text-center mb-5">
                <h2 className="text-lg font-bold">{person.displayName}</h2>
                {person.jobTitle && (
                  <p className="text-sm text-muted-foreground mt-0.5">{person.jobTitle}</p>
                )}
              </div>

              {/* Department / cost-center badge tags */}
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

              {/* Contact info rows */}
              <div className="space-y-3 pt-4 border-t border-border/30">
                <div className="group/row flex items-center gap-2 text-muted-foreground text-sm">
                  <Mail size={13} className="shrink-0 text-primary/50" />
                  <a
                    href={`mailto:${person.email}`}
                    className="hover:text-primary truncate transition-colors"
                  >
                    {person.email}
                  </a>
                </div>
                {person.department && (
                  <div className="group/row flex items-center gap-2 text-muted-foreground text-sm">
                    <Building2 size={13} className="shrink-0 text-primary/50" />
                    <span className="truncate">{person.department}</span>
                  </div>
                )}
                {person.jobTitle && (
                  <div className="group/row flex items-center gap-2 text-muted-foreground text-sm">
                    <Briefcase size={13} className="shrink-0 text-primary/50" />
                    <span className="truncate">{person.jobTitle}</span>
                  </div>
                )}
                {person.costCenter && (
                  <div className="group/row flex items-center gap-2 text-muted-foreground text-sm">
                    <DollarSign size={13} className="shrink-0 text-primary/50" />
                    <span className="truncate">{person.costCenter}</span>
                  </div>
                )}
                {person.phoneNumber && (
                  <div className="group/row flex items-center gap-2 text-muted-foreground text-sm">
                    <Phone size={13} className="shrink-0 text-primary/50" />
                    <a
                      href={`tel:${person.phoneNumber}`}
                      className="hover:text-primary truncate transition-colors"
                    >
                      {person.phoneNumber}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {body}
      </div>
    );
  }

  // rail: fills the resizable RightPanelStack column (width owned by the parent).
  return (
    <aside
      data-testid="user-detail-panel"
      className="flex h-full w-full shrink-0 flex-col border-l border-border/30 bg-card"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProfileAvatar name={user?.name} email={email} photoUrl={user?.photoUrl} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold" title={user?.name || email}>
              {user?.name || email}
            </h2>
            <p className="truncate text-xs text-muted-foreground" title={email}>
              {email}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
          >
            Close
          </button>
        )}
      </header>
      <div className="flex-1 overflow-y-auto px-4 pb-6">{body}</div>
    </aside>
  );
}
