"use client";

/**
 * UserProfilePanel — the single, shared user-detail "tab".
 *
 * Renders the same rich ACC profile that /users shows (AccProfileFull), but fed
 * from an in-memory synced BulkAccUser via bulkUserToProfileData — so it opens
 * INSTANTLY with no getAccProfile round trip.
 *
 * G4 fix: in dialog variant the panel additionally fetches the FULL (non-lean)
 * BulkAccUser from accDcGraph.bulkUser — a local DC snapshot proc with no live
 * Autodesk call — so per-project roles[] and modules[] are populated automatically.
 * The panel renders the lean base data immediately (instant open), then enriches
 * the ACC section when the full data arrives. A subtle "loading details…" indicator
 * is shown on the ACC section header while the fetch is in flight.
 *
 * Freshness fix (2026-07-07): the DC snapshot can lag weeks behind the DC ingest
 * cadence (observed 33 days), which left roles/modules stale until the manual
 * Refresh. The dialog now ALSO queries users.getAccProfile — server-side it
 * serves the member cache when <1h old and otherwise fetches live from ACC and
 * re-caches — and baseData prefers whichever source has the newer syncedAt. The
 * panel still opens instantly from the snapshot, then upgrades in place. The
 * Refresh button remains the immediate force-live path.
 *
 * variant:
 *   - "dialog" — embedded inside the /users PersonDetailModal (modal owns chrome).
 *   - "rail"   — mounted in the access-analysis right rail; fixed w-96 (camera
 *                stability) with its own header + close button + scroll.
 */

import { useState, type ReactNode } from "react";
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
  /** Rail-only content rendered after the single identity header and before ACC details. */
  railPrelude?: ReactNode;
}

export function UserProfilePanel({
  user,
  email,
  onClose,
  variant = "dialog",
  person,
  railPrelude,
}: UserProfilePanelProps): React.JSX.Element {
  const utils = trpc.useUtils();
  const [override, setOverride] = useState<AccProfileData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch one full user snapshot on demand. The rail deliberately does not load
  // the multi-user directory payload before a node is selected.
  const { data: fullBulkUser, isLoading: fullUserLoading } =
    trpc.accDcGraph.bulkUser.useQuery(
      { email },
      {
        enabled: !!email && (variant === "dialog" || user === null),
        staleTime: 5 * 60_000,
      },
    );

  // Self-healing profile source: member cache when <1h old, otherwise a live ACC
  // fetch server-side. retry:false — on APS credential/permission errors the DC
  // snapshot below still renders, and the Refresh button is the manual retry.
  const { data: cachedProfile, isLoading: profileLoading } =
    trpc.users.getAccProfile.useQuery(
      { email },
      {
        enabled: variant === "dialog" && !!email,
        staleTime: 5 * 60_000,
        retry: false,
      },
    );

  // Derive display data: Refresh override wins; otherwise the NEWER of the
  // member-cache profile vs the full DC snapshot (the snapshot can lag weeks
  // behind ingest); fall back to the lean in-memory user.
  const baseData: AccProfileData | null = (() => {
    if (override) return override;
    const candidates: AccProfileData[] = [];
    const profile = cachedProfile as AccProfileData | undefined;
    if (profile?.found) candidates.push(profile);
    if (
      fullBulkUser &&
      fullBulkUser.found &&
      fullBulkUser.email.toLowerCase() === email.toLowerCase()
    ) {
      candidates.push(bulkUserToProfileData(fullBulkUser));
    }
    if (candidates.length > 0) {
      // ISO timestamps — lexicographic compare is chronological.
      candidates.sort((a, b) => (b.syncedAt ?? "").localeCompare(a.syncedAt ?? ""));
      return candidates[0];
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

  const resolvedUser = fullBulkUser ?? user;

  const detailLoading =
    (fullUserLoading && !fullBulkUser) ||
    (variant === "dialog" && profileLoading && !cachedProfile);

  const body =
    (refreshing || detailLoading) && !baseData ? (
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
      <header
        data-testid="user-detail-header"
        className="flex items-center justify-between gap-2 border-b border-border/30 px-4 py-3"
      >
        <div className="flex min-w-0 items-center gap-3">
          <ProfileAvatar name={resolvedUser?.name} email={email} photoUrl={resolvedUser?.photoUrl} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold" title={resolvedUser?.name || email}>
              {resolvedUser?.name || email}
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
      <div className="flex-1 overflow-y-auto">
        {railPrelude}
        <div data-testid="acc-profile-body" className="px-4 pb-6">
          {body}
        </div>
      </div>
    </aside>
  );
}
