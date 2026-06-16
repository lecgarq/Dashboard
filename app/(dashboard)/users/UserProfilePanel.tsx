"use client";

/**
 * UserProfilePanel — the single, shared user-detail "tab".
 *
 * Renders the same rich ACC profile that /users shows (AccProfileFull), but fed
 * from an in-memory synced BulkAccUser via bulkUserToProfileData — so it opens
 * INSTANTLY with no getAccProfile round trip. The manual Refresh button is the
 * only path that fetches live from Autodesk.
 *
 * variant:
 *   - "dialog" — embedded inside the /users PersonDetailModal (modal owns chrome).
 *   - "rail"   — mounted in the access-analysis right rail; fixed w-96 (camera
 *                stability) with its own header + close button + scroll.
 */

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { trpc } from "@/lib/core/trpc";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import {
  AccProfileFull,
  AccLoadingProgress,
  type AccProfileData,
} from "./AccProfileSection";
import { bulkUserToProfileData } from "./bulkUserToProfileData";
import { ProfileAvatar } from "./ProfileAvatar";

export interface UserProfilePanelProps {
  user: BulkAccUser | null;
  email: string;
  onClose?: () => void;
  variant?: "dialog" | "rail";
}

export function UserProfilePanel({
  user,
  email,
  onClose,
  variant = "dialog",
}: UserProfilePanelProps): React.JSX.Element {
  const utils = trpc.useUtils();
  const [override, setOverride] = useState<AccProfileData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const baseData: AccProfileData | null =
    user && user.found ? bulkUserToProfileData(user) : null;
  const data = override ?? baseData;

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

  const body =
    refreshing && !data ? (
      <AccLoadingProgress />
    ) : data ? (
      <AccProfileFull data={data} email={email} onRefresh={handleRefresh} />
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
    return <div data-testid="user-detail-panel">{body}</div>;
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
