"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Search, Activity, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/core/utils";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { normalize } from "./directoryUtils";
import { formatDistanceToNowStrict } from "date-fns";

const UserActivityBody = dynamic<{ email: string; users: BulkAccUser[] }>(
  () => import("./dashboard/DashboardSidePanel").then((m) => m.UserActivityBody),
  { ssr: false, loading: () => <div className="h-80 rounded-xl bg-muted/20 animate-pulse" /> },
);

export function ActivityAuditPanel({
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
